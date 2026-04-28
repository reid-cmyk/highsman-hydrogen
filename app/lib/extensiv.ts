// ─────────────────────────────────────────────────────────────────────────────
// Extensiv 3PL Warehouse Manager — Shared Client
// ─────────────────────────────────────────────────────────────────────────────
// Powers /retail's live inventory display + outbound order/shipment push.
//
// Mirrors the zoho-auth.ts pattern: one module-scope token cache shared by
// every route that talks to Extensiv, plus an in-flight promise singleton so
// concurrent callers on a cold-started worker await the same refresh instead
// of fanning out duplicate token requests.
//
// Auth flow (Extensiv 3PL Warehouse Manager REST v1):
//   POST https://secure-wms.com/AuthServer/api/Token
//     Headers:
//       Authorization: Basic base64(client_id:client_secret)
//       Content-Type: application/hal+json
//       Accept: application/hal+json
//     Body: {"grant_type":"client_credentials","user_login_id": <number>}
//   → 200 { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
//
// Reference: https://developer.extensiv.com/pages/3pl-wareshouse-manager.html
// ─────────────────────────────────────────────────────────────────────────────

type ExtensivEnv = {
  EXTENSIV_CLIENT_ID?: string;
  EXTENSIV_CLIENT_SECRET?: string;
  EXTENSIV_USER_LOGIN_ID?: string;   // numeric, but Oxygen vars are strings
  EXTENSIV_CUSTOMER_ID?: string;     // Highsman's customer record in the 3PL tenant
  EXTENSIV_FACILITY_ID?: string;     // physical warehouse — usually one
  EXTENSIV_API_BASE?: string;        // override for staging; defaults to secure-wms.com
  [k: string]: string | undefined;
};

const DEFAULT_API_BASE = 'https://secure-wms.com';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlight: Promise<string> | null = null;

// Extensiv tokens are issued with 1h life; cache for 55 min to stay clear of
// the expiry cliff. Same TTL choice as Zoho — same threat model.
const TTL_MS = 55 * 60 * 1000;

export function isExtensivConfigured(env: ExtensivEnv): boolean {
  return Boolean(
    env.EXTENSIV_CLIENT_ID &&
      env.EXTENSIV_CLIENT_SECRET &&
      env.EXTENSIV_USER_LOGIN_ID &&
      env.EXTENSIV_CUSTOMER_ID,
  );
}

function apiBase(env: ExtensivEnv): string {
  return (env.EXTENSIV_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
}

/**
 * Get a cached Extensiv access token, refreshing if expired. Concurrent
 * callers in the same worker tick await the same in-flight refresh.
 */
export async function getExtensivAccessToken(env: ExtensivEnv): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
  if (inFlight) return inFlight;

  if (!isExtensivConfigured(env)) {
    throw new Error('Extensiv not configured (missing client id/secret/user_login_id/customer_id)');
  }

  inFlight = (async () => {
    const basic = btoa(`${env.EXTENSIV_CLIENT_ID}:${env.EXTENSIV_CLIENT_SECRET}`);
    const res = await fetch(`${apiBase(env)}/AuthServer/api/Token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        // The /AuthServer/api/Token endpoint rejects hal+json with HTTP 415;
        // only the data endpoints (/inventory, /orders) want hal+json.
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        user_login_id: Number(env.EXTENSIV_USER_LOGIN_ID),
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Extensiv token fetch failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as {access_token?: string; expires_in?: number};
    if (!data.access_token) throw new Error('Extensiv token response missing access_token');
    cachedToken = data.access_token;
    // Use the response expiry if present, but cap at TTL_MS to be safe.
    const ttl = Math.min((data.expires_in ?? 3600) * 1000 - 60_000, TTL_MS);
    tokenExpiresAt = Date.now() + Math.max(ttl, 5 * 60 * 1000);
    return cachedToken;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryRow {
  sku: string;
  qty: number;        // available (on-hand minus allocated)
  onHand: number;     // raw on-hand
  allocated: number;
}

/**
 * Pull current inventory for our customer record. Returns {sku → qtyAvailable}.
 *
 * Extensiv's stock-detail endpoint paginates at pgsiz; we cap at 5 pages to
 * avoid pathological cases. For Highsman's merch catalog (~30 SKUs) one page
 * is enough.
 */
export async function getExtensivInventory(
  env: ExtensivEnv,
): Promise<Record<string, InventoryRow>> {
  const token = await getExtensivAccessToken(env);
  const cid = env.EXTENSIV_CUSTOMER_ID;
  const out: Record<string, InventoryRow> = {};

  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 5) {
    const url =
      `${apiBase(env)}/inventory?customerIdentifier.id=${encodeURIComponent(String(cid))}` +
      `&pgnum=${page}&pgsiz=200`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/hal+json',
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Extensiv inventory fetch failed: ${res.status} ${txt}`);
    }
    const data = (await res.json()) as any;

    // HAL+JSON shape: _embedded["http://api.3plCentral.com/rels/inventory/item"] = [...]
    const items =
      data?._embedded?.['http://api.3plCentral.com/rels/inventory/item'] ||
      data?._embedded?.item ||
      [];

    for (const it of items) {
      const sku: string | undefined = it.sku;
      if (!sku) continue;
      const onHand = Number(it.onHand ?? it.qty ?? 0) || 0;
      const allocated = Number(it.allocated ?? it.allocatedQty ?? 0) || 0;
      const available = Math.max(0, onHand - allocated);
      out[sku] = {sku, qty: available, onHand, allocated};
    }

    const totalResults = Number(data?.totalResults ?? items.length);
    if (page * 200 >= totalResults) hasMore = false;
    page++;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders (outbound shipments)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensivOrderLine {
  sku: string;
  qty: number;
}

export interface ExtensivShipTo {
  name: string;             // store / dispensary name
  contact?: string | null;  // contact person at the store
  address1: string;
  address2?: string | null;
  city: string;
  state: string;            // 2-letter
  zip: string;
  country?: string;         // ISO-2, defaults to "US"
  phone?: string | null;
  email?: string | null;
}

export interface CreateOrderArgs {
  /** Your reference, shows on Extensiv as the "customer reference" */
  referenceNum: string;
  /** Optional PO number — surfaced on packing slip */
  poNum?: string;
  shipTo: ExtensivShipTo;
  lines: ExtensivOrderLine[];
  /** Free text — printed on packing slip */
  notes?: string;
}

export interface CreateOrderResult {
  ok: boolean;
  orderId?: number | string;
  rawStatus?: number;
  errorBody?: string;
}

/**
 * Create an outbound order in Extensiv. Returns ok=false on any non-2xx so
 * /retail's action can fail-soft (still email njsales@, still record the
 * order) per the agreed contract.
 */
export async function createExtensivOrder(
  env: ExtensivEnv,
  args: CreateOrderArgs,
): Promise<CreateOrderResult> {
  const token = await getExtensivAccessToken(env);
  const customerId = Number(env.EXTENSIV_CUSTOMER_ID);
  const facilityId = env.EXTENSIV_FACILITY_ID
    ? Number(env.EXTENSIV_FACILITY_ID)
    : undefined;

  const body: any = {
    customerIdentifier: {id: customerId},
    referenceNum: args.referenceNum,
    poNum: args.poNum ?? args.referenceNum,
    notes: args.notes ?? '',
    shipTo: {
      name: args.shipTo.name,
      companyName: args.shipTo.name,
      address1: args.shipTo.address1,
      address2: args.shipTo.address2 ?? '',
      city: args.shipTo.city,
      state: args.shipTo.state,
      zip: args.shipTo.zip,
      country: args.shipTo.country ?? 'US',
      phoneNumber: args.shipTo.phone ?? '',
      emailAddress: args.shipTo.email ?? '',
      contactName: args.shipTo.contact ?? args.shipTo.name,
    },
    orderItems: args.lines.map((l) => ({
      sku: l.sku,
      qty: l.qty,
      qualifier: '',
    })),
  };
  if (facilityId) body.facilityIdentifier = {id: facilityId};

  const res = await fetch(`${apiBase(env)}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/hal+json',
      Accept: 'application/hal+json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return {ok: false, rawStatus: res.status, errorBody: txt.slice(0, 1000)};
  }
  const data = (await res.json().catch(() => ({}))) as any;
  return {ok: true, orderId: data?.readOnly?.orderId ?? data?.orderId};
}

// ─────────────────────────────────────────────────────────────────────────────
// Test-only escape hatch
// ─────────────────────────────────────────────────────────────────────────────
export function _resetExtensivTokenCacheForTests(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
  inFlight = null;
}
