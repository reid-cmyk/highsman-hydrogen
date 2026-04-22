// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM — Notes Helper
// ─────────────────────────────────────────────────────────────────────────────
// Thin client for the Notes module. Notes attach to a parent record by setting
// `Parent_Id` + `se_module` (note: this `se_module` does NOT need the leading
// `$` like Calls' `$se_module` does — Zoho is inconsistent and the Notes
// module accepts the bare key. Confirmed against /crm/v7/Notes payloads).
//
// We use Notes (not the Calls module) for SMS because:
//   • Quo's docs explicitly recommend it ("Texts logged as Notes")
//   • SMS doesn't fit the Call shape (no duration, no direction enum)
//   • A Title-prefix convention `[SMS → In]` / `[SMS → Out]` lets Reid build
//     a single Zoho list view that filters every text across the org.
//
// All callers must already have a Zoho access token. Token caching lives in
// the route handlers (each route already has a getZohoToken() — keep notes
// helper stateless for testability).
// ─────────────────────────────────────────────────────────────────────────────

export type ZohoNoteParent = {
  id: string;
  module: 'Accounts' | 'Contacts' | 'Deals' | 'Leads';
};

export type CreateZohoNoteInput = {
  token: string;
  parent: ZohoNoteParent;
  title: string;             // shows in Zoho timeline; keep <100 chars
  content: string;           // body — full SMS text + metadata
};

export async function createZohoNote(input: CreateZohoNoteInput): Promise<string | null> {
  const payload = {
    Note_Title: input.title,
    Note_Content: input.content,
    Parent_Id: input.parent.id,
    se_module: input.parent.module,
  };
  const res = await fetch('https://www.zohoapis.com/crm/v7/Notes', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${input.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [payload]}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Zoho create Note (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.data?.[0]?.details?.id || null;
}

// ─── Title builders ─────────────────────────────────────────────────────────
// Convention used everywhere SMS Notes are written. Keep these centralized so
// the list-view filter Reid sets up in Zoho ("Note Title contains [SMS]")
// keeps working as we add new code paths.

export function smsNoteTitle(direction: 'in' | 'out', counterparty: string, preview: string): string {
  const arrow = direction === 'in' ? '→ In' : '→ Out';
  const trim = (preview || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const tail = trim ? ` — ${trim}` : '';
  return `[SMS ${arrow}] ${counterparty}${tail}`;
}

export function smsNoteBody(opts: {
  direction: 'in' | 'out';
  fromE164: string;
  toE164: string;
  text: string;
  timestamp: string;
  repName?: string | null;
  quoMessageId?: string | null;
}): string {
  const lines = [
    `Direction: ${opts.direction === 'in' ? 'Inbound' : 'Outbound'}`,
    `From: ${opts.fromE164}`,
    `To: ${opts.toE164}`,
    `Sent: ${opts.timestamp}`,
    opts.repName ? `Handled by: ${opts.repName}` : null,
    opts.quoMessageId ? `Quo message id: ${opts.quoMessageId}` : null,
    '',
    '— Message —',
    opts.text,
  ].filter(Boolean);
  return lines.join('\n');
}
