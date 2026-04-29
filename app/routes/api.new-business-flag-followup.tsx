import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';
import {sendEmailFromUser, isGmailSAConfigured} from '~/lib/gmail-sa';

// ─────────────────────────────────────────────────────────────────────────────
// /api/new-business-flag-followup
// ─────────────────────────────────────────────────────────────────────────────
// POST { accountId, action: 'flag' | 'unflag' } → { ok, tagged }
//
// Adds or removes the Zoho Tag `pete-followup` on an Account. Sky uses this
// from her Sales Floor card; Pete uses it from his Follow Up list to mark
// "handled" — tag goes away, account drops off his queue.
//
// Auth: any logged-in rep can flag/unflag. No per-rep permission matrix yet
// because the only people with dashboard access are already trusted.
//
// Zoho v7 tag endpoints:
//   POST /crm/v7/Accounts/actions/add_tags?ids=<id>&tag_names=<name>
//   POST /crm/v7/Accounts/actions/remove_tags?ids=<id>&tag_names=<name>
// Both return { data: [{code:'SUCCESS', ...}] } on success. Anything else
// is surfaced to the caller so the UI can show a clear error.
// ─────────────────────────────────────────────────────────────────────────────

export const FOLLOWUP_TAG = 'pete-followup';

export async function action({request, context}: ActionFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  const env = context.env as Record<string, string | undefined>;
  let body: {accountId?: string; action?: string};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON body'}, {status: 400});
  }
  const accountId = (body.accountId || '').trim();
  const act = (body.action || '').trim().toLowerCase();
  if (!accountId) return json({ok: false, error: 'accountId required'}, {status: 400});
  if (act !== 'flag' && act !== 'unflag') {
    return json({ok: false, error: "action must be 'flag' or 'unflag'"}, {status: 400});
  }
  // Authorization: Sky can flag accounts for Pete, but only Pete (or another
  // non-Sky rep — e.g. Reid for ops cleanup) can unflag. This enforces the
  // 'one-way handoff' rule on the server even if a stale Sales-floor client
  // tries to send action: 'unflag' from Sky's session.
  if (act === 'unflag' && rep.id === 'sky') {
    return json(
      {
        ok: false,
        error:
          "Sky cannot un-flag. Only Pete can clear an account from his Follow-Ups (or an order auto-clears it).",
      },
      {status: 403},
    );
  }

  let token: string;
  try {
    token = await getZohoToken(env);
  } catch (err: any) {
    return json({ok: false, error: err?.message || 'Zoho auth failed'}, {status: 503});
  }

  // Zoho v7 tag endpoints — use the per-record path form and carry the tag in
  // the body, matching the proven pattern in api.accounts.tsx. The mass-action
  // form (`/Accounts/actions/add_tags?ids=...&tag_names=...`) used to accept a
  // bodiless POST but as of Apr 2026 it rejects with
  // `{"code":"INVALID_DATA","details":{"expected_data_type":"jsonobject"},"message":"body"}`
  // because the v7 validator now requires a JSON-object body even when the
  // identifying data is in the query string. Switching to the per-record path
  // form sidesteps that: `tags` is carried in the body, which the validator
  // accepts cleanly, and we keep the additive semantics (other tags on the
  // record are preserved — add_tags never overwrites unrelated tags).
  const endpoint = act === 'flag' ? 'add_tags' : 'remove_tags';
  const url = `https://www.zohoapis.com/crm/v7/Accounts/${encodeURIComponent(accountId)}/actions/${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tags: [{name: FOLLOWUP_TAG}],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return json(
      {ok: false, error: `Zoho ${endpoint} (${res.status}): ${text.slice(0, 300)}`},
      {status: 502},
    );
  }
  const data = await res.json();
  const row = (data?.data || [])[0];
  if (row && row.code && row.code !== 'SUCCESS') {
    return json({ok: false, error: `Zoho ${row.code}: ${row.message || 'unknown'}`}, {status: 502});
  }

  // ── Sky → Pete handoff email ─────────────────────────────────────────────
  // Reid 2026-04-29: when Sky flags an account for Pete, also send an email
  // from sky@highsman.com → peter@highsman.com so Pete has the account in
  // his inbox (with the details inline) on top of the Zoho tag landing on
  // his /new-business Follow-Ups list. Skipped on 'unflag' (only fires on
  // the actual handoff). Best-effort: a Gmail-side failure does NOT roll
  // back the tag — the tag is the source of truth for Pete's queue, the
  // email is a notification on top.
  let emailSent = false;
  let emailError: string | null = null;
  if (act === 'flag') {
    if (!isGmailSAConfigured(env as Record<string, string | undefined>)) {
      emailError = 'gmail-sa-not-configured';
    } else {
      try {
        const acct = await fetchAccountForHandoffEmail(accountId, token);
        const {subject, textBody, htmlBody} = buildHandoffEmail(acct);
        await sendEmailFromUser(
          'sky@highsman.com',
          {
            to: 'peter@highsman.com',
            subject,
            textBody,
            htmlBody,
            fromName: 'Sky Lima — Highsman',
            replyTo: 'sky@highsman.com',
          },
          env as Record<string, string | undefined>,
        );
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || 'gmail-send-failed';
        console.warn('[flag-followup] handoff email failed:', emailError);
      }
    }
  }

  return json({
    ok: true,
    tagged: act === 'flag',
    accountId,
    by: rep.id,
    emailSent,
    emailError,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Account hydration + email body builder
// ─────────────────────────────────────────────────────────────────────────────

type HandoffAccount = {
  id: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  lastOrderDate: string;
  totalOrders: string;
  ownerName: string;
  zohoUrl: string;
};

async function fetchAccountForHandoffEmail(
  accountId: string,
  token: string,
): Promise<HandoffAccount> {
  // Pull just the fields the email body uses. Best-effort: if Zoho 4xx's
  // we still send the email with whatever we have (just the ID/link).
  const fields = [
    'Account_Name',
    'Billing_City',
    'Billing_State',
    'Account_State',
    'Phone',
    'Email',
    'Last_Order_Date',
    'Total_Orders_Count',
    'Owner',
  ].join(',');
  const url = `https://www.zohoapis.com/crm/v7/Accounts/${encodeURIComponent(accountId)}?fields=${fields}`;
  let row: any = {};
  try {
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.ok) {
      const data: any = await res.json();
      row = (data?.data || [])[0] || {};
    }
  } catch {
    // swallow — we degrade to just the ID below
  }
  const state =
    String(row.Account_State || row.Billing_State || '').trim();
  return {
    id: accountId,
    name: String(row.Account_Name || '').trim() || '(unnamed account)',
    city: String(row.Billing_City || '').trim(),
    state,
    phone: String(row.Phone || '').trim(),
    email: String(row.Email || '').trim(),
    lastOrderDate: String(row.Last_Order_Date || '').trim(),
    totalOrders:
      row.Total_Orders_Count != null && row.Total_Orders_Count !== ''
        ? String(row.Total_Orders_Count)
        : '',
    ownerName: String(row.Owner?.name || '').trim(),
    zohoUrl: `https://crm.zoho.com/crm/org814057291/tab/Accounts/${accountId}`,
  };
}

function buildHandoffEmail(a: HandoffAccount): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const cityState = [a.city, a.state].filter(Boolean).join(', ');
  const subject = `Reorder follow-up needed: ${a.name}`;

  // Plain-text body — what Pete sees in clients without HTML rendering.
  const textLines: string[] = [
    'Hi Pete,',
    '',
    'This account needs to be reached out to for reorder. Please action with the account details below.',
    '',
    'Account details:',
    `  • Name: ${a.name}`,
  ];
  if (cityState) textLines.push(`  • Location: ${cityState}`);
  if (a.phone) textLines.push(`  • Phone: ${a.phone}`);
  if (a.email) textLines.push(`  • Email: ${a.email}`);
  if (a.lastOrderDate) textLines.push(`  • Last order: ${a.lastOrderDate}`);
  if (a.totalOrders) textLines.push(`  • Total orders: ${a.totalOrders}`);
  if (a.ownerName) textLines.push(`  • Zoho owner: ${a.ownerName}`);
  textLines.push(
    '',
    `Open in /new-business: https://highsman.com/new-business/app`,
    `Open in Zoho: ${a.zohoUrl}`,
    '',
    'Thanks,',
    'Sky',
  );
  const textBody = textLines.join('\n');

  // HTML body — same content, just a touch of styling so the detail block
  // is scannable in Gmail. Escapes are minimal because every value above
  // came straight from Zoho text fields, but we still escape angle brackets
  // and ampersands defensively.
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const detailRows: string[] = [
    `<li><strong>Name:</strong> ${esc(a.name)}</li>`,
  ];
  if (cityState) detailRows.push(`<li><strong>Location:</strong> ${esc(cityState)}</li>`);
  if (a.phone) detailRows.push(`<li><strong>Phone:</strong> ${esc(a.phone)}</li>`);
  if (a.email) detailRows.push(`<li><strong>Email:</strong> ${esc(a.email)}</li>`);
  if (a.lastOrderDate) detailRows.push(`<li><strong>Last order:</strong> ${esc(a.lastOrderDate)}</li>`);
  if (a.totalOrders) detailRows.push(`<li><strong>Total orders:</strong> ${esc(a.totalOrders)}</li>`);
  if (a.ownerName) detailRows.push(`<li><strong>Zoho owner:</strong> ${esc(a.ownerName)}</li>`);

  const htmlBody = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;">
<p>Hi Pete,</p>
<p>This account needs to be reached out to for reorder. Please action with the account details below.</p>
<p style="margin-bottom:6px;"><strong>Account details</strong></p>
<ul style="margin-top:0;padding-left:18px;">
${detailRows.join('\n')}
</ul>
<p style="margin-top:18px;">
  <a href="https://highsman.com/new-business/app" style="color:#0a66c2;text-decoration:none;">Open in /new-business</a>
  &nbsp;&middot;&nbsp;
  <a href="${esc(a.zohoUrl)}" style="color:#0a66c2;text-decoration:none;">Open in Zoho</a>
</p>
<p style="margin-top:18px;">Thanks,<br/>Sky</p>
</body></html>`;

  return {subject, textBody, htmlBody};
}
