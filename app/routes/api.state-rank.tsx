/**
 * app/routes/api.state-rank.tsx
 *
 * GET /api/state-rank?state=NJ&name=Premo
 * Returns the rank of a dispensary among ALL retailers in its state
 * by total cannabis revenue (all brands, not just Highsman).
 * Also returns litRetailerId for use in analytics calls.
 *
 * Source: Lit Alerts /v1/market/retailers?returnDollarValues=true (90-day rolling)
 * Falls back to Supabase last_order_date ranking if Lit token missing.
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

// Simple in-memory cache — keyed by state, refreshes after 1 hour
// Cloudflare Workers: each worker instance has its own memory, so this is
// per-instance (not global), but dramatically reduces API load in practice.
const marketCache = new Map<string, {data: any[]; cachedAt: number}>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const LIT_API = 'https://partnerapi.litalerts.com';

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fmtDate(d: Date): string {
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}-${d.getFullYear()}`;
}

export async function loader({request, context}: LoaderFunctionArgs) {
  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({rank: null, total: null, error: 'unauthorized'}, {status: 401});
  }

  const env  = (context as any).env;
  const url  = new URL(request.url);
  const state   = url.searchParams.get('state')  || '';
  const orgName = url.searchParams.get('name')   || '';
  const litId   = url.searchParams.get('lit_id') || ''; // skip name match if ID already known

  if (!state) return json({rank: null, total: null, error: 'state required'});

  // ── Fast path: read pre-computed market intel from Supabase (updated nightly) ──
  // Accept org_id param for direct lookup (fastest)
  const orgId = url.searchParams.get('org_id') || '';
  if (orgId) {
    try {
      const sbH = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=market_rank,market_total,market_revenue_90d,lit_retailer_id,hs_brand_rank,hs_brand_total,hs_share_pct,market_intel_updated_at`,
        {headers: sbH},
      );
      const rows = await res.json().catch(() => []);
      const org = Array.isArray(rows) ? rows[0] : null;
      if (org?.market_rank) {
        return json({
          rank:          org.market_rank,
          total:         org.market_total,
          revenue:       org.market_revenue_90d,
          litRetailerId: org.lit_retailer_id,
          hsBrandRank:   org.hs_brand_rank,
          hsBrandTotal:  org.hs_brand_total,
          hsSharePct:    org.hs_share_pct,
          updatedAt:     org.market_intel_updated_at,
          source:        'supabase-cached',
        });
      }
    } catch { /* fall through to live API */ }
  }

  const token = env.LIT_ALERTS_TOKEN;

  if (token) {
    try {
      // Rolling 90-day window — most current market picture
      const endDate   = new Date();
      const beginDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Check cache first
      const cacheKey = state;
      const cached = marketCache.get(cacheKey);
      let retailers: any[] = [];

      if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        retailers = cached.data;
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8s max
        const res = await fetch(
          `${LIT_API}/v1/market/retailers?state=${state}&beginDate=${fmtDate(beginDate)}&endDate=${fmtDate(endDate)}&returnDollarValues=true`,
          {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}, signal: controller.signal},
        );
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          retailers = data?.results || [];
          if (retailers.length > 0) {
            marketCache.set(cacheKey, {data: retailers, cachedAt: Date.now()});
          }
        }
      }

      // results = [{name, id, estimatedAmount}] sorted by estimatedAmount DESC
      {
        const total = retailers.length;

        if (total === 0) {
          return json({rank: null, total: 0, source: 'lit-market', note: 'no market data'});
        }

        // Match by Lit ID first (exact), then name fuzzy
        let idx = litId ? retailers.findIndex(r => String(r.id) === litId) : -1;
        if (idx === -1 && orgName) {
          const normTarget = normalize(orgName);
          idx = retailers.findIndex(r => {
            const n = normalize(r.name || '');
            return n === normTarget || n.includes(normTarget) || normTarget.includes(n);
          });
        }

        if (idx >= 0) {
          const r = retailers[idx];
          return json({
            rank:          idx + 1,
            total,
            revenue:       r.estimatedAmount,
            litRetailerId: r.id,
            retailerName:  r.name,
            source:        'lit-market',
          });
        }

        return json({rank: null, total, source: 'lit-market', note: 'not found in market data'});
      }
    } catch (err: any) {
      console.warn('[api/state-rank] Lit API error:', err.message);
    }
  }

  // ── Fallback: Supabase rank by last_order_date ────────────────────────────
  try {
    const sbH = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
    const sbRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizations?select=id,name,last_order_date&market_state=eq.${state}&lifecycle_stage=in.(active,dormant)&order=last_order_date.desc.nullslast&limit=500`,
      {headers: sbH},
    );
    const orgs: any[] = await sbRes.json();
    const total = orgs.length;
    const normTarget = normalize(orgName);
    const idx = orgs.findIndex(o => {
      const n = normalize(o.name);
      return n === normTarget || n.includes(normTarget) || normTarget.includes(n);
    });
    if (idx >= 0) return json({rank: idx + 1, total, source: 'supabase'});
    return json({rank: null, total, source: 'supabase'});
  } catch {
    return json({rank: null, total: null, error: 'failed'});
  }
}
