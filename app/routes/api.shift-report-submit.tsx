import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {AwsClient} from 'aws4fetch';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shift-report-submit
// ─────────────────────────────────────────────────────────────────────────────
// Accepts a multipart/form-data submission from /shift-report, uploads photos
// to Cloudflare R2, and writes a structured row to Supabase (`shift_reports`).
//
// Two modes:
//   STUB     — Supabase or R2 env vars missing → validates payload, logs,
//              returns {ok:true, id:"stub-..."} so the UI flows while
//              infra is being set up. Intentional so we can ship the UI before
//              the backend is wired.
//   LIVE     — all env vars present → uploads photos to R2 → computes grade →
//              inserts row via PostgREST.
//
// Env vars required for LIVE mode (set in Oxygen):
//   SUPABASE_URL             https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY     service_role key (bypasses RLS)
//   R2_ACCOUNT_ID            Cloudflare account ID
//   R2_ACCESS_KEY_ID         R2 S3 API token access key
//   R2_SECRET_ACCESS_KEY     R2 S3 API token secret
//   R2_BUCKET                e.g. highsman-shift-reports
//   R2_PUBLIC_URL            e.g. https://pub-<id>.r2.dev (or custom domain)
//
// Expected form fields (all strings unless noted):
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
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_URL?: string;
};

type Grade = {letter: 'A' | 'B' | 'C' | 'D' | 'F'; score: number};

type Payload = {
  repName: string;
  accountId: string;
  accountName: string;
  accountCity: string;
  shiftDate: string;
  intercepts: number;
  closes: number;
  primaryObjection: string;
  objectionHandling: string;
  extraNotes: string[];
  salesFeedback: string;
  menuVisibility: string;
  merchSetup: string;
  merchOpportunity: string;
  promosSetup: string;
  managerFirst: string;
  managerLast: string;
  budtenderRating: number;
  productNotes: string;
  aggression: number;
  improvementNotes: string;
};

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, message: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as Env;
  const storageReady = Boolean(
    env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_KEY &&
      env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  );

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
  const payload: Payload = {
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
    if (m instanceof File && m.size > 0)
      photos.push({slot: `merch-${i + 1}`, file: m});
    const o = form.get(`opportunityPhoto${i}`);
    if (o instanceof File && o.size > 0)
      photos.push({slot: `opportunity-${i + 1}`, file: o});
  }

  // Grade computed up front so it lands in both stub + live responses.
  const closeRate =
    payload.intercepts > 0 ? payload.closes / payload.intercepts : 0;
  const grade = gradeShift({
    closeRate,
    closes: payload.closes,
    aggression: payload.aggression,
    intelFilled: countIntelFilled(payload),
  });

  // ─── STUB MODE ────────────────────────────────────────────────────────────
  if (!storageReady) {
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
        'Logged in stub mode (Supabase/R2 not yet configured). Answers captured server-side.',
    });
  }

  // ─── LIVE MODE ────────────────────────────────────────────────────────────
  // Generate report id client-side so both the R2 path and the DB row use it.
  const reportId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Step 1: upload all photos to R2 in parallel.
  let setupUrl = '';
  const merchUrls: string[] = [];
  const opportunityUrls: string[] = [];

  try {
    const uploaded = await uploadAllToR2(env, reportId, payload.shiftDate, photos);
    for (const {slot, url} of uploaded) {
      if (slot === 'setup') setupUrl = url;
      else if (slot.startsWith('merch-')) merchUrls.push(url);
      else if (slot.startsWith('opportunity-')) opportunityUrls.push(url);
    }
    if (!setupUrl) throw new Error('Setup photo upload failed silently');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[shift-report] R2 upload failed', err);
    return json(
      {
        ok: false,
        message:
          'Could not upload photos to storage. Try again — your answers are still filled in.',
      },
      {status: 502},
    );
  }

  // Step 2: insert row into Supabase via PostgREST.
  try {
    const dbRow = {
      id: reportId,
      rep_name: payload.repName,
      account_id: payload.accountId,
      account_name: payload.accountName,
      account_city: payload.accountCity || null,
      shift_date: payload.shiftDate,
      intercepts: payload.intercepts,
      closes: payload.closes,
      primary_objection: payload.primaryObjection || null,
      objection_handling: payload.objectionHandling || null,
      extra_notes: payload.extraNotes,
      sales_feedback: payload.salesFeedback || null,
      menu_visibility: payload.menuVisibility || null,
      merch_setup: payload.merchSetup || null,
      merch_opportunity: payload.merchOpportunity || null,
      promos_setup: payload.promosSetup || null,
      manager_first: payload.managerFirst || null,
      manager_last: payload.managerLast || null,
      budtender_rating: payload.budtenderRating || null,
      product_notes: payload.productNotes || null,
      aggression: payload.aggression,
      improvement_notes: payload.improvementNotes || null,
      setup_photo_url: setupUrl,
      merch_photo_urls: merchUrls,
      opportunity_photo_urls: opportunityUrls,
      grade_letter: grade.letter,
      grade_score: grade.score,
    };

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/shift_reports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_SERVICE_KEY!,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
        prefer: 'return=minimal',
      },
      body: JSON.stringify(dbRow),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error('[shift-report] Supabase insert failed', res.status, text);
      return json(
        {
          ok: false,
          message:
            'Photos uploaded but the database insert failed. Let Reid know with this ref: ' +
            reportId.slice(-8),
        },
        {status: 502},
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[shift-report] Supabase insert threw', err);
    return json(
      {
        ok: false,
        message:
          'Photos uploaded but saving the report failed. Try submitting again in a minute.',
      },
      {status: 502},
    );
  }

  return json({
    ok: true,
    id: reportId,
    grade,
    message: 'Shift report saved.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// R2 UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
async function uploadAllToR2(
  env: Env,
  reportId: string,
  shiftDate: string,
  photos: Array<{slot: string; file: File}>,
): Promise<Array<{slot: string; url: string}>> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  });

  const bucket = env.R2_BUCKET!;
  const accountId = env.R2_ACCOUNT_ID!;
  const publicBase = env.R2_PUBLIC_URL!.replace(/\/+$/, '');
  const yyyyMm = shiftDate.slice(0, 7); // "2026-04"

  // Upload in parallel — small photos, small Worker window.
  const tasks = photos.map(async ({slot, file}) => {
    const ext = pickExtension(file);
    const key = `shift-reports/${yyyyMm}/${reportId}/${slot}.${ext}`;
    const body = await file.arrayBuffer();

    const putUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURI(
      key,
    )}`;
    const signed = await client.sign(putUrl, {
      method: 'PUT',
      body,
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'content-length': String(body.byteLength),
      },
    });
    const res = await fetch(signed);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`R2 PUT failed (${res.status}) for ${key}: ${errText}`);
    }
    return {slot, url: `${publicBase}/${key}`};
  });

  return Promise.all(tasks);
}

function pickExtension(file: File): string {
  // Prefer the original filename extension when present (phone photos
  // usually give us 'IMG_xxxx.HEIC' / 'IMG_xxxx.jpg' / etc.).
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).replace(/[^a-z0-9]/g, '');
    if (ext.length <= 5) return ext;
  }
  // Fallback on mime type.
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'bin';
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING
// ─────────────────────────────────────────────────────────────────────────────
// Rubric (per Reid 2026-04-17, volume ceiling raised 20→50 on 2026-04-17):
//   Close rate    35%   — closes / intercepts (0% → 0, 50%+ → full)
//   Volume        20%   — absolute closes vs. 50-close baseline
//   Aggression    15%   — self-reported 1-10 flame rating
//   Job complete  15%   — required fields + photos (100% if we got here)
//   Retail intel  15%   — count of filled retail-intel fields / 7 possible
//
// Grade is stored on the row so future rubric changes don't retroactively
// change historical grades.
// ─────────────────────────────────────────────────────────────────────────────
function gradeShift(input: {
  closeRate: number;
  closes: number;
  aggression: number;
  intelFilled: number; // 0..7
}): Grade {
  const closeScore = Math.min(input.closeRate / 0.5, 1) * 35;
  const volScore = Math.min(input.closes / 50, 1) * 20;
  const aggScore = (input.aggression / 10) * 15;
  const jobScore = 15; // reached action = required fields present
  const intelScore = Math.min(input.intelFilled / 7, 1) * 15;
  const total = closeScore + volScore + aggScore + jobScore + intelScore;
  const letter: Grade['letter'] =
    total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F';
  return {letter, score: Math.round(total)};
}

// Count how many of the seven retail-intel fields were meaningfully filled.
function countIntelFilled(p: Payload): number {
  let n = 0;
  if (p.menuVisibility) n++;
  if (p.merchSetup) n++;
  if (p.merchOpportunity && p.merchOpportunity.length >= 10) n++;
  if (p.promosSetup) n++;
  if (p.managerFirst || p.managerLast) n++;
  if (p.budtenderRating > 0) n++;
  if (p.productNotes && p.productNotes.length >= 10) n++;
  return n;
}
