import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {AwsClient} from 'aws4fetch';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vibes-visit-submit
// ─────────────────────────────────────────────────────────────────────────────
// Accepts the 5-screen Vibes Team check-in submission (Arrive / Audit / Train /
// Drop / Vibes). Because dispensaries do not display live cannabis on open
// shelves, the Audit focuses on:
//   • SKUs in stock   — JSONB map { [formatSlug]: { [strainSlug]: true } }
//   • Merch visible   — JSONB map { [merchItemId]: count } of Highsman
//                        merchandising on the floor (from MERCH_ITEMS catalog)
//   • 1–3 photos      — shots of Highsman merch actually in-store
// The Drop step tracks goodie spend and what the rep physically dropped off
// (counts + up to 3 photos) so per-store merch inventory stays accurate.
//
// Uploads photos to Cloudflare R2, writes to Supabase `brand_visits`, appends
// training and goodie log rows.
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_URL?: string;
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
  KLAVIYO_PRIVATE_KEY?: string;
  KLAVIYO_PRIVATE_API_KEY?: string;
};

// ─── Budtender Training Camp — Klaviyo list ─────────────────────────────────
const BUDTENDER_TRAINING_LIST_ID = 'WBSrLZ';
const KLAVIYO_REVISION = '2024-10-15';

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
  // New merchandising-first audit model
  skuStock: Record<string, Record<string, boolean>>;
  merchVisible: Record<string, number>;
  // Training
  decksTaught: string[];
  budtendersTrained: Array<{name: string; email?: string; moduleSlug?: string}>;
  // Drop
  goodieItems: Array<{item: string; cost: number}>;
  dropoffs: Record<string, number>;
  // Menus (NEW)
  menuInstoreChecked: boolean;
  menuInstoreNA: boolean;
  menuInstoreAudit: Record<string, any>;
  menuOnlineChecked: boolean;
  menuOnlineNA: boolean;
  menuOnlineUrl: string;
  menuOnlineAudit: Record<string, any>;
  // Vibes
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

// Accept up to 3 pics per indexed photo slot. Keep conservative to avoid
// runaway uploads on a flaky cell signal.
const MAX_INDEXED_PHOTOS = 3;

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

  // Budtender count — the training goal for this store.
  // `budtenderCount` is the (possibly edited) value the rep saw on screen;
  // `budtenderCountOriginal` is what was loaded from Zoho. If they differ,
  // we PATCH the Zoho Account below.
  //
  // This is a hard requirement: every Vibes visit must leave the store with
  // a known budtender headcount so the program has a measurable training
  // target. The client also blocks Continue on this, but we enforce it
  // server-side as a belt-and-suspenders safety net.
  const budtenderCountRaw = form.get('budtenderCount');
  const budtenderCountOrigRaw = form.get('budtenderCountOriginal');
  const budtenderCount =
    budtenderCountRaw != null && budtenderCountRaw !== ''
      ? Number(budtenderCountRaw)
      : null;
  const budtenderCountOrig =
    budtenderCountOrigRaw != null && budtenderCountOrigRaw !== ''
      ? Number(budtenderCountOrigRaw)
      : null;

  if (
    budtenderCount == null ||
    !Number.isFinite(budtenderCount) ||
    budtenderCount <= 0
  ) {
    return json(
      {
        ok: false,
        message:
          "Please ask the manager how many budtenders work at this store — that's the training target.",
      },
      {status: 400},
    );
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
    skuStock: parseJson<Record<string, Record<string, boolean>>>('skuStock', {}),
    merchVisible: parseJson<Record<string, number>>('merchVisible', {}),
    decksTaught: parseJson<string[]>('decksTaught', []),
    budtendersTrained: parseJson<Payload['budtendersTrained']>('budtendersTrained', []),
    goodieItems: parseJson<Payload['goodieItems']>('goodieItems', []),
    dropoffs: parseJson<Record<string, number>>('dropoffs', {}),
    menuInstoreChecked: form.get('menuInstoreChecked') === 'true',
    menuInstoreNA: form.get('menuInstoreNA') === 'true',
    menuInstoreAudit: parseJson<Record<string, any>>('menuInstoreAudit', {}),
    menuOnlineChecked: form.get('menuOnlineChecked') === 'true',
    menuOnlineNA: form.get('menuOnlineNA') === 'true',
    menuOnlineUrl: String(form.get('menuOnlineUrl') || ''),
    menuOnlineAudit: parseJson<Record<string, any>>('menuOnlineAudit', {}),
    vibesScore: form.get('vibesScore') ? Number(form.get('vibesScore')) : null,
    notesToSales: String(form.get('notesToSales') || ''),
    spokeWithManager: form.get('spokeWithManager') === 'true',
    ugcPostUrl: String(form.get('ugcPostUrl') || ''),
  };

  // ─── Collect photos ──────────────────────────────────────────────────────
  // Two indexed multi-photo groups + a single selfie slot.
  type PhotoTask = {group: string; index: number; file: File};
  const photos: PhotoTask[] = [];

  // Indexed groups: merchVisiblePhoto_0..N, dropoffPhoto_0..N,
  // menuInstorePhoto_0..N, menuOnlinePhoto_0..N
  const indexedGroups = [
    'merchVisiblePhoto',
    'dropoffPhoto',
    'menuInstorePhoto',
    'menuOnlinePhoto',
  ] as const;
  for (const group of indexedGroups) {
    for (let i = 0; i < MAX_INDEXED_PHOTOS; i++) {
      const f = form.get(`${group}_${i}`);
      if (f instanceof File && f.size > 0) {
        photos.push({group, index: i, file: f});
      }
    }
  }

  // Single selfie slot
  const selfieField = form.get('selfiePhoto');
  const selfieFile =
    selfieField instanceof File && selfieField.size > 0 ? selfieField : null;
  if (selfieFile) {
    photos.push({group: 'selfie', index: 0, file: selfieFile});
  }

  // ─── STUB mode ────────────────────────────────────────────────────────────
  if (!storageReady) {
    console.log('[vibes-visit] stub submission', {
      payload,
      photos: photos.map((p) => ({
        group: p.group,
        index: p.index,
        name: p.file.name,
        size: p.file.size,
      })),
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
  let uploaded: Array<{group: string; index: number; url: string}> = [];
  if (photos.length) {
    try {
      uploaded = await uploadAllToR2(env, visitId, payload.visitDate, photos);
    } catch (err) {
      console.error('[vibes-visit] R2 upload failed', err);
      return json(
        {ok: false, message: 'Photo upload failed. Your answers are still filled in — try again.'},
        {status: 502},
      );
    }
  }

  // Group uploaded URLs
  const merchVisiblePhotoUrls = uploaded
    .filter((u) => u.group === 'merchVisiblePhoto')
    .sort((a, b) => a.index - b.index)
    .map((u) => u.url);
  const dropoffPhotoUrls = uploaded
    .filter((u) => u.group === 'dropoffPhoto')
    .sort((a, b) => a.index - b.index)
    .map((u) => u.url);
  const menuInstorePhotoUrls = uploaded
    .filter((u) => u.group === 'menuInstorePhoto')
    .sort((a, b) => a.index - b.index)
    .map((u) => u.url);
  const menuOnlinePhotoUrls = uploaded
    .filter((u) => u.group === 'menuOnlinePhoto')
    .sort((a, b) => a.index - b.index)
    .map((u) => u.url);
  const selfieUrl = uploaded.find((u) => u.group === 'selfie')?.url || null;

  // ─── Insert brand_visits ──────────────────────────────────────────────────
  const goodieTotal = payload.goodieItems.reduce(
    (sum, g) => sum + (Number(g.cost) || 0),
    0,
  );

  // Summary counter for dashboards: how many menu-accuracy issues did Serena
  // flag across both menus on this visit? Counts `wrong` checks and also
  // counts any SKU she marked as "not on the menu but expected" (onMenu=false).
  const menuFlags =
    countMenuFlags(payload.menuInstoreAudit) +
    countMenuFlags(payload.menuOnlineAudit);

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
    // Merchandising-first audit
    sku_stock: payload.skuStock || {},
    merch_visible: payload.merchVisible || {},
    merch_visible_photo_urls: merchVisiblePhotoUrls,
    // Training
    decks_taught: payload.decksTaught,
    budtenders_trained: payload.budtendersTrained.map((b) =>
      typeof b === 'string' ? b : b.name,
    ),
    // Drop
    goodie_total_spent: goodieTotal,
    dropoffs: payload.dropoffs || {},
    dropoff_photo_urls: dropoffPhotoUrls,
    // Menus — every visit, Serena audits the in-store digital menu AND the
    // online menu for photo / category / brand / size / price accuracy.
    // Per-SKU JSONB payload lets the sales team drill in by SKU to fix issues.
    menu_instore_checked: payload.menuInstoreChecked,
    menu_instore_na: payload.menuInstoreNA,
    menu_instore_audit: payload.menuInstoreAudit || {},
    menu_instore_photo_urls: menuInstorePhotoUrls,
    menu_online_checked: payload.menuOnlineChecked,
    menu_online_na: payload.menuOnlineNA,
    menu_online_url: payload.menuOnlineUrl || null,
    menu_online_audit: payload.menuOnlineAudit || {},
    menu_online_photo_urls: menuOnlinePhotoUrls,
    menu_flags: menuFlags,
    // Vibes
    vibes_score: payload.vibesScore,
    notes_to_sales_team: payload.notesToSales || null,
    spoke_with_manager: payload.spokeWithManager,
    selfie_url: selfieUrl,
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

  // ─── Zoho: PATCH updated budtender count (non-fatal) ─────────────────────
  // If the rep corrected the number on screen, write it back so every future
  // visit has the right training goal. Wrapped in try/catch — visit already
  // saved, this can fail without blocking the response.
  if (
    payload.accountId &&
    budtenderCount != null &&
    Number.isFinite(budtenderCount) &&
    budtenderCount !== budtenderCountOrig
  ) {
    try {
      await patchZohoBudtenderCount(env, payload.accountId, budtenderCount);
    } catch (err) {
      console.warn('[vibes-visit] Zoho budtender-count PATCH failed (non-fatal)', err);
    }
  }

  // ─── Zoho: stamp [ONBOARDED] note on first_visit (non-fatal) ─────────────
  // Serena finishing the brand-team onboarding visit is the trigger that
  // graduates the store from the Sales Floor "New Customers" tab. The
  // leaflink-orders endpoint detects this note prefix and flips cardState to
  // 'done' on the next sync, which `combinedNewCustomers()` filters out.
  //
  // Visit type 'first_visit' is the brand-team onboarding (Tier 1). All
  // other visit types (rotation, training, target_sample, other) are
  // recurring/check-in visits and don't graduate the account.
  if (payload.visitType === 'first_visit' && payload.accountId) {
    try {
      await writeOnboardedNoteToZoho(env, payload.accountId, {
        accountName: payload.accountName,
        repName: payload.repName,
        visitDate: payload.visitDate,
        notesToSales: payload.notesToSales || null,
      });
    } catch (err) {
      console.warn('[vibes-visit] Zoho ONBOARDED note write failed (non-fatal)', err);
    }
  }

  // ─── Klaviyo: enroll captured emails into Budtender Training Camp ────────
  // Every budtender the rep captured with a valid email goes straight onto
  // list WBSrLZ. They get added with store_account_id + store_name properties
  // so we can slice sign-ups by store later.
  const klaviyoKey = env.KLAVIYO_PRIVATE_KEY || env.KLAVIYO_PRIVATE_API_KEY;
  if (klaviyoKey && payload.budtendersTrained.length) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const bt of payload.budtendersTrained) {
      if (typeof bt !== 'object' || !bt.email) continue;
      const email = bt.email.trim().toLowerCase();
      if (!emailRe.test(email)) continue;
      try {
        await enrollBudtenderInTrainingCamp(
          klaviyoKey,
          email,
          bt.name || '',
          payload.accountId,
          payload.accountName,
        );
      } catch (err) {
        console.warn(
          `[vibes-visit] Klaviyo enrollment failed for ${email} (non-fatal)`,
          err,
        );
      }
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
  photos: Array<{group: string; index: number; file: File}>,
): Promise<Array<{group: string; index: number; url: string}>> {
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

  const tasks = photos.map(async ({group, index, file}) => {
    const ext = pickExtension(file);
    // Single slots (selfie) keep a clean filename; indexed slots include an index.
    const filename =
      group === 'selfie' ? `selfie.${ext}` : `${group}-${index}.${ext}`;
    const key = `brand-visits/${yyyyMm}/${visitId}/${filename}`;
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
    return {group, index, url: `${publicBase}/${key}`};
  });
  return Promise.all(tasks);
}

// Count every menu-accuracy issue so the sales team can triage at a glance
// (without parsing the full JSONB per row).
//   • Each per-SKU check (photo/category/brand/size/price) marked 'wrong' = +1
//   • A SKU marked "onMenu === false" while it should be carried          = +1
function countMenuFlags(audit: Record<string, any>): number {
  if (!audit || typeof audit !== 'object') return 0;
  let flags = 0;
  const checkKeys = ['photo', 'category', 'brand', 'size', 'price'] as const;
  for (const key of Object.keys(audit)) {
    const entry = audit[key];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.onMenu === false) flags += 1;
    for (const ck of checkKeys) {
      if (entry[ck] === 'wrong') flags += 1;
    }
  }
  return flags;
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

// ─── Zoho helpers ───────────────────────────────────────────────────────────

async function patchZohoBudtenderCount(
  env: Env,
  accountId: string,
  count: number,
): Promise<void> {
  const token = await getZohoToken(env);
  const res = await fetch(
    `https://www.zohoapis.com/crm/v7/Accounts/${encodeURIComponent(accountId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Zoho-oauthtoken ${token}`,
      },
      body: JSON.stringify({
        data: [
          {
            id: accountId,
            Number_of_Budtenders: count,
          },
        ],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho PATCH failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

// Stamp a `[ONBOARDED]` Zoho Note on the Account when Serena completes a
// `first_visit`. The Sales Floor New Customers tab reads this prefix as the
// "remove me" signal — once the note exists, the next sync flips the card's
// cardState to 'done' and combinedNewCustomers() drops the row.
//
// We mirror the [CHECKIN-12D] convention from api.sales-floor-checkin-done so
// the leaflink-orders endpoint can detect either marker with one search.
//
// Non-fatal: the brand_visits insert already saved the visit. If Zoho is down
// or we get rate-limited, the card just stays visible until the next visit
// or the 12-day check-in note lands. The whole flow stays consistent.
async function writeOnboardedNoteToZoho(
  env: Env,
  accountId: string,
  payload: {
    accountName: string;
    repName: string;
    visitDate: string;
    notesToSales: string | null;
  },
): Promise<void> {
  const token = await getZohoToken(env);
  const noteTitle = `[ONBOARDED] ${payload.visitDate} — ${payload.repName}`;
  const noteContent = [
    `Brand-team onboarding visit completed by ${payload.repName} on ${payload.visitDate}.`,
    `Account: ${payload.accountName}`,
    payload.notesToSales ? `Notes to sales: ${payload.notesToSales}` : '',
    'This account has graduated from the New Customers tab. The 12-day check-in note ([CHECKIN-12D]) will be logged separately when due.',
  ]
    .filter(Boolean)
    .join('\n');

  const notePayload = {
    data: [
      {
        Note_Title: noteTitle,
        Note_Content: noteContent,
        Parent_Id: accountId,
        $se_module: 'Accounts',
      },
    ],
  };

  const res = await fetch('https://www.zohoapis.com/crm/v7/Notes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Zoho-oauthtoken ${token}`,
    },
    body: JSON.stringify(notePayload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho ONBOARDED note POST failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

// ─── Klaviyo: Budtender Training Camp enrollment ────────────────────────────
async function klaviyoFetch(
  url: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: KLAVIYO_REVISION,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Klaviyo ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

async function enrollBudtenderInTrainingCamp(
  apiKey: string,
  email: string,
  name: string,
  storeAccountId: string,
  storeName: string,
): Promise<void> {
  // 1. Upsert the profile with budtender metadata
  const [firstName, ...lastParts] = (name || '').trim().split(' ');
  const lastName = lastParts.join(' ');
  await klaviyoFetch(
    'https://a.klaviyo.com/api/profile-import/',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email,
            ...(firstName ? {first_name: firstName} : {}),
            ...(lastName ? {last_name: lastName} : {}),
            properties: {
              is_budtender: true,
              store_account_id: storeAccountId,
              store_name: storeName,
              enrolled_via: 'live_vibes_visit',
              enrolled_at: new Date().toISOString(),
            },
          },
        },
      }),
    },
  );

  // 2. Subscribe to Budtender Training Camp list (WBSrLZ)
  await klaviyoFetch(
    'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email,
                    subscriptions: {
                      email: {marketing: {consent: 'SUBSCRIBED'}},
                    },
                  },
                },
              ],
            },
            historical_import: false,
          },
          relationships: {
            list: {
              data: {type: 'list', id: BUDTENDER_TRAINING_LIST_ID},
            },
          },
        },
      }),
    },
  );
}
