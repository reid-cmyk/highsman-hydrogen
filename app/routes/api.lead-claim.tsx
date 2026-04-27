import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken} from '~/lib/zoho-auth';
import {getZohoUserIdByEmail} from '~/lib/zoho-users';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-claim
// ─────────────────────────────────────────────────────────────────────────────
// POST { leadId, mode?: 'claim'|'heartbeat' }
//   → { ok, ownedBy, claimedAt, lastActivityAt, ttlRemaining }
//
// Stakes ownership on a Zoho Lead for a rep for up to TTL_COLD_MS without
// activity, or TTL_ROLLING_MS absolute regardless of activity. Once claimed,
// the lead is visible-but-locked on every other rep's Floor PWA until it
// auto-releases (via /api/lead-auto-release scheduler) or the owner releases
// it manually (/api/lead-release).
//
// Claim rules:
//   • If unclaimed → stake for this rep.
//   • If already claimed by THIS rep → treat as heartbeat: bump
//     Working_Last_Activity_At to extend the cold-TTL window.
//   • If claimed by ANOTHER rep AND the claim is still live → 409 CONFLICT.
//     The only override is Senior Staff header (X-HS-Senior: hmexec2025$),
//     which force-reassigns.
//   • If claimed by ANOTHER rep but the claim is stale (past TTL) → we steal
//     it. The scheduler normally catches this but we don't want reps waiting
//     on a 30-minute cron if they beat it to the draw.
//
// Required Zoho custom fields on Leads module:
//   Working_Owner             — Single-Line Text (stores rep.id: "sky"|"pete"|"")
//   Working_Claimed_At        — Date/Time
//   Working_Last_Activity_At  — Date/Time
//
// Companion memory: project_njpopups_rep_coverage.md (Senior Staff override pattern)
// ─────────────────────────────────────────────────────────────────────────────

// 8 hours without activity → auto-release. Long enough for a lunch + a couple
// meetings; short enough that a rep who forgets about a lead doesn't hoard it.
export const TTL_COLD_MS = 8 * 60 * 60 * 1000;

// 48 hours absolute max claim, regardless of activity. Prevents a rep from
// parking on a lead forever by calling it every 7 hours.
export const TTL_ROLLING_MS = 48 * 60 * 60 * 1000;

const SENIOR_STAFF_PASS = 'hmexec2025$';

export function isClaimLive(
  claimedAtIso: string | null | undefined,
  lastActivityIso: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!claimedAtIso) return false;
  const claimedAt = Date.parse(claimedAtIso);
  if (!Number.isFinite(claimedAt)) return false;
  if (now - claimedAt > TTL_ROLLING_MS) return false;
  const lastAct = lastActivityIso ? Date.parse(lastActivityIso) : claimedAt;
  if (!Number.isFinite(lastAct)) return false;
  if (now - lastAct > TTL_COLD_MS) return false;
  return true;
}

// Zoho datetimes want "+00:00" offset, not "Z". Also no ms — Zoho v7 rejects
// fractional seconds on some date fields.
// Companion memory: reference_zoho_calls_module.md
function zohoDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const leadId = String(body?.leadId || '').trim();
  const mode = String(body?.mode || 'claim').trim(); // 'claim' | 'heartbeat'
  if (!/^\d{6,}$/.test(leadId)) {
    return json({ok: false, error: 'invalid leadId'}, {status: 400});
  }

  const senior = request.headers.get('X-HS-Senior') === SENIOR_STAFF_PASS;

  let token: string;
  try {
    token = await getZohoAccessToken(env);
  } catch (e: any) {
    return json({ok: false, error: `Zoho auth: ${e.message || 'failed'}`}, {status: 502});
  }

  // Pull current state so we can decide claim vs. heartbeat vs. conflict.
  const readUrl = new URL(`https://www.zohoapis.com/crm/v7/Leads/${leadId}`);
  readUrl.searchParams.set(
    'fields',
    'Working_Owner,Working_Claimed_At,Working_Last_Activity_At',
  );
  const readRes = await fetch(readUrl.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!readRes.ok) {
    const t = await readRes.text().catch(() => '');
    return json(
      {ok: false, error: `Zoho Leads read (${readRes.status})`, detail: t.slice(0, 300)},
      {status: 502},
    );
  }
  const readData: any = await readRes.json().catch(() => ({}));
  const current = Array.isArray(readData?.data) ? readData.data[0] : null;
  if (!current) {
    return json({ok: false, error: 'lead not found'}, {status: 404});
  }

  const currentOwner = String(current.Working_Owner || '').trim();
  const currentClaimedAt = current.Working_Claimed_At || null;
  const currentLastAct = current.Working_Last_Activity_At || null;

  const now = new Date();
  const claimLive = isClaimLive(currentClaimedAt, currentLastAct, now.getTime());
  const claimedByOther =
    claimLive && currentOwner && currentOwner !== rep.id;

  if (claimedByOther && !senior) {
    return json(
      {
        ok: false,
        error: 'lead claimed by another rep',
        ownedBy: currentOwner,
        claimedAt: currentClaimedAt,
        lastActivityAt: currentLastAct,
      },
      {status: 409},
    );
  }

  // Build the patch. A fresh claim sets Working_Claimed_At; a heartbeat on
  // an already-claimed lead leaves Working_Claimed_At alone and only bumps
  // Working_Last_Activity_At so the cold-TTL window slides forward.
  const isHeartbeat =
    mode === 'heartbeat' && claimLive && currentOwner === rep.id;

  const patch: Record<string, any> = {
    Working_Owner: rep.id,
    Working_Last_Activity_At: zohoDateTime(now),
  };
  if (!isHeartbeat) {
    patch.Working_Claimed_At = zohoDateTime(now);
  }

  // Mirror the Working_Owner change into Zoho's official `Owner` field — when
  // a rep starts working a lead, the record's owner flips to that rep so the
  // funnel + reporting attribute correctly without a second source of truth.
  // Falls through silently when the rep's email doesn't resolve to a Zoho
  // user id (best-effort write). A heartbeat from the SAME rep is a no-op
  // for Owner since the owner already matches.
  if (!isHeartbeat || currentOwner !== rep.id) {
    try {
      const ownerUserId = await getZohoUserIdByEmail(rep.email, token);
      if (ownerUserId) {
        patch.Owner = {id: ownerUserId};
      }
    } catch {
      /* ignore — keep claim flowing even if user lookup blips */
    }
  }

  const writeRes = await fetch(`https://www.zohoapis.com/crm/v7/Leads/${leadId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [patch], trigger: []}),
  });

  if (!writeRes.ok) {
    const t = await writeRes.text().catch(() => '');
    console.error('[lead-claim]', leadId, writeRes.status, t.slice(0, 300));
    return json(
      {ok: false, error: `Zoho update (${writeRes.status})`, detail: t.slice(0, 300)},
      {status: 502},
    );
  }

  const claimedAtIso = isHeartbeat ? currentClaimedAt : zohoDateTime(now);
  const lastActivityIso = zohoDateTime(now);
  const msUsed = Date.parse(lastActivityIso) - Date.parse(claimedAtIso);
  const ttlRemaining = Math.max(0, TTL_ROLLING_MS - msUsed);

  return json({
    ok: true,
    ownedBy: rep.id,
    claimedAt: claimedAtIso,
    lastActivityAt: lastActivityIso,
    ttlRemaining,
    mode: isHeartbeat ? 'heartbeat' : 'claim',
    senior: senior || undefined,
  });
}
