/**
 * app/routes/sales-staging._index.tsx
 * /sales-staging — always redirects to /sales-staging/dashboard
 * Accounts list moved to /sales-staging/accounts
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {redirect} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFUser} from '~/lib/sf-auth.server';

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) {
    return redirect('/sales-staging/login');
  }
  return redirect('/sales-staging/dashboard');
}

export default function SalesStagingIndex() {
  return null;
}
