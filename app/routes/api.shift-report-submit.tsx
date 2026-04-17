import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shift-report-submit
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a multipart/form-data submission from /shift-report and (eventually)
// writes to Supabase + uploads photos to Cloudflare R2. For now this is a
// stub: it validates the payload shape and logs, so the UI can ship first
// and we plug storage in behind it without touching the form.
//
// Expected fields (all strings unless noted):
//   repName                *required
//   accountId              *required  (Zoho Account ID)
//   accountName            *required
//   accountCity
//   shiftDate              *required  (yyyy-mm-dd)
//   intercepts             *required  (integer as string)
//   closes                 *required  (integer as string)
//   primaryObjection
//   objectionHandling
//   extraNotes             comma-separated list
//   salesFeedback
//   menuVisibility
//   merchSetup
//   merchOpportunity
//   promosSetup
//   managerFirst / managerLast
//   budtenderRating        int 0-10 as string
//   productNotes
//   aggression             *required  int 1-10 as string
//   improvementNotes
//   setupPhoto             *required  (File)
//   merchPhoto0..2         optional   (File)
//   opportunityPhoto0..2   optional   (File)
//
// Once Supabase is wired, this writes a row to `shift_reports` and returns
// `{ok: true, id}`. Photo blobs go to R2 under
//   shift-reports/{YYYY-MM}/{reportId}/setup.jpg (etc.)
// and we store the public URLs in the DB row.
// ─────────────────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, message: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as any;
  const submitReady = Boolean(env?.SUPABASE_URL && env?.SUPABASE_SERVICE_KEY);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ok: false, message: 'Could not parse form data'}, {status: 400});
  }

  // ─── Required-field validation ────────────────────────────────────────────
  const required = [
    'repName',
    'accountId',
    'accountName',
    'shiftDate',
    'intercepts',
    'closes',
    'aggression',
  ] as const;
  for (const key of required) {
    if (!form.get(key)) {
      return json(
        {ok: false, message: `Missing required field: ${key}`},
        {status: 400},
      );
    }
  }

  const setupPhoto = form.get('setupPhoto');
  if (!(setupPhoto instanceof File) || setupPhoto.size === 0) {
    return json(
      {ok: false, message: 'Setup photo is required'},
      {status: 400},
    );
  }

  // ─── Build clean payload ──────────────────────────────────────────────────
  const payload = {
    repName: String(form.get('repName')),
    accountId: String(form.get('accountId')),
    accountName: String(form.get('accountName')),
    accountCity: String(form.get('accountCity') || ''),
    shiftDate: String(form.get('shiftDate')),
    intercepts: Number(form.get('intercepts')),
    closes: Number(form.get('closes')),
    primaryObjection: String(form.get('primaryObjection') || ''),
    objectionHandling: String(form.get('objectionHandling') || ''),
    extraNotes: String(form.get('extraNotes') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    salesFeedback: String(form.get('salesFeedback') || ''),
    menuVisibility: String(form.get('menuVisibility') || ''),
    merchSetup: String(form.get('merchSetup') || ''),
    merchOpportunity: String(form.get('merchOpportunity') || ''),
    promosSetup: String(form.get('promosSetup') || ''),
    managerFirst: String(form.get('managerFirst') || ''),
    managerLast: String(form.get('managerLast') || ''),
    budtenderRating: Number(form.get('budtenderRating') || 0),
    productNotes: String(form.get('productNotes') || ''),
    aggression: Number(form.get('aggression')),
    improvementNotes: String(form.get('improvementNotes') || ''),
  };

  // Sanity checks on numeric fields.
  if (!Number.isFinite(payload.intercepts) || payload.intercepts < 0) {
    return json(
      {ok: false, message: 'Intercepts must be a non-negative integer'},
      {status: 400},
    );
  }
  if (!Number.isFinite(payload.closes) || payload.closes < 0) {
    return json(
      {ok: false, message: 'Closes must be a non-negative integer'},
      {status: 400},
    );
  }
  if (payload.aggression < 1 || payload.aggression > 10) {
    return json(
      {ok: false, message: 'Aggression must be between 1 and 10'},
      {status: 400},
    );
  }

  // Gather photos (setup + up to 3 merch + up to 3 opportunity).
  const photos: Array<{slot: string; file: File}> = [
    {slot: 'setup', file: setupPhoto as File},
  ];
  for (let i = 0; i < 3; i++) {
    const m = form.get(`merchPhoto${i}`);
    if (m instanceof File && m.size > 0) photos.push({slot: `merch${i}`, file: m});
    const o = form.get(`opportunityPhoto${i}`);
    if (o instanceof File && o.size > 0)
      photos.push({slot: `opportunity${i}`, file: o});
  }

  // Quick grade calc — echoed back so /ops could pop a toast later.
  const closeRate =
    payload.intercepts > 0 ? payload.closes / payload.intercepts : 0;
  const grade = gradeShift({
    closeRate,
    closes: payload.closes,
    aggression: payload.aggression,
  });

  if (!submitReady) {
    // Stub mode: log shape + confirm receipt so the UI can flow end-to-end.
    // eslint-disable-next-line no-console
    console.log('[shift-report] stub submission', {
      payload,
      photos: photos.map((p) => ({
        slot: p.slot,
        name: p.file.name,
        size: p.file.size,
        type: p.file.type,
      })),
      grade,
    });
    return json({
      ok: true,
      id: `stub-${Date.now()}`,
      grade,
      message:
        'Logged in stub mode (Supabase not yet configured). Answers captured server-side.',
    });
  }

  // TODO: Supabase insert + R2 upload once env vars land.
  //   1. Upload each photo to R2 at shift-reports/{yyyy-mm}/{reportId}/{slot}.jpg
  //   2. Insert into shift_reports with the returned URLs
  //   3. Return the DB id
  return json({
    ok: true,
    id: `pending-${Date.now()}`,
    grade,
    message: 'Received. Persistence pipeline wiring in progress.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING
// ─────────────────────────────────────────────────────────────────────────────
// Rubric (per Reid 2026-04-17):
//   Close rate    35%   — closes / intercepts
//   Volume        20%   — absolute closes vs. a 20-close baseline
//   Aggression    15%   — self-reported 1-10 flame rating
//   Job complete  15%   — photos + required fields (currently 100% if we get here)
//   Retail intel  15%   — retail-intel fields filled out
//
// This is a rough first pass so the UI has something to show. Final weights +
// thresholds move to a shared /app/lib/grading.ts once we're reading historical
// data from Supabase.
// ─────────────────────────────────────────────────────────────────────────────
function gradeShift(input: {
  closeRate: number;
  closes: number;
  aggression: number;
}): {letter: 'A' | 'B' | 'C' | 'D' | 'F'; score: number} {
  // Close rate component: 0% → 0, 50%+ → full marks.
  const closeScore = Math.min(input.closeRate / 0.5, 1) * 35;
  // Volume: 0 closes → 0, 20+ → full marks.
  const volScore = Math.min(input.closes / 20, 1) * 20;
  // Aggression: 10/10 → full marks.
  const aggScore = (input.aggression / 10) * 15;
  // Job complete + retail intel default to 15 each in the stub (refined when
  // we have the full payload shape to evaluate).
  const jobScore = 15;
  const intelScore = 15;
  const total = closeScore + volScore + aggScore + jobScore + intelScore;
  const letter: 'A' | 'B' | 'C' | 'D' | 'F' =
    total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F';
  return {letter, score: Math.round(total)};
}
