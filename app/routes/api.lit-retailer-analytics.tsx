/**
 * app/routes/api.lit-retailer-analytics.tsx
 *
 * GET /api/lit-retailer-analytics?lit_retailer_id=1234&state=NJ
 *
 * Returns market intelligence for a specific dispensary:
 *   - brands: top brands sold there by revenue + Highsman's rank/share
 *   - categories: category revenue breakdown
 *   - total: dispensary's total cannabis revenue in period
 *
 * Date range: rolling 90 days (most current market picture)
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';

const LIT_API = 'https://partnerapi.litalerts.com';
const HIGHSMAN_BRAND_ID = 9027;

function fmtDate(d: Date): string {
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}-${d.getFullYear()}`;
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const _sfCk = request.headers.get('Cookie')||''; if (!isStagingAuthed(_sfCk) && !getSFToken(_sfCk)) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  const env = (context as any).env;
  const token = env.LIT_ALERTS_TOKEN;
  if (!token) return json({ok: false, error: 'not_configured'});

  const url   = new URL(request.url);
  const litId = url.searchParams.get('lit_retailer_id') || '';
  const state = url.searchParams.get('state') || 'NJ';

  if (!litId) return json({ok: false, error: 'lit_retailer_id required'});

  const endDate   = new Date();
  const beginDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  const begin = fmtDate(beginDate);
  const end   = fmtDate(endDate);
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/json'};

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s max
    const sig = controller.signal;

    // Fetch brands + categories at this retailer in parallel
    const [brandsRes, catsRes] = await Promise.all([
      fetch(`${LIT_API}/v1/retailer/${litId}/brands?beginDate=${begin}&endDate=${end}&returnDollarValues=true`, {headers, signal: sig}),
      fetch(`${LIT_API}/v1/retailer/${litId}/categories?beginDate=${begin}&endDate=${end}&returnDollarValues=true`, {headers, signal: sig}),
    ]);
    clearTimeout(timeout);

    const [brandsData, catsData] = await Promise.all([
      brandsRes.ok ? brandsRes.json() : null,
      catsRes.ok  ? catsRes.json()   : null,
    ]);

    const brands: any[]     = brandsData?.results || [];
    const categories: any[] = catsData?.results   || [];
    const totalRevenue: number = brandsData?.total || 0;

    // Find Highsman in the brand list
    const hsIdx  = brands.findIndex(b => b.id === HIGHSMAN_BRAND_ID || (b.name||'').toLowerCase().includes('highsman'));
    const hsData = hsIdx >= 0 ? brands[hsIdx] : null;

    // Compute share percentages
    const brandsWithShare = brands.map((b: any, i: number) => ({
      name:          b.name,
      id:            b.id,
      revenue:       b.estimatedAmount,
      rank:          i + 1,
      sharePercent:  totalRevenue > 0 ? Math.round((b.estimatedAmount / totalRevenue) * 1000) / 10 : 0,
      isHighsman:    b.id === HIGHSMAN_BRAND_ID || (b.name||'').toLowerCase().includes('highsman'),
    }));

    const catsWithShare = categories.map((c: any) => ({
      name:         c.name,
      revenue:      c.estimatedAmount,
      sharePercent: totalRevenue > 0 ? Math.round((c.estimatedAmount / totalRevenue) * 1000) / 10 : 0,
    }));

    return json({
      ok: true,
      litRetailerId: litId,
      period: {beginDate: begin, endDate: end, days: 90},
      totalRevenue,
      brands:     brandsWithShare.slice(0, 15), // top 15 brands
      categories: catsWithShare,
      highsman: hsData ? {
        rank:         hsIdx + 1,
        totalBrands:  brands.length,
        revenue:      hsData.estimatedAmount,
        sharePercent: totalRevenue > 0 ? Math.round((hsData.estimatedAmount / totalRevenue) * 1000) / 10 : 0,
      } : null,
    });
  } catch (err: any) {
    console.warn('[api/lit-retailer-analytics] Error:', err.message);
    return json({ok: false, error: err.message});
  }
}
