// This file is intentionally empty — route moved to sales-staging.order.$id.tsx
// Redirect to the correct URL

import {redirect} from '@shopify/remix-oxygen';
import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';

export async function loader({params}: LoaderFunctionArgs) {
  return redirect(`/sales-staging/order/${params.id}`);
}
