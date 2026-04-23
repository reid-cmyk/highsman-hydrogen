import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';
import {isClaimLive, TTL_COLD_MS, TTL_ROLLING_MS} from './api.lead-claim';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-auto-release  (scheduled, cron every 30 min)
// ─────────────────────────────────────────────────────────────────────────────
// POST | GET → { ok, scanned, released: [...] }
//
// Scans every Zoho Lead with a non-empty Working_Owner and releases the ones
// whose claim has lapsed. Two release conditions:
//   1. Cold TTL: Working_Last_Activity_At is > 8h old
//   2. Rolling TTL: Working_Claimed_At is > 48h old (absolute cap)
//
// Either condition fires → we blank Working_Owner / Working_Claimed_At /
// Working_Last_Activity_At.
//
// Auth: requires X-HS-Scheduler header matching SALES_FLOOR_SCHEDULER_TOKEN
// env var. This route is meant to be called by the Cowork scheduled task
// runner, not by reps; the rep-facing release path is /api/lead-release.
//
// Slack ping: if a release happens, we optionally POST to SLACK_SALES_FLOOR_WEBHOOK
// so the team sees "Pete's claim on Jamie @ Premium Gas expired — back in pool"
// without anyone having to check the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

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

  // Find every Lead with a non-empty Working_Owner — that's our candidate
  // pool. We filter expired claims in JS rather than via COQL because Zoho's
  // criteria operator on datetime fields is unreliable for our use case.
  const collected: any[] = [];
  let page = 1;
  while (page <= 20) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Leads/search');
    url.searchParams.set(
      'criteria',
      '(Working_Owner:starts_with:s)OR(Working_Owner:starts_with:p)',
    );
    url.searchParams.set(
      'fields',
      'Working_Owner,Working_Claimed_At,Working_Last_Activity_At,First_Name,Last_Name,Company',
    );
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '200');
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204) break;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[lead-auto-release] search failed', res.status, t.slice(0, 200));
      break;
    }
    const data: any = await res.json();
    const rows = data?.data || [];
    collected.push(...rows);
    if (!data?.info?.more_records) break;
    page += 1;
  }

  const now = Date.now();
  const expired = collected.filter((l: any) =>
    !isClaimLive(l.Working_Claimed_At, l.Working_Last_Activity_At, now),
  );

  // Bulk release via PUT /Leads (Zoho accepts up to 100 records per call).
  const released: any[] = [];
  for (let i = 0; i < expired.length; i += 100) {
    const batch = expired.slice(i, i + 100);
    const payload = batch.map((l: any) => ({
      id: l.id,
      Working_Owner: '',
      Working_Claimed_At: null,
      Working_Last_Activity_At: null,
    }));
    const res = await fetch('https://www.zohoapis.com/crm/v7/Leads', {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data: payload, trigger: []}),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[lead-auto-release] bulk release failed', res.status, t.slice(0, 200));
      continue;
    }
    released.push(
      ...batch.map((l: any) => ({
        id: l.id,
        owner: l.Working_Owner,
        name: [l.First_Name, l.Last_Name].filter(Boolean).join(' '),
        company: l.Company || '',
        reason:
          l.Working_Claimed_At &&
          Date.now() - Date.parse(l.Working_Claimed_At) > TTL_ROLLING_MS
            ? 'rolling-48h'
            : 'cold-8h',
      })),
    );
  }

  // Slack ping — don't block on failure; the release is the important part.
  if (released.length && env.SLACK_SALES_FLOOR_WEBHOOK) {
    const lines = released.map(
      (r) => `• *${r.name || '(no name)'}*${r.company ? ` — ${r.company}` : ''} returned to pool (was ${r.owner}, ${r.reason})`,
    );
    try {
      await fetch(env.SLACK_SALES_FLOOR_WEBHOOK, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: `🎯 *Sales Floor — ${released.length} lead${released.length === 1 ? '' : 's'} returned to pool*\n${lines.join('\n')}`,
        }),
      });
    } catch (e: any) {
      console.warn('[lead-auto-release] slack ping failed', e?.message);
    }
  }

  return json({
    ok: true,
    scanned: collected.length,
    released,
    releasedCount: released.length,
    scannedAt: new Date().toISOString(),
    thresholds: {
      coldMs: TTL_COLD_MS,
      rollingMs: TTL_ROLLING_MS,
    },
  });
}

export async function action({request, context}: ActionFunctionArgs) {
  return run(request, (context as any).env || {});
}

export async function loader({request, context}: LoaderFunctionArgs) {
  // Allow GET for cron-triggered runs where the scheduler only does GETs.
  return run(request, (context as any).env || {});
}
