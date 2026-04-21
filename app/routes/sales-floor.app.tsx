import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {redirect} from '@shopify/remix-oxygen';
// Raw HTML template imported at build time by Vite
// eslint-disable-next-line import/no-unresolved
import dashboardHtml from '../lib/sales-floor-dashboard.html?raw';

const AUTH_COOKIE = 'sales_floor_auth=1';

function isAuthenticated(request: Request): boolean {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.includes(AUTH_COOKIE);
}

// Resource route (loader-only, no default component export).
// Returning a raw text/html Response is safe here because Remix treats
// resource routes as document responses — they never go through the
// client-side data revalidation path.
export async function loader({request}: LoaderFunctionArgs) {
  if (!isAuthenticated(request)) {
    return redirect('/sales-floor');
  }

  return new Response(dashboardHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
