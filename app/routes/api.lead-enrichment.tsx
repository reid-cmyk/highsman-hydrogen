import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-enrichment
// ─────────────────────────────────────────────────────────────────────────────
// POST { leadId, mode?: 'preview'|'apply', sources?: string[] }
//   → { ok, lead, candidates: [{field, value, confidence, source}], applied? }
//
// Pulls phone / email / LinkedIn candidates for a Zoho Lead from multiple
// sources, ranks them by confidence, and optionally writes the
// highest-confidence hits back to Zoho.
//
// Sources (each independent — if one fails the others still return):
//   • places    — Google Places API. Shop switchboard line only (→ Phone).
//   • apollo    — Apollo enrichment. Cell → Mobile, direct → Phone, LinkedIn
//                 → LinkedIn_URL, verified email → Email.
//   • gmail     — Scan recent Gmail threads on the company domain; Claude
//                 Haiku 4.5 extracts phones from signatures + classifies
//                 each as Mobile vs. Main.
//   • website   — Last-resort scrape of the shop website for a contact
//                 number. Only ever tagged Low confidence and routed to
//                 Phone (never Mobile) since website numbers are switchboard.
//
// Modes:
//   • preview — return candidates, DO NOT write. Used by the in-brief
//               enrichment chip (task #30) so the rep sees the proposal
//               before it hits Zoho.
//   • apply   — auto-write any High-confidence candidate for an empty
//               field. Never overwrites a populated field. Used by the
//               nightly sweep (task #29).
//
// Confidence tiers:
//   high   — Two independent sources agree, OR Apollo marked verified.
//   medium — Single source, strong signal (Apollo 1st party, Places for
//            the exact shop name).
//   low    — Website scrape, fuzzy name match, or any "this MIGHT be the
//            right person" heuristic.
//
// Companion memory: project_njpopups_rep_coverage.md (GOOGLE_PLACES_API_KEY)
// ─────────────────────────────────────────────────────────────────────────────

type Candidate = {
  field: 'Phone' | 'Mobile' | 'Email' | 'LinkedIn_URL';
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'places' | 'apollo' | 'gmail' | 'website';
  note?: string;
};

type EnrichEnv = Record<string, string | undefined>;

// ─── Source: Google Places ───────────────────────────────────────────────────
async function placesLookup(
  env: EnrichEnv,
  lead: any,
): Promise<Candidate[]> {
  if (!env.GOOGLE_PLACES_API_KEY) return [];
  const company = String(lead.Company || '').trim();
  const city = String(lead.City || '').trim();
  if (!company) return [];

  try {
    // Text Search v1
    const res = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri',
        },
        body: JSON.stringify({
          textQuery: city ? `${company} ${city}` : company,
          maxResultCount: 1,
        }),
      },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const hit = Array.isArray(data?.places) ? data.places[0] : null;
    if (!hit) return [];

    const out: Candidate[] = [];
    const phone = hit.internationalPhoneNumber || hit.nationalPhoneNumber || '';
    if (phone) {
      const displayName = hit.displayName?.text || '';
      // High confidence when the Places hit's display name matches the
      // Zoho Company name closely. Otherwise medium.
      const normA = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normB = company.toLowerCase().replace(/[^a-z0-9]/g, '');
      const sameName =
        normA && normB && (normA.includes(normB) || normB.includes(normA));
      out.push({
        field: 'Phone',
        value: phone,
        confidence: sameName ? 'high' : 'medium',
        source: 'places',
        note: `Places match: ${displayName}`,
      });
    }
    return out;
  } catch (e: any) {
    console.warn('[enrichment:places]', e?.message);
    return [];
  }
}

// ─── Source: Apollo ──────────────────────────────────────────────────────────
async function apolloLookup(
  env: EnrichEnv,
  lead: any,
): Promise<Candidate[]> {
  if (!env.APOLLO_API_KEY) return [];
  const firstName = String(lead.First_Name || '').trim();
  const lastName = String(lead.Last_Name || '').trim();
  const company = String(lead.Company || '').trim();
  if (!lastName && !firstName) return [];

  try {
    const res = await fetch(
      'https://api.apollo.io/api/v1/people/match',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': env.APOLLO_API_KEY!,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          organization_name: company || undefined,
          reveal_personal_emails: false,
          reveal_phone_number: true,
        }),
      },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const person = data?.person || null;
    if (!person) return [];

    const out: Candidate[] = [];

    // LinkedIn — Apollo consistently returns linkedin_url on matched people.
    if (person.linkedin_url) {
      out.push({
        field: 'LinkedIn_URL',
        value: String(person.linkedin_url),
        confidence: 'high',
        source: 'apollo',
      });
    }

    // Email — Apollo has status indicators; verified = high, guessed = medium.
    const email = person.email || '';
    const emailStatus = person.email_status || '';
    if (email && email !== 'email_not_unlocked@domain.com') {
      const verified = emailStatus === 'verified';
      out.push({
        field: 'Email',
        value: String(email),
        confidence: verified ? 'high' : 'medium',
        source: 'apollo',
        note: emailStatus ? `Apollo status: ${emailStatus}` : undefined,
      });
    }

    // Phone numbers — Apollo returns an array with type labels.
    const phones = Array.isArray(person.phone_numbers) ? person.phone_numbers : [];
    for (const p of phones) {
      const raw = p?.raw_number || p?.sanitized_number || '';
      if (!raw) continue;
      const type = String(p?.type || '').toLowerCase();
      const isMobile = type.includes('mobile') || type.includes('cell');
      out.push({
        field: isMobile ? 'Mobile' : 'Phone',
        value: String(raw),
        confidence: type ? 'high' : 'medium',
        source: 'apollo',
        note: type || undefined,
      });
    }

    return out;
  } catch (e: any) {
    console.warn('[enrichment:apollo]', e?.message);
    return [];
  }
}

// ─── Source: Gmail signature scan ────────────────────────────────────────────
// Calls Haiku 4.5 with a compact bundle of recent-thread text snippets and
// asks for structured JSON extraction. Keeps tokens tight (<2k input) so
// the sweep stays well under the per-run budget.
async function gmailSignatureScan(
  env: EnrichEnv,
  lead: any,
): Promise<Candidate[]> {
  if (!env.ANTHROPIC_API_KEY || !env.GMAIL_SA_CLIENT_EMAIL) return [];
  const email = String(lead.Email || '').trim();
  const company = String(lead.Company || '').trim();
  if (!email && !company) return [];

  // Derive a search domain from the lead's email OR the website if set.
  let domain = '';
  if (email.includes('@')) domain = email.split('@')[1] || '';
  if (!domain && lead.Website) {
    try {
      const u = new URL(
        String(lead.Website).startsWith('http')
          ? lead.Website
          : `https://${lead.Website}`,
      );
      domain = u.hostname.replace(/^www\./, '');
    } catch {
      // invalid URL — skip
    }
  }
  if (!domain) return [];

  // We hit Gmail via the service-account helper — same pattern as the
  // Brief pipe. Fetch up to 8 recent messages from any sender on this
  // domain; pull bodies and run the signature extractor.
  try {
    const {getGmailAccessTokenForUser} = await import('~/lib/gmail-sa');
    const token = await getGmailAccessTokenForUser('sky@highsman.com', env);
    if (!token) return [];

    const q = `from:@${domain} newer_than:180d`;
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('q', q);
    listUrl.searchParams.set('maxResults', '8');
    const listRes = await fetch(listUrl.toString(), {
      headers: {Authorization: `Bearer ${token}`},
    });
    if (!listRes.ok) return [];
    const listData: any = await listRes.json();
    const ids: string[] = (listData?.messages || []).map((m: any) => m.id).filter(Boolean);
    if (!ids.length) return [];

    // Pull snippets in parallel. Using format=metadata is faster + cheaper
    // than full — we only need the signature block which lives in snippet
    // or the last ~500 chars of the plain body.
    const msgs = await Promise.all(
      ids.slice(0, 8).map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          {headers: {Authorization: `Bearer ${token}`}},
        );
        if (!r.ok) return null;
        return r.json();
      }),
    );

    // Extract tail text (signatures live at the bottom) from each message.
    const tails: string[] = [];
    for (const m of msgs) {
      if (!m) continue;
      const snippet = m.snippet || '';
      // Grab the last ~600 chars to catch the signature.
      const parts = m.payload?.parts || [];
      let body = '';
      for (const p of parts) {
        if (p.mimeType === 'text/plain' && p.body?.data) {
          body = Buffer.from(p.body.data, 'base64').toString('utf8');
          break;
        }
      }
      const tail = (body || snippet).slice(-700);
      if (tail.trim()) tails.push(tail);
    }

    if (!tails.length) return [];

    // Haiku extracts phones + classifies them.
    const prompt = `You will receive email tail text fragments (signature blocks) from a cannabis-dispensary contact.
Extract any US phone numbers AND classify each as "mobile" (direct cell) or "main" (shop switchboard / extension line).
Lead info: name="${lead.First_Name || ''} ${lead.Last_Name || ''}", company="${company}", email="${email}".
Return STRICT JSON: {"phones":[{"number":"(555) 123-4567","kind":"mobile|main","confidence":"high|medium|low"}]}
No commentary. If no phones found return {"phones":[]}.

FRAGMENTS:
${tails.map((t, i) => `#${i + 1}: ${t}`).join('\n\n')}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{role: 'user', content: prompt}],
      }),
    });
    if (!aiRes.ok) return [];
    const aiData: any = await aiRes.json();
    const text = aiData?.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const phones = Array.isArray(parsed?.phones) ? parsed.phones : [];

    return phones
      .filter((p: any) => p?.number)
      .map((p: any) => ({
        field: p.kind === 'mobile' ? 'Mobile' : 'Phone',
        value: String(p.number),
        confidence: (p.confidence === 'high' || p.confidence === 'medium'
          ? p.confidence
          : 'low') as 'high' | 'medium' | 'low',
        source: 'gmail',
        note: `Gmail signature (${p.kind || 'unknown'})`,
      }) as Candidate);
  } catch (e: any) {
    console.warn('[enrichment:gmail]', e?.message);
    return [];
  }
}

// ─── Source: Website scrape fallback ─────────────────────────────────────────
// Last resort. Pulls the lead's Website, extracts any tel: or (xxx) xxx-xxxx
// pattern, and returns the first one as a Low-confidence Phone candidate.
// Never routed to Mobile — websites publish switchboards, not cells.
async function websiteScrape(lead: any): Promise<Candidate[]> {
  const site = String(lead.Website || '').trim();
  if (!site) return [];
  const url = site.startsWith('http') ? site : `https://${site}`;
  try {
    const res = await fetch(url, {
      headers: {'User-Agent': 'HighsmanSalesFloor/1.0'},
      // @ts-ignore cf
      cf: {cacheTtl: 86400},
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 200_000); // cap bytes
    const telMatch = html.match(/tel:([+\d\-\s().]+)/i);
    const rawPatMatch = html.match(/\(\s*\d{3}\s*\)\s*\d{3}\s*[-.\s]\s*\d{4}/);
    const raw =
      (telMatch && telMatch[1]) ||
      (rawPatMatch && rawPatMatch[0]) ||
      '';
    if (!raw) return [];
    return [
      {
        field: 'Phone',
        value: raw.trim(),
        confidence: 'low',
        source: 'website',
        note: `Scraped from ${url}`,
      },
    ];
  } catch {
    return [];
  }
}

// ─── Ranking + dedup ─────────────────────────────────────────────────────────
function rankCandidates(cands: Candidate[]): Candidate[] {
  const rank: Record<Candidate['confidence'], number> = {high: 3, medium: 2, low: 1};
  // Dedup by (field, normalized value). Keep the highest-confidence entry.
  const seen = new Map<string, Candidate>();
  for (const c of cands) {
    const norm = c.value.replace(/[^\w@.:/-]/g, '').toLowerCase();
    const k = `${c.field}|${norm}`;
    const prev = seen.get(k);
    if (!prev || rank[c.confidence] > rank[prev.confidence]) {
      seen.set(k, c);
    }
  }
  // Cross-source corroboration: if two DIFFERENT sources agreed on the same
  // (field, value) — bump to high regardless of individual confidence.
  const sourcesByKey = new Map<string, Set<string>>();
  for (const c of cands) {
    const norm = c.value.replace(/[^\w@.:/-]/g, '').toLowerCase();
    const k = `${c.field}|${norm}`;
    if (!sourcesByKey.has(k)) sourcesByKey.set(k, new Set());
    sourcesByKey.get(k)!.add(c.source);
  }
  for (const [k, sources] of sourcesByKey) {
    if (sources.size >= 2) {
      const winner = seen.get(k);
      if (winner) winner.confidence = 'high';
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => rank[b.confidence] - rank[a.confidence],
  );
}

// ─── Main handler ────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  // Auth — two paths:
  //   1. Rep cookie (in-brief enrichment chip + manual reps)
  //   2. X-HS-Scheduler token (the nightly sweep route fans out here,
  //      so it needs a non-cookie auth that doesn't require a rep).
  const schedulerToken = env.SALES_FLOOR_SCHEDULER_TOKEN;
  const providedScheduler = request.headers.get('X-HS-Scheduler') || '';
  const isScheduler =
    !!schedulerToken && providedScheduler === schedulerToken;
  if (!isScheduler) {
    const rep = getRepFromRequest(request);
    if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const leadId = String(body?.leadId || '').trim();
  const mode = String(body?.mode || 'preview').trim(); // 'preview'|'apply'
  const sources: string[] = Array.isArray(body?.sources)
    ? body.sources
    : ['places', 'apollo', 'gmail', 'website'];
  // In-brief "rep picked this chip" path passes an explicit allow-list. When
  // present we narrow apply-mode to just those fields AND relax the
  // high-confidence filter — the rep looked at the candidate and picked it,
  // that's a stronger signal than any automated ranker. The nightly sweep
  // leaves onlyFields undefined and keeps its high-confidence guardrail.
  const onlyFields: string[] = Array.isArray(body?.onlyFields)
    ? body.onlyFields.filter((f: any) => typeof f === 'string')
    : [];
  if (!/^\d{6,}$/.test(leadId)) {
    return json({ok: false, error: 'invalid leadId'}, {status: 400});
  }

  let token: string;
  try {
    token = await getZohoAccessToken(env);
  } catch (e: any) {
    return json({ok: false, error: `Zoho auth: ${e.message}`}, {status: 502});
  }

  // Pull the lead so each source has name/company/website/email to work with.
  const readUrl = new URL(`https://www.zohoapis.com/crm/v7/Leads/${leadId}`);
  readUrl.searchParams.set(
    'fields',
    'First_Name,Last_Name,Company,Email,Phone,Mobile,Website,City,State,LinkedIn_URL',
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
  const leadData: any = await readRes.json();
  const lead = Array.isArray(leadData?.data) ? leadData.data[0] : null;
  if (!lead) return json({ok: false, error: 'lead not found'}, {status: 404});

  // Fan out the sources in parallel. Each returns [] on any kind of failure
  // so one broken source never tanks the whole sweep.
  const runs = await Promise.all([
    sources.includes('places') ? placesLookup(env, lead) : Promise.resolve<Candidate[]>([]),
    sources.includes('apollo') ? apolloLookup(env, lead) : Promise.resolve<Candidate[]>([]),
    sources.includes('gmail') ? gmailSignatureScan(env, lead) : Promise.resolve<Candidate[]>([]),
    sources.includes('website') ? websiteScrape(lead) : Promise.resolve<Candidate[]>([]),
  ]);
  const raw = runs.flat();
  const ranked = rankCandidates(raw);

  // preview: just return ranked candidates. Rep decides.
  if (mode !== 'apply') {
    return json({
      ok: true,
      lead: {
        id: lead.id,
        Phone: lead.Phone || '',
        Mobile: lead.Mobile || '',
        Email: lead.Email || '',
        LinkedIn_URL: lead.LinkedIn_URL || '',
      },
      candidates: ranked,
    });
  }

  // apply: auto-write the highest-confidence candidate per field, but ONLY
  // for empty fields. We never overwrite existing data on a nightly sweep —
  // that's a rep-with-Brief-drawer decision, not a cron decision.
  const patch: Record<string, string> = {};
  const applied: Candidate[] = [];
  const fieldAllow: Set<string> = onlyFields.length > 0
    ? new Set(onlyFields)
    : new Set(['Phone', 'Mobile', 'Email', 'LinkedIn_URL']);
  // When the rep explicitly picks a chip (onlyFields set), trust any candidate
  // tier — the rep eyeballed it. For the nightly sweep, stay strict.
  const acceptConfidence = onlyFields.length > 0
    ? new Set(['high', 'medium', 'low'])
    : new Set(['high']);
  for (const field of ['Phone', 'Mobile', 'Email', 'LinkedIn_URL'] as const) {
    if (!fieldAllow.has(field)) continue;
    if (String(lead[field] || '').trim()) continue; // already filled
    const top = ranked.find(
      (c) => c.field === field && acceptConfidence.has(c.confidence),
    );
    if (!top) continue;
    patch[field] = top.value;
    applied.push(top);
  }

  if (Object.keys(patch).length === 0) {
    return json({
      ok: true,
      lead: {id: lead.id},
      candidates: ranked,
      applied: [],
      note: 'No empty fields with High-confidence candidates.',
    });
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
    return json(
      {ok: false, error: `Zoho update (${writeRes.status})`, detail: t.slice(0, 300)},
      {status: 502},
    );
  }

  return json({
    ok: true,
    lead: {id: lead.id},
    candidates: ranked,
    applied,
  });
}
