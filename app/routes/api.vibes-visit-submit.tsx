import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {AwsClient} from 'aws4fetch';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vibes-visit-submit
// ─────────────────────────────────────────────────────────────────────────────
// Accepts the 5-screen Vibes Team check-in submission (Arrive / Audit / Train /
// Drop / Vibes). Uploads photos to Cloudflare R2, writes the visit row to
// Supabase (`brand_visits`), appends the live-training log rows
// (`budtender_training` with method='live'), appends the goodie spend
// (`goodie_log`), and decrements merch_inventory counts.
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

type Payload = {
  repId: string;
  repName: string;
  accountId: string;
  accountName: string;
  accountCity: string;
  accountState: string;
  visitDate: string;
  visitType:
    | 'first_visit'
    | 'rotation'
    | 'target_sample'
    | 'training'
    | 'other';
  checkedInAt: string | null;
  checkedOutAt: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  skusOnShelf: string[];
  skusMissing: string[];
  shelfPositionRating: number | null;
  decksTaught: string[];
  budtendersTrained: Array<{name: string; email?: string; moduleSlug?: string}>;
  goodieItems: Array<{item: string; cost: number}>;
  merchInstalled: Record<string, number>;
  vibesScore: number | null;
  notesToSales: string;
  spokeWithManager: boolean;
  ugcPostUrl: string;
};

const ALLOWED_VISIT_TYPES: Payload['visitType'][] = [
  'first_visit',
  'rotation',
  'target_sample',
  'training',
  'other',
];

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

  const required = [
    'repId',
    'repName',
    'accountId',
    'accountName',
    'visitDate',
    'visitType',
  ] as const;
  for (const key of required) {
    if (!form.get(key)) {
      return json({ok: false, message: `Missing ${key}`}, {status: 400});
    }
  }

  const vt = String(form.get('visitType'));
  if (!ALLOWED_VISIT_TYPES.includes(vt as any)) {
    return json({ok: false, message: 'Invalid visitType'}, {status: 400});
  }

  // Robust JSON helper
  const parseJson = <T,>(key: string, fallback: T): T => {
    const raw = form.get(key);
    if (raw == null || raw === '') return fallback;
    try {
      return JSON.parse(String(raw));
    } catch {
      return fallback;
    }
  };

  const payload: Payload = {
    repId: String(form.get('repId')),
    repName: String(form.get('repName')),
    accountId: String(form.get('accountId')),
    accountName: String(form.get('accountName')),
    accountCity: String(form.get('accountCity') || ''),
    accountState: String(form.get('accountState') || 'NJ'),
    visitDate: String(form.get('visitDate')),
    visitType: vt as Payload['visitType'],
    checkedInAt: (form.get('checkedInAt') as string) || null,
    checkedOutAt: (form.get('checkedOutAt') as string) || null,
    gpsLat: form.get('gpsLat') ? Number(form.get('gpsLat')) : null,
    gpsLng: form.get('gpsLng') ? Number(form.get('gpsLng')) : null,
    skusOnShelf: parseJson<string[]>('skusOnShelf', []),
    skusMissing: parseJson<string[]>('skusMissing', []),
    shelfPositionRating: form.get('shelfPositionRating')
      ? Number(form.get('shelfPositionRating'))
      : null,
    decksTaught: parseJson<string[]>('decksTaught', []),
    budtendersTrained: parseJson<Payload['budtendersTrained']>('budtendersTrained', []),
    goodieItems: parseJson<Payload['goodieItems']>('goodieItems', []),
    merchInstalled: parseJson<Record<string, number>>('merchInstalled', {}),
    vibesScore: form.get('vibesScore') ? Number(form.get('vibesScore')) : null,
    notesToSales: String(form.get('notesToSales') || ''),
    spokeWithManager: form.get('spokeWithManager') === 'true',
    ugcPostUrl: String(form.get('ugcPostUrl') || ''),
  };

  // Collect photos
  const photos: Array<{slot: string; file: File}> = [];
  const slots = ['shelf', 'before', 'after', 'selfie'] as const;
  for (const slot of slots) {
    const f = form.get(`${slot}Photo`);
    if (f instanceof File && f.size > 0) photos.push({slot, file: f});
  }

  // ─── STUB mode ────────────────────────────────────────────────────────────
  if (!storageReady) {
    console.log('[vibes-visit] stub submission', {
      payload,
      photos: photos.map((p) => ({slot: p.slot, name: p.file.name, size: p.file.size})),
    });
    return json({
      ok: true,
      id: `stub-${Date.now()}`,
      message:
        'Logged in stub mode (Supabase/R2 not yet configured). Visit captured server-side.',
    });
  }

  const visitId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // ─── Upload photos to R2 ──────────────────────────────────────────────────
  const photoUrls: Record<string, string> = {};
  if (photos.length) {
    try {
      const uploaded = await uploadAllToR2(env, visitId, payload.visitDate, photos);
      for (const {slot, url} of uploaded) photoUrls[slot] = url;
    } catch (err) {
      console.error('[vibes-visit] R2 upload failed', err);
      return json(
        {ok: false, message: 'Photo upload failed. Your answers are still filled in — try again.'},
        {status: 502},
      );
    }
  }

  // ─── Insert brand_visits ──────────────────────────────────────────────────
  const goodieTotal = payload.goodieItems.reduce(
    (sum, g) => sum + (Number(g.cost) || 0),
    0,
  );

  const visitRow = {
    id: visitId,
    rep_id: payload.repId,
    rep_name: payload.repName,
    account_id: payload.accountId,
    account_name: payload.accountName,
    account_city: payload.accountCity || null,
    account_state: payload.accountState || 'NJ',
    visit_date: payload.visitDate,
    visit_type: payload.visitType,
    checked_in_at: payload.checkedInAt,
    checked_out_at: payload.checkedOutAt,
    gps_lat: payload.gpsLat,
    gps_lng: payload.gpsLng,
    skus_on_shelf: payload.skusOnShelf,
    skus_missing: payload.skusMissing,
    shelf_position_rating: payload.shelfPositionRating,
    decks_taught: payload.decksTaught,
    budtenders_trained: payload.budtendersTrained.map((b) =>
      typeof b === 'string' ? b : b.name,
    ),
    goodie_total_spent: goodieTotal,
    merch_installed: payload.merchInstalled || {},
    vibes_score: payload.vibesScore,
    notes_to_sales_team: payload.notesToSales || null,
    spoke_with_manager: payload.spokeWithManager,
    shelf_photo_url: photoUrls.shelf || null,
    before_photo_url: photoUrls.before || null,
    after_photo_url: photoUrls.after || null,
    selfie_url: photoUrls.selfie || null,
    ugc_post_url: payload.ugcPostUrl || null,
  };

  try {
    const r = await supaPost(env, 'brand_visits', visitRow);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('[vibes-visit] brand_visits insert failed', r.status, text);
      return json(
        {
          ok: false,
          message:
            'Photos saved but visit insert failed. Ref: ' + visitId.slice(-8),
        },
        {status: 502},
      );
    }
  } catch (err) {
    console.error('[vibes-visit] brand_visits insert threw', err);
    return json({ok: false, message: 'Could not save visit.'}, {status: 502});
  }

  // ─── Insert budtender_training rows (live) ────────────────────────────────
  if (payload.budtendersTrained.length && payload.decksTaught.length) {
    const rows: any[] = [];
    for (const bt of payload.budtendersTrained) {
      const btName = typeof bt === 'string' ? bt : bt.name;
      if (!btName) continue;
      const btEmail = typeof bt === 'string' ? null : bt.email || null;
      // If the bud specifies a module, pair it; otherwise pair against each deck taught
      const modules =
        typeof bt === 'object' && bt.moduleSlug
          ? [bt.moduleSlug]
          : payload.decksTaught;
      for (const m of modules) {
        rows.push({
          method: 'live',
          budtender_name: btName,
          budtender_email: btEmail,
          store_account_id: payload.accountId,
          store_account_name: payload.accountName,
          module_slug: m,
          trained_by_rep_id: payload.repId,
          visit_id: visitId,
          completed_at: payload.checkedOutAt || new Date().toISOString(),
        });
      }
    }
    if (rows.length) {
      try {
        await supaPost(env, 'budtender_training', rows);
      } catch (err) {
        console.warn('[vibes-visit] budtender_training insert failed (non-fatal)', err);
      }
    }
  }

  // ─── Insert goodie_log rows ───────────────────────────────────────────────
  if (payload.goodieItems.length) {
    const gRows = payload.goodieItems
      .filter((g) => g.item && g.cost >= 0)
      .map((g) => ({
        visit_id: visitId,
        rep_id: payload.repId,
        store_account_id: payload.accountId,
        store_account_name: payload.accountName,
        item: g.item,
        cost: g.cost,
        spent_on: payload.visitDate,
      }));
    if (gRows.length) {
      try {
        await supaPost(env, 'goodie_log', gRows);
      } catch (err) {
        console.warn('[vibes-visit] goodie_log insert failed (non-fatal)', err);
      }
    }
  }

  // ─── Decrement merch_inventory ────────────────────────────────────────────
  if (payload.merchInstalled && Object.keys(payload.merchInstalled).length) {
    for (const [slug, qty] of Object.entries(payload.merchInstalled)) {
      if (!qty || qty <= 0) continue;
      try {
        // Find current row
        const curRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/merch_inventory?rep_id=eq.${encodeURIComponent(
            payload.repId,
          )}&item_slug=eq.${encodeURIComponent(slug)}&select=id,qty_on_hand`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY!,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
            },
          },
        );
        if (!curRes.ok) continue;
        const rows = await curRes.json();
        const cur = rows?.[0];
        if (!cur) continue;
        const newQty = Math.max(0, (cur.qty_on_hand || 0) - qty);
        await fetch(
          `${env.SUPABASE_URL}/rest/v1/merch_inventory?id=eq.${cur.id}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              apikey: env.SUPABASE_SERVICE_KEY!,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
              prefer: 'return=minimal',
            },
            body: JSON.stringify({qty_on_hand: newQty, updated_at: new Date().toISOString()}),
          },
        );
      } catch (err) {
        console.warn('[vibes-visit] merch decrement failed', slug, err);
      }
    }
  }

  // ─── UGC review queue (only if @highsman tagged — rep self-reports) ───────
  if (payload.ugcPostUrl) {
    try {
      await supaPost(env, 'ugc_review_queue', {
        rep_id: payload.repId,
        visit_id: visitId,
        post_url: payload.ugcPostUrl,
      });
    } catch (err) {
      console.warn('[vibes-visit] UGC queue insert failed (non-fatal)', err);
    }
  }

  return json({
    ok: true,
    id: visitId,
    goodieTotal,
    message: 'Visit saved.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function supaPost(env: Env, table: string, body: any) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
      prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function uploadAllToR2(
  env: Env,
  visitId: string,
  visitDate: string,
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
  const yyyyMm = visitDate.slice(0, 7);

  const tasks = photos.map(async ({slot, file}) => {
    const ext = pickExtension(file);
    const key = `brand-visits/${yyyyMm}/${visitId}/${slot}.${ext}`;
    const body = await file.arrayBuffer();
    const putUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURI(key)}`;
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
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).replace(/[^a-z0-9]/g, '');
    if (ext.length <= 5) return ext;
  }
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('webp')) return 'webp';
  return 'bin';
}
