import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// /api/vibes-training-confirm  (POST)
// ─────────────────────────────────────────────────────────────────────────────
// Serena confirms a pending training request. She calls the store, negotiates
// the day + time window (or pins an exact time if the buyer wants it), then
// posts the lock-in here. This strips [PENDING_CONFIRM] and writes the real
// Closing_Date + a time marker the route builder can honor.
//
// Request body:
//   {
//     dealId: string,          // Zoho Deal id
//     date: "YYYY-MM-DD",      // Serena-confirmed visit date (must be a
//                              // Tue/Wed/Thu; shore runs may override)
//     timeWindow?: TimeWindow, // one of: pre_open, morning, midday,
//                              // afternoon, post_close, flexible
//     exactTime?: "HH:MM",     // 24h, set only when the store gives a hard
//                              // appointment — takes priority over window
//     notes?: string,          // free-text Serena note (saved on Description)
//   }
// Response: { ok: true, dealId, date, timeLabel }
//
// Time markers written to Description:
//   • [TIME:EXACT=HH:MM]           — anchored stop, others route around
//   • [TIME:WINDOW=AFTERNOON]      — must land inside window (2pm-5pm etc.)
//   • (no marker)                  — flexible, current routing behavior
// ─────────────────────────────────────────────────────────────────────────────

type TimeWindow =
  | 'pre_open'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'post_close'
  | 'flexible';

const TIME_WINDOW_LABEL: Record<TimeWindow, string> = {
  pre_open: 'Pre-Open (9-10am)',
  morning: 'Morning (10am-12pm)',
  midday: 'Midday (12-2pm)',
  afternoon: 'Afternoon (2-5pm)',
  post_close: 'Post-Close (5-8pm)',
  flexible: 'Flexible',
};

const TIME_WINDOW_TAG: Record<TimeWindow, string> = {
  pre_open: '[TIME:WINDOW=PRE_OPEN]',
  morning: '[TIME:WINDOW=MORNING]',
  midday: '[TIME:WINDOW=MIDDAY]',
  afternoon: '[TIME:WINDOW=AFTERNOON]',
  post_close: '[TIME:WINDOW=POST_CLOSE]',
  flexible: '',
};

const TIER_MARKER_PENDING_CONFIRM = '[PENDING_CONFIRM]';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: any): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho not configured');
  }
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET,
      refresh_token: env.ZOHO_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Zoho token (${res.status})`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}
function isValidHHMM(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

async function fetchDealDescription(
  dealId: string,
  token: string,
): Promise<{description: string; dealName: string} | null> {
  const res = await fetch(
    `https://www.zohoapis.com/crm/v7/Deals/${dealId}?fields=id,Deal_Name,Description`,
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const row = (data?.data || [])[0];
  if (!row) return null;
  return {
    description: typeof row.Description === 'string' ? row.Description : '',
    dealName: typeof row.Deal_Name === 'string' ? row.Deal_Name : '',
  };
}

// Strip the PENDING_CONFIRM tag and any prior [TIME:*] marker, then append the
// new time marker + Serena's confirmation note. Keeps the rest of the existing
// description (region tag, focus, etc.) intact.
function rewriteDescription(
  old: string,
  timeTag: string,
  humanTimeLabel: string,
  date: string,
  notes: string | null,
): string {
  let desc = old
    // Remove the pending marker (with surrounding whitespace)
    .replace(new RegExp('\\s*' + escapeRegExp(TIER_MARKER_PENDING_CONFIRM) + '\\s*', 'g'), ' ')
    // Remove any prior time markers
    .replace(/\s*\[TIME:[^\]]+\]\s*/g, ' ')
    // Collapse double-spaces from the strips
    .replace(/[ \t]{2,}/g, ' ')
    // Collapse trailing whitespace per line
    .replace(/[ \t]+$/gm, '');
  // Strip the "Status: AWAITING ..." line the Sky endpoint wrote.
  desc = desc
    .split(/\r?\n/)
    .filter((ln) => !/^Status:\s*AWAITING/i.test(ln.trim()))
    .join('\n');
  // Append the confirmation footer.
  const footer = [
    `Confirmed by Serena: ${date} · ${humanTimeLabel}`,
    timeTag || null,
    notes ? `Note: ${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return `${desc.trim()}\n${footer}`.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const dealId = String(body?.dealId || '').trim();
  const date = String(body?.date || '').trim();
  const timeWindowRaw = String(body?.timeWindow || 'flexible').trim().toLowerCase();
  const exactTime = body?.exactTime ? String(body.exactTime).trim() : '';
  const notes = body?.notes ? String(body.notes).trim() : '';

  if (!/^\d{6,}$/.test(dealId)) {
    return json({ok: false, error: 'invalid dealId'}, {status: 400});
  }
  if (!isValidDate(date)) {
    return json({ok: false, error: 'date must be YYYY-MM-DD'}, {status: 400});
  }
  if (!(timeWindowRaw in TIME_WINDOW_LABEL)) {
    return json(
      {
        ok: false,
        error:
          'timeWindow must be one of: pre_open, morning, midday, afternoon, post_close, flexible',
      },
      {status: 400},
    );
  }
  if (exactTime && !isValidHHMM(exactTime)) {
    return json({ok: false, error: 'exactTime must be HH:MM (24h)'}, {status: 400});
  }

  const timeWindow = timeWindowRaw as TimeWindow;

  try {
    const token = await getZohoToken(env);

    const current = await fetchDealDescription(dealId, token);
    if (!current) {
      return json({ok: false, error: 'deal not found'}, {status: 404});
    }

    // Exact time wins if provided; otherwise window tag (unless flexible).
    const timeTag = exactTime
      ? `[TIME:EXACT=${exactTime}]`
      : TIME_WINDOW_TAG[timeWindow];
    const humanTimeLabel = exactTime
      ? `Exact: ${exactTime}`
      : TIME_WINDOW_LABEL[timeWindow];

    const newDescription = rewriteDescription(
      current.description,
      timeTag,
      humanTimeLabel,
      date,
      notes || null,
    );
    // Drop the "(pending):" prefix in the deal name so Serena's view shows
    // the clean "Training: Store Name" title once it's confirmed.
    const newDealName = current.dealName.replace(
      /^Training\s*\(pending\)\s*:/i,
      'Training:',
    );

    const payload = {
      data: [
        {
          id: dealId,
          Deal_Name: newDealName,
          Closing_Date: date,
          Description: newDescription,
        },
      ],
      trigger: [],
    };

    const res = await fetch('https://www.zohoapis.com/crm/v7/Deals', {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`Zoho Deals update (${res.status}): ${text.slice(0, 300)}`);
    }

    return json({
      ok: true,
      dealId,
      date,
      timeLabel: humanTimeLabel,
      timeTag: timeTag || null,
    });
  } catch (err: any) {
    console.error('[vibes-training-confirm] failed', dealId, err.message);
    return json(
      {ok: false, error: err.message || 'Training confirm failed'},
      {status: 502},
    );
  }
}
