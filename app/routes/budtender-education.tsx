import {redirect} from '@shopify/remix-oxygen';
import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';

export async function loader({request}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/pages/budtender-education${url.search}`, 301);
}

export default function BudtenderEducationRedirect() {
  return null;
}
