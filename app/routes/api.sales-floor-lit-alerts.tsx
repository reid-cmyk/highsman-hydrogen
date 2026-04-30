import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Lit Alerts proxy
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-lit-alerts
//   → { ok, fetchedAt, sourceUpdatedAt, offMenu: [...], lowInventory: [...], meta }
//
// Server-side proxy to the `lit-alerts-api` service running on the OpenClaw
// VPS (PM2-managed Node service on localhost:3110, exposed via Tailscale
// Funnel at `/lit-alerts-api`). See:
//   • Highsman/Website Integration/api-contract-lit-alerts.md (canonical
//     JSON shape; both sides build to it).
//   • github.com/Highsman/lit-alerts (lit-alerts-api.js + lit-alerts.js).
//
// Powers two columns on the Sales Floor `/orders` tab:
//   • Off Menu Alert (Col 3, red/critical) — retailers where every SKU
//     in their 60-day active set is currently OOS.
//   • Low Inventory Alert (Col 2, orange) — retailers in the 30-day
//     reorder-due cooldown window who are NOT also off menu.
//
// Auth model:
//   • Hydrogen → VPS: `Authorization: Bearer ${LIT_ALERTS_API_TOKEN}`. This
//     token is set in Shopify admin → Hydrogen → Environments → Production
//     and is NEVER exposed client-side.
//   • Caller → Hydrogen: same /sales-floor cookie as the rest of the
//     dashboard (rep auth via getRepFromRequest).
//
// Soft-degrade pattern (matches Zoho/LeafLink on preview deploys per
// decisions.md 2026-04-29): if `LIT_ALERTS_API_URL` or `LIT_ALERTS_API_TOKEN`
// are missing — typical on Oxygen PR preview deploys, which don't inherit
// production env vars — return empty arrays + meta.error="not_configured"
// so the dashboard renders cleanly. The Lit columns surface a friendly
// "not configured on this deploy" message instead of erroring.
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 6000;

type LitProduct = {name: string; productId: number};
type LitProductLow = {name: string; productId: number; stock: number};

type OffMenuRow = {
  zohoAccountId: string;
  zohoName: string;
  stateCode: string;
  retailerName: string;
  litRetailerId: string;
  activeSkuCount: number;
  lastHealthyAt: string;
  products: LitProduct[];
};

type LowInvRow = {
  zohoAccountId: string;
  zohoName: string;
  stateCode: string;
  retailerName: string;
  litRetailerId: string;
  activeSkuCount: number;
  score: number;
  maxScore: number;
  scorePct: number;
  triggeredAt: string;
  oosSkus: LitProduct[];
  lowSkus: LitProductLow[];
  healthySkus: LitProductLow[];
};

type SnapshotResponse = {
  ok: boolean;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  offMenu: OffMenuRow[];
  lowInventory: LowInvRow[];
  meta: {
    unmappedOffMenuCount: number;
    unmappedLowInvCount: number;
    totalRetailersInState: Record<string, number>;
    errors: string[];
    error?: string;
  };
};

function emptyResponse(errorCode: string | null = null): SnapshotResponse {
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: null,
    offMenu: [],
    lowInventory: [],
    meta: {
      unmappedOffMenuCount: 0,
      unmappedLowInvCount: 0,
      totalRetailersInState: {},
      errors: errorCode ? [errorCode] : [],
      ...(errorCode ? {error: errorCode} : {}),
    },
  };
}

async function fetchT(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: ctrl.signal});
  } finally {
    clearTimeout(t);
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  const url = env.LIT_ALERTS_API_URL;
  const token = env.LIT_ALERTS_API_TOKEN;

  // Preview / unconfigured envs fall through here. Returns 200 + empty
  // payload so the client-side soft-degrade renders friendly copy.
  if (!url || !token) {
    return json(emptyResponse('not_configured'), {
      headers: {'Cache-Control': 'private, max-age=30'},
    });
  }

  try {
    const upstream = await fetchT(
      `${url.replace(/\/$/, '')}/alerts/snapshot`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
      FETCH_TIMEOUT_MS,
    );

    if (!upstream.ok) {
      console.warn(`[sf-lit-alerts] upstream returned ${upstream.status}`);
      return json(emptyResponse(`upstream_${upstream.status}`), {
        headers: {'Cache-Control': 'private, max-age=30'},
      });
    }

    const data = (await upstream.json()) as SnapshotResponse;
    if (!data?.ok) {
      const code = (data as any)?.error || 'upstream_error';
      console.warn(`[sf-lit-alerts] upstream returned ok=false: ${code}`);
      return json(emptyResponse(code), {
        headers: {'Cache-Control': 'private, max-age=30'},
      });
    }

    // Defensive: ensure arrays exist even if upstream omits them.
    const safe: SnapshotResponse = {
      ok: true,
      fetchedAt: data.fetchedAt || new Date().toISOString(),
      sourceUpdatedAt: data.sourceUpdatedAt || null,
      offMenu: Array.isArray(data.offMenu) ? data.offMenu : [],
      lowInventory: Array.isArray(data.lowInventory) ? data.lowInventory : [],
      meta: {
        unmappedOffMenuCount: Number(data.meta?.unmappedOffMenuCount || 0),
        unmappedLowInvCount: Number(data.meta?.unmappedLowInvCount || 0),
        totalRetailersInState:
          (data.meta?.totalRetailersInState && typeof data.meta.totalRetailersInState === 'object')
            ? data.meta.totalRetailersInState
            : {},
        errors: Array.isArray(data.meta?.errors) ? data.meta.errors : [],
      },
    };

    return json(safe, {
      headers: {'Cache-Control': 'private, max-age=30'},
    });
  } catch (err: any) {
    console.error('[sf-lit-alerts] fetch threw:', err?.message);
    return json(emptyResponse('upstream_unreachable'), {
      headers: {'Cache-Control': 'private, max-age=30'},
    });
  }
}
