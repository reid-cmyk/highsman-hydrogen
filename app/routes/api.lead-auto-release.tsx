import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';
import {isClaimLive, TTL_COLD_MS, TTL_ROLLING_MS} from './api.lead-claim';
import {findRepById} from '~/lib/sales-floor-reps';
import {sendEmailFromUser, isGmailSAConfigured} from '~/lib/gmail-sa';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-auto-release  (scheduled — 7am ET pre-work + every 2h, 8am-8pm ET, weekdays)
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
// Notification: when a release happens, email the rep who lost the claim
// (one email per rep, batching all of their expired claims) so they see it
// in their own inbox with a 'why' and can re-claim from /sales-floor if they
// still want it. Replaces the older team-wide Slack ping (too noisy).
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

  // Per-rep email — group released leads by Working_Owner so a rep who had
  // 5 expired claims gets one summary email instead of 5. Don't block on
  // failure; the release is the important part.
  const emailedReps: string[] = [];
  if (released.length && isGmailSAConfigured(env)) {
    const byOwner = new Map<string, typeof released>();
    for (const r of released) {
      if (!r.owner) continue;
      const arr = byOwner.get(r.owner) || [];
      arr.push(r);
      byOwner.set(r.owner, arr);
    }
    for (const [ownerId, items] of byOwner) {
      const rep = findRepById(ownerId);
      if (!rep?.email) {
        console.warn('[lead-auto-release] no rep record for owner', ownerId);
        continue;
      }
      const itemLines = items.map(
        (r) =>
          `• ${r.name || '(no name)'}${
            r.company ? ` — ${r.company}` : ''
          } (${r.reason === 'rolling-48h' ? 'past 48h cap' : 'idle 8h+'})`,
      );
      const subject =
        items.length === 1
          ? `Sales Floor: your claim on ${
              items[0].name || items[0].company || 'a lead'
            } expired`
          : `Sales Floor: ${items.length} of your claims expired`;
      const textBody = [
        `Hey ${rep.firstName},`,
        '',
        `Heads up — the following Sales Floor claim${
          items.length === 1 ? '' : 's'
        } ${items.length === 1 ? 'has' : 'have'} been released back into the pool:`,
        '',
        ...itemLines,
        '',
        `Why: claims auto-release after 8h idle (no logged activity) or 48h absolute, whichever comes first.`,
        '',
        `If you still want any of them, re-claim from https://highsman.com/sales-floor.`,
        '',
        `— Highsman Sales Floor`,
      ].join('\n');
      try {
        await sendEmailFromUser(
          'sky@highsman.com',
          {
            to: rep.email,
            subject,
            textBody,
            fromName: 'Highsman Sales Floor',
            replyTo: 'sky@highsman.com',
          },
          env,
        );
        emailedReps.push(rep.email);
      } catch (e: any) {
        console.warn(
          '[lead-auto-release] email to rep failed',
          rep.email,
          e?.message,
        );
      }
    }
  }

  return json({
    ok: true,
    scanned: collected.length,
    released,
    releasedCount: released.length,
    emailedReps,
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
