import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';
import {SALES_REPS, type SalesRepId} from '~/lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// /api/conversion-stats
// ─────────────────────────────────────────────────────────────────────────────
// GET ?month=YYYY-MM (default: current NJ-local month)
//   → {
//       ok, month, range: {start, end},
//       company: { contacted, byStage: {hot,warm,new,cold}, converted, revenue },
//       reps: { sky: {...}, pete: {...} }
//     }
//
// Powers the Funnel tab on /sales-floor and /new-business. Per Reid 2026-04-27:
//   • show both reps side-by-side for friendly competition
//   • everyone sees rep-level AND company-level
//
// Attribution model:
//   • Lead Owner.email is mapped to a rep id via the registry. Owner email
//     "sky@highsman.com" → 'sky', "peter@highsman.com" → 'pete'. Anything
//     else → 'unassigned' (counted in company totals only).
//   • "Contacted in window" = Last_Activity_Time falls inside the month.
//   • "By stage" = open Leads only (Converted=false) bucketed by _status
//     (hot/warm/new/cold) — gives a snapshot of what's still in the pipeline.
//   • "Converted in window" = Lead.Converted=true AND Modified_Time in window
//     (Zoho doesn't expose a clean Converted_Time field, but Modified_Time
//     bumps on conversion and is the closest proxy that's always populated).
//   • "Revenue" = sum of Deals.Amount for Deals whose Lead_Id (set by the
//     convertLead action) was a Lead converted in window. Falls through to
//     Closing_Date in window if Lead_Id linkage isn't available.
//
// Soft-degradation: if Zoho is unavailable, returns ok:true with zeroed
// numbers so the dashboard still renders cleanly.
// ─────────────────────────────────────────────────────────────────────────────

const ZOHO_CRM_BASE = 'https://www.zohoapis.com/crm/v7';

type StageBucket = 'hot' | 'warm' | 'new' | 'cold';

type FunnelMetrics = {
  contacted: number;
  byStage: Record<StageBucket, number>;
  converted: number;
  revenue: number;
};

type FunnelResponse = {
  ok: boolean;
  month: string;          // YYYY-MM
  range: {start: string; end: string}; // ISO with NJ offset
  company: FunnelMetrics;
  reps: Record<SalesRepId, FunnelMetrics>;
  warning?: string;
};

function emptyMetrics(): FunnelMetrics {
  return {
    contacted: 0,
    byStage: {hot: 0, warm: 0, new: 0, cold: 0},
    converted: 0,
    revenue: 0,
  };
}

// Same Lead_Status → temperature mapping the rest of the app uses (sales-floor
// + new-business). Kept duplicated to avoid an import cycle into one of the
// 1000-line route files; keep in sync if Zoho's picklist changes.
function normalizeLeadStatus(raw: unknown): StageBucket {
  const s = String(raw || '').toLowerCase();
  if (['qualified', 'hot', 'ready to buy'].includes(s)) return 'hot';
  if (['working - contacted', 'contact in future', 'warm', 'nurturing'].includes(s)) return 'warm';
  if (['unqualified', 'junk lead', 'cold', 'lost lead'].includes(s)) return 'cold';
  return 'new';
}

// NJ-local YYYY-MM-DD for the current moment, used to default `month` when
// the caller doesn't pass one.
function defaultMonth(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return `${y}-${m}`;
}

// Resolve [start, end] ISO instants for a given YYYY-MM, NJ-local.
function monthRangeNJ(month: string): {start: string; end: string} {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  // NJ is UTC-04 in DST, UTC-05 otherwise. The OFFSET only matters for
  // boundary minutes; using -04:00 year-round here is "good enough" given
  // we're querying a whole month — boundary slop of one hour can't cross a
  // month boundary in practice.
  const start = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-01T00:00:00-04:00`;
  // First of next month
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY.toString().padStart(4, '0')}-${nextM.toString().padStart(2, '0')}-01T00:00:00-04:00`;
  return {start, end};
}

function inRange(iso: string | null | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= Date.parse(start) && t < Date.parse(end);
}

// Map Owner.email → rep id. Used only as a fallback now — Working_Owner
// (the custom rep-id field set by /api/lead-claim) is the primary signal.
function ownerEmailToRep(ownerEmail: string | null | undefined): SalesRepId | null {
  const e = String(ownerEmail || '').toLowerCase();
  if (!e) return null;
  for (const rep of Object.values(SALES_REPS)) {
    if (rep.email.toLowerCase() === e) return rep.id;
  }
  return null;
}

// Map Working_Owner (the custom field /api/lead-claim writes) → rep id.
// This is a string like "sky" / "pete" so we just validate it's a known rep.
// Reading this first (vs Owner.email) lets us correctly attribute Pete's
// work even when Pete isn't a Zoho CRM user — only Sky is.
function workingOwnerToRep(workingOwner: string | null | undefined): SalesRepId | null {
  const id = String(workingOwner || '').trim().toLowerCase() as SalesRepId;
  if (id && (SALES_REPS as Record<string, unknown>)[id]) return id;
  return null;
}

// Resolve the rep that should get credit for a Lead. Working_Owner wins —
// it's the rep who actually claimed/heartbeat-ed the lead via the dashboard.
// Owner.email is the fallback for legacy leads that pre-date the claim flow
// (or any future flow where a Zoho user is owner but no working-rep claim
// has happened yet).
function attributeLead(lead: any): SalesRepId | null {
  return (
    workingOwnerToRep(lead?.Working_Owner) ||
    ownerEmailToRep(lead?.Owner?.email)
  );
}

// Paginated read of every Lead the API token can see. Returns minimal fields
// for funnel math. Zoho v7 caps per_page at 200; we hard-cap at 10 pages
// (2000 leads) for runtime safety — bump if Highsman's lead count outgrows it.
async function fetchAllLeads(token: string): Promise<any[]> {
  const fields = [
    'id',
    'Lead_Status',
    'Last_Activity_Time',
    'Modified_Time',
    'Created_Time',
    'Converted',
    'Owner',
    'Company',
    // Working_Owner is set by /api/lead-claim every time a rep claims or
    // heartbeats a lead. We read it first when attributing per-rep numbers
    // so non-Zoho-user reps (Pete today) still get correct credit.
    'Working_Owner',
  ].join(',');
  const out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${ZOHO_CRM_BASE}/Leads?fields=${fields}&page=${page}&per_page=200&sort_by=Modified_Time&sort_order=desc`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204) break;
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    out.push(...rows);
    if (!data?.info?.more_records) break;
  }
  return out;
}

// Pull Closed Won deals with Closing_Date in window. The convert flow tags
// each Deal with the converted-from Lead via Zoho's built-in Lead_Id field;
// when present we attribute revenue back to that Lead's Owner. Otherwise the
// Deal's own Owner is used.
async function fetchDealsInWindow(
  token: string,
  start: string,
  end: string,
): Promise<any[]> {
  // Zoho criteria can't compare datetime ranges directly on Closing_Date
  // (it's a date field); use yyyy-mm-dd boundaries.
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const criteria = encodeURIComponent(
    `((Closing_Date:greater_equal:${startDate})and(Closing_Date:less_than:${endDate}))`,
  );
  const fields = ['id', 'Amount', 'Closing_Date', 'Stage', 'Owner', 'Lead_Id'].join(',');
  const url = `${ZOHO_CRM_BASE}/Deals/search?criteria=${criteria}&fields=${fields}&per_page=200`;
  const out: any[] = [];
  let page = 1;
  while (page <= 10) {
    const res = await fetch(`${url}&page=${page}`, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204) break;
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    out.push(...rows);
    if (!data?.info?.more_records) break;
    page += 1;
  }
  return out;
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const month = (url.searchParams.get('month') || defaultMonth()).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return json({ok: false, error: 'month must be YYYY-MM'}, {status: 400});
  }
  const range = monthRangeNJ(month);

  const env = (context as any).env || {};
  const empty: FunnelResponse = {
    ok: true,
    month,
    range,
    company: emptyMetrics(),
    reps: {sky: emptyMetrics(), pete: emptyMetrics()},
  };

  let token: string;
  try {
    token = await getZohoAccessToken(env);
  } catch (err: any) {
    return json({...empty, ok: false, warning: 'Zoho unavailable — showing zeroed funnel.', error: err?.message});
  }

  try {
    const [leads, deals] = await Promise.all([
      fetchAllLeads(token),
      fetchDealsInWindow(token, range.start, range.end),
    ]);

    const company = emptyMetrics();
    const byRep: Record<SalesRepId, FunnelMetrics> = {
      sky: emptyMetrics(),
      pete: emptyMetrics(),
    };

    // Index leads by id so the deals revenue pass can attribute back to the
    // owner of the originating Lead when Lead_Id is set.
    const leadById = new Map<string, any>();
    for (const l of leads) leadById.set(String(l.id), l);

    for (const l of leads) {
      const rep = attributeLead(l);
      const status = normalizeLeadStatus(l.Lead_Status);
      const isConverted = Boolean(l.Converted);

      // By-stage uses open Leads only — converted Leads aren't part of the
      // current pipeline anymore.
      if (!isConverted) {
        company.byStage[status] += 1;
        if (rep) byRep[rep].byStage[status] += 1;
      }

      // Contacted-in-window
      if (inRange(l.Last_Activity_Time, range.start, range.end)) {
        company.contacted += 1;
        if (rep) byRep[rep].contacted += 1;
      }

      // Converted-in-window — Modified_Time bumps on the convertLead action
      // and is the closest proxy Zoho exposes (no Converted_Time field on the
      // Leads module by default).
      if (isConverted && inRange(l.Modified_Time, range.start, range.end)) {
        company.converted += 1;
        if (rep) byRep[rep].converted += 1;
      }
    }

    // Revenue = sum of Closed Won deal amounts attributed back to either
    // (a) the originating Lead's Owner via Lead_Id, or (b) the Deal's Owner.
    for (const d of deals) {
      const stage = String(d?.Stage || '').toLowerCase();
      if (stage !== 'closed won') continue;
      const amount = Number(d?.Amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      company.revenue += amount;

      let rep: SalesRepId | null = null;
      const leadId = d?.Lead_Id?.id ? String(d.Lead_Id.id) : '';
      if (leadId && leadById.has(leadId)) {
        // Same priority: Working_Owner first (works for non-Zoho-user reps),
        // then the originating Lead's Owner.email as a fallback.
        rep = attributeLead(leadById.get(leadId));
      }
      if (!rep) rep = ownerEmailToRep(d?.Owner?.email);
      if (rep) byRep[rep].revenue += amount;
    }

    const out: FunnelResponse = {
      ok: true,
      month,
      range,
      company,
      reps: byRep,
    };
    return json(out, {headers: {'Cache-Control': 'private, max-age=60'}});
  } catch (err: any) {
    console.error('[api/conversion-stats] failed', err.message);
    return json({...empty, ok: false, warning: err?.message || 'funnel fetch failed'}, {status: 502});
  }
}
