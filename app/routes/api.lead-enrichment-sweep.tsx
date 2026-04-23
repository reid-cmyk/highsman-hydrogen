import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-enrichment-sweep  (scheduled, nightly)
// ─────────────────────────────────────────────────────────────────────────────
// POST | GET → { ok, scanned, enriched: [...], skipped: [...] }
//
// Nightly sweep of Zoho Leads missing Phone / Mobile / Email / LinkedIn_URL.
// For each candidate, re-invokes /api/lead-enrichment in apply mode so the
// server-only logic (Places + Apollo + Gmail signatures + website scrape)
// runs under the same code path as the in-brief rep-picked apply.
//
// Auth: requires X-HS-Scheduler header matching SALES_FLOOR_SCHEDULER_TOKEN.
// Budget: SWEEP_BATCH leads per run so a single cron tick never blows past
// the Apollo / Places quotas. The cron runs ~1x/day so a 50-lead budget
// clears the ~300-lead active NJ pool inside a week even if every lead
// needs enrichment.
//
// Slack ping: optional summary post to SLACK_SALES_FLOOR_WEBHOOK — "Nightly
// enrichment: 23 leads scanned, 8 enriched, 15 had nothing new."
//
// Companion memory: project_highsman_brand_guidelines.md (Voice is
// informational — one line, no emoji.)
// ─────────────────────────────────────────────────────────────────────────────

const SWEEP_BATCH = 50; // per-run cap
const REQUEST_TIMEOUT_MS = 25_000; // worker runtime ceiling guardrail

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sweep run timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function run(request: Request, env: Record<string, string | undefined>) {
  const schedulerToken = env.SALES_FLOOR_SCHEDULER_TOKEN;
  const provided = request.headers.get('X-HS-Scheduler') || '';
  if (!schedulerToken || provided !== schedulerToken) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  let token: string;
  try {
    token = await getZohoAccessToken(env);
  } catch (e: any) {
    return json({ok: false, error: `Zoho auth: ${e.message}`}, {status: 502});
  }

  // Find leads missing any of the enrichable fields. Zoho's COQL lets us
  // query for nulls cleanly here — far more precise than the /Leads/search
  // criteria language which has trouble with IS NULL.
  //
  // Convention: a Lead is "enrichable" if Company is present (no Company
  // = no useful signal for any source) AND at least one of the 4 target
  // fields is empty.
  const q =
    "select id, First_Name, Last_Name, Company, Phone, Mobile, Email, LinkedIn_URL, " +
    "Website, City, State, Created_Time from Leads " +
    "where (Company is not null) and (" +
    "(Phone is null) or (Mobile is null) or (Email is null) or (LinkedIn_URL is null)" +
    ") " +
    "order by Created_Time desc " +
    `limit ${SWEEP_BATCH}`;

  const coqlRes = await fetch('https://www.zohoapis.com/crm/v7/coql', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({select_query: q}),
  });

  if (!coqlRes.ok) {
    const t = await coqlRes.text().catch(() => '');
    return json(
      {ok: false, error: `COQL (${coqlRes.status})`, detail: t.slice(0, 400)},
      {status: 502},
    );
  }

  const coqlData: any = await coqlRes.json().catch(() => ({}));
  const rows: any[] = Array.isArray(coqlData?.data) ? coqlData.data : [];

  const enriched: any[] = [];
  const skipped: any[] = [];

  // Fan out in serial — fanning out in parallel blew past Apollo's 5 RPS
  // ceiling in dev. One-at-a-time keeps us honest across all 4 sources.
  const origin = new URL(request.url).origin;
  for (const row of rows) {
    try {
      const r = await fetch(`${origin}/api/lead-enrichment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HS-Scheduler': schedulerToken,
        },
        body: JSON.stringify({
          leadId: row.id,
          mode: 'apply',
          // Nightly leaves onlyFields undefined → high-confidence only.
          // The rep-facing chip passes onlyFields and relaxes confidence.
        }),
      });
      const data = await r.json().catch(() => ({ok: false}));
      // /api/lead-enrichment returns applied as Candidate[], each with a
      // `field` + `value` + `source`. Map to a compact string list for
      // the Slack summary.
      const appliedList: string[] = Array.isArray(data?.applied)
        ? data.applied
            .map((c: any) => (c && c.field ? String(c.field) : ''))
            .filter(Boolean)
        : [];
      if (appliedList.length > 0) {
        enriched.push({
          leadId: row.id,
          company: row.Company || '',
          applied: appliedList,
        });
      } else {
        skipped.push({
          leadId: row.id,
          company: row.Company || '',
          reason: data?.error || 'no high-confidence matches',
        });
      }
    } catch (e: any) {
      skipped.push({
        leadId: row.id,
        company: row.Company || '',
        reason: `fetch failed: ${e?.message || 'unknown'}`,
      });
    }
  }

  // Slack summary (fire-and-forget)
  const slack = env.SLACK_SALES_FLOOR_WEBHOOK;
  if (slack && rows.length > 0) {
    try {
      await fetch(slack, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text:
            `Nightly enrichment: ${rows.length} scanned · ` +
            `${enriched.length} enriched · ${skipped.length} no-op.` +
            (enriched.length
              ? '\n' +
                enriched
                  .slice(0, 8)
                  .map(
                    (e) =>
                      `• ${e.company || e.leadId} — wrote ${e.applied.join(', ')}`,
                  )
                  .join('\n')
              : ''),
        }),
      });
    } catch { /* non-fatal */ }
  }

  return json({
    ok: true,
    scanned: rows.length,
    enriched,
    skipped,
  });
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  try {
    return await withTimeout(run(request, env), REQUEST_TIMEOUT_MS);
  } catch (e: any) {
    return json({ok: false, error: e?.message || 'sweep failed'}, {status: 502});
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  // GET is allowed so a curl from the scheduled-task runner doesn't need
  // a body. Still gates on the scheduler token.
  const env = (context as any).env || {};
  try {
    return await withTimeout(run(request, env), REQUEST_TIMEOUT_MS);
  } catch (e: any) {
    return json({ok: false, error: e?.message || 'sweep failed'}, {status: 502});
  }
}
