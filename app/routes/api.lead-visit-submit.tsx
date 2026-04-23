import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/lead-visit-submit
// ─────────────────────────────────────────────────────────────────────────────
// A brand rep drops in on a prospect dispensary for a sampling touch.
// She answers 5 short questions — no SKU audit, no merch, no live training.
// This endpoint:
//
//   1. Inserts a row in Supabase `lead_visits`
//   2. Attaches a Note to the Zoho Lead with the visit summary (non-fatal)
//   3. Optionally updates Lead_Status → "Sampling" and bumps Last_Activity_Time
//
// Zoho Lead creation happens separately on /api/leads — by the time this
// endpoint is called, the client already has a zohoLeadId (either matched or
// just created). This keeps the submit atomic and avoids double-creating leads
// on retry.
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
};

function interestLabel(level: string): string {
  switch (level) {
    case 'cold':
      return '🧊 COLD';
    case 'warm':
      return '🔥 WARM';
    case 'hot':
      return '🔥🔥 HOT';
    case 'red_hot':
      return '🔥🔥🔥 RED HOT';
    default:
      return level.toUpperCase();
  }
}

function buildNoteContent(visit: {
  repName: string | null;
  leadCompany: string;
  interestLevel: string;
  contactName: string | null;
  contactRole: string | null;
  contactIsBuyer: boolean;
  samplesLeft: string | null;
  discussionNotes: string | null;
  salesHandoff: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`SAMPLING DROP-IN — ${new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`);
  if (visit.repName) lines.push(`Rep: ${visit.repName}`);
  lines.push('');
  lines.push(`Interest: ${interestLabel(visit.interestLevel)}`);

  if (visit.contactName || visit.contactRole) {
    const buyerTag = visit.contactIsBuyer ? ' · 🎯 BUYER' : '';
    lines.push(
      `Spoke with: ${visit.contactName || '—'}${visit.contactRole ? ` (${visit.contactRole})` : ''}${buyerTag}`,
    );
  }
  if (visit.samplesLeft) {
    lines.push('');
    lines.push('Samples left:');
    lines.push(visit.samplesLeft);
  }
  if (visit.discussionNotes) {
    lines.push('');
    lines.push('Discussion:');
    lines.push(visit.discussionNotes);
  }
  if (visit.salesHandoff) {
    lines.push('');
    lines.push('⚠️ SALES HANDOFF:');
    lines.push(visit.salesHandoff);
  }
  return lines.join('\n');
}

/** Attach a Note to a Zoho Lead. Non-fatal. */
async function attachZohoNote(
  leadId: string,
  title: string,
  content: string,
  accessToken: string,
): Promise<{ok: boolean; noteId?: string; error?: string}> {
  try {
    const res = await fetch('https://www.zohoapis.com/crm/v7/Notes', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            Note_Title: title,
            Note_Content: content,
            Parent_Id: leadId,
            se_module: 'Leads',
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {ok: false, error: `${res.status}: ${text.slice(0, 200)}`};
    }
    const data = await res.json();
    const record = data.data?.[0];
    if (record?.status !== 'success') {
      return {ok: false, error: JSON.stringify(record?.details || {}).slice(0, 200)};
    }
    return {ok: true, noteId: record.details?.id};
  } catch (err: any) {
    return {ok: false, error: err?.message || 'note fetch failed'};
  }
}

/** Bump Lead_Status → "Sampling" so it stays in the Sampling tier targets. */
async function bumpLeadStatus(leadId: string, accessToken: string): Promise<void> {
  try {
    await fetch(`https://www.zohoapis.com/crm/v7/Leads/${leadId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{Lead_Status: 'Sampling'}],
      }),
    });
  } catch (err) {
    console.error('[lead-visit] Lead_Status bump failed (non-fatal):', err);
  }
}

async function supaPost<T>(
  env: Env,
  path: string,
  body: unknown,
): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase insert failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, message: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as Env;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ok: false, message: 'Could not parse form data'}, {status: 400});
  }

  const repId = String(form.get('repId') || '').trim() || null;
  const repName = String(form.get('repName') || '').trim() || null;
  const zohoLeadId = String(form.get('zohoLeadId') || '').trim() || null;
  const leadCompany = String(form.get('leadCompany') || '').trim();
  const leadCity = String(form.get('leadCity') || '').trim() || null;
  const leadState = String(form.get('leadState') || '').trim() || null;

  const interestLevel = String(form.get('interestLevel') || '').trim().toLowerCase();
  const contactName = String(form.get('contactName') || '').trim() || null;
  const contactRole = String(form.get('contactRole') || '').trim() || null;
  const contactIsBuyer = String(form.get('contactIsBuyer') || '') === 'true';
  const samplesLeft = String(form.get('samplesLeft') || '').trim() || null;
  const discussionNotes = String(form.get('discussionNotes') || '').trim() || null;
  const salesHandoff = String(form.get('salesHandoff') || '').trim() || null;
  const createdNewLead = String(form.get('createdNewLead') || '') === 'true';

  // Validate
  if (!leadCompany) {
    return json({ok: false, message: 'Dispensary / Lead company is required.'}, {status: 400});
  }
  const VALID_LEVELS = new Set(['cold', 'warm', 'hot', 'red_hot']);
  if (!VALID_LEVELS.has(interestLevel)) {
    return json(
      {ok: false, message: 'Pick an interest level (Cold, Warm, Hot, Red Hot).'},
      {status: 400},
    );
  }

  // 1. Insert into Supabase lead_visits
  let visitId: string | null = null;
  try {
    const inserted = await supaPost<{id: string}>(env, 'lead_visits', {
      rep_id: repId,
      rep_name: repName,
      zoho_lead_id: zohoLeadId,
      lead_company: leadCompany,
      lead_city: leadCity,
      lead_state: leadState,
      interest_level: interestLevel,
      contact_name: contactName,
      contact_role: contactRole,
      contact_is_buyer: contactIsBuyer,
      samples_left: samplesLeft,
      discussion_notes: discussionNotes,
      sales_handoff: salesHandoff,
      created_new_lead: createdNewLead,
    });
    visitId = inserted?.id ?? null;
  } catch (err: any) {
    console.error('[lead-visit] Supabase insert error:', err?.message);
    return json(
      {ok: false, message: err?.message || 'Could not save visit'},
      {status: 500},
    );
  }

  // 2. Attach Zoho Note (best effort)
  let noteId: string | null = null;
  let noteError: string | null = null;

  if (zohoLeadId && env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN) {
    try {
      const accessToken = await getZohoAccessToken(env);
      const noteContent = buildNoteContent({
        repName,
        leadCompany,
        interestLevel,
        contactName,
        contactRole,
        contactIsBuyer,
        samplesLeft,
        discussionNotes,
        salesHandoff,
      });
      const noteTitle = `Sampling drop-in — ${interestLabel(interestLevel)}`;
      const noteResult = await attachZohoNote(
        zohoLeadId,
        noteTitle,
        noteContent,
        accessToken,
      );
      if (noteResult.ok) {
        noteId = noteResult.noteId || null;
      } else {
        noteError = noteResult.error || 'Unknown note error';
      }

      // Fire-and-forget Lead_Status → Sampling bump (don't block response)
      bumpLeadStatus(zohoLeadId, accessToken).catch(() => {});
    } catch (err: any) {
      console.error('[lead-visit] Zoho note attach error:', err?.message);
      noteError = err?.message?.slice(0, 200) || 'note fetch failed';
    }
  }

  // 3. Patch the visit row with note audit fields (non-fatal)
  if (visitId && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && (noteId || noteError)) {
    try {
      await fetch(
        `${env.SUPABASE_URL}/rest/v1/lead_visits?id=eq.${visitId}`,
        {
          method: 'PATCH',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            zoho_note_id: noteId,
            zoho_note_error: noteError,
          }),
        },
      );
    } catch (err) {
      console.warn('[lead-visit] Failed to patch audit fields (non-fatal):', err);
    }
  }

  return json({
    ok: true,
    id: visitId,
    zohoNoteAttached: Boolean(noteId),
    zohoNoteError: noteError,
    message: noteId
      ? 'Visit saved + note attached to Zoho Lead.'
      : zohoLeadId
        ? 'Visit saved. Note attach will retry.'
        : 'Visit saved.',
  });
}
