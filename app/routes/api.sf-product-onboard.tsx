/**
 * app/routes/api.sf-product-onboard.tsx
 * POST /api/sf-product-onboard
 *
 * Staging replacement for api.sales-floor-vibes-product-onboard.tsx.
 * Fetches org data from Supabase (not Zoho), emails Serena, NO Zoho deal.
 *
 * Body: { orgId: string, customerName: string, productName?: string }
 * Returns: { ok, message, predictedDay, region, isOutlier }
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';
import {njRegion, regionLabel, predictedDayForRegion} from '~/lib/nj-regions';
import {sendEmailFromUser, isGmailSAConfigured} from '~/lib/gmail-sa';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  if (request.method !== 'POST') return json({ok:false,error:'method not allowed'},{status:405});

  const cookie = request.headers.get('Cookie') || '';
  if (!isStagingAuthed(cookie) && !getSFToken(cookie)) {
    return json({ok:false,error:'unauthorized'},{status:401});
  }

  let body: any = {};
  try { body = await request.json(); } catch {
    return json({ok:false,error:'invalid JSON'},{status:400});
  }

  const orgId       = String(body?.orgId       || '').trim();
  const customerName = String(body?.customerName || '').trim();
  const productName  = String(body?.productName  || '').trim();
  if (!orgId || !customerName) {
    return json({ok:false,error:'orgId and customerName required'},{status:400});
  }

  // Fetch org from Supabase
  const sbH = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const sbRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=city,market_state,zip`,
    {headers: sbH},
  );
  if (!sbRes.ok) return json({ok:false,error:'Supabase fetch failed'},{status:500});
  const orgs: any[] = await sbRes.json().catch(() => []);
  if (!orgs.length) return json({ok:false,error:'org not found'},{status:404});
  const {city, market_state, zip} = orgs[0];

  // NJ only
  if (market_state !== 'NJ' && market_state !== 'New Jersey') {
    return json(
      {ok:false, error:`Product onboarding visits are NJ-only for now.`},
      {status:422},
    );
  }

  // Region classification
  const geo = njRegion(city, zip);
  const {region, infrequentDropIn: isOutlier} = geo;
  if (isOutlier) {
    return json(
      {ok:false, error:`${customerName} is a drop-in location — book manually through Serena for Shore runs.`},
      {status:422},
    );
  }
  const label = regionLabel(region);
  const predictedDay = predictedDayForRegion(region, new Date()).label;

  // Email Serena — fire-and-forget
  if (isGmailSAConfigured(env as Record<string,string|undefined>)) {
    const subject = `Product walkthrough request: ${customerName}`;
    const lines = [
      `Sky logged a product walkthrough request from the Sales Floor.`,
      '',
      `Store:    ${customerName}`,
      `City:     ${city || '—'}`,
      `State:    ${market_state}`,
      productName ? `Product:  ${productName}` : 'Product:  (not specified)',
      `Region:   ${label}`,
      `Suggested day: ${predictedDay}`,
      '',
      'This is a product-specific walkthrough, NOT initial onboarding.',
      'Next step: confirm the visit day + time with the store.',
    ];
    sendEmailFromUser(
      'sky@highsman.com',
      {to:'serena@highsman.com', subject, textBody:lines.join('\n'), fromName:'Highsman Sales Floor', replyTo:'sky@highsman.com'},
      env as Record<string,string|undefined>,
    ).catch(err => console.error('[sf-product-onboard] email to Serena failed', err?.message));
  }

  return json({
    ok: true,
    message: `Product walkthrough request sent to Serena. She'll confirm the visit with ${customerName} (likely ${predictedDay} — ${label}).`,
    predictedDay,
    region: label,
    isOutlier: false,
  });
}

export async function loader() {
  return json({error:'POST only'},{status:405});
}
