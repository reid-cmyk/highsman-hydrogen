import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// TEMPORARY: Fetch all LeafLink customers with license numbers for sync
// DELETE THIS FILE after use

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const LEAFLINK_COMPANY_ID = 24087; // Canfections NJ, INC

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;

  if (!apiKey) {
    return json({error: 'LEAFLINK_API_KEY not configured'}, {status: 500});
  }

  const customers: Array<{id: number; name: string; nickname: string; license_number: string; licenses: any}> = [];
  let page = 1;

  while (page <= 20) {
    const url = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&page_size=100&page=${page}`;
    const res = await fetch(url, {
      headers: {Authorization: `Token ${apiKey}`},
    });

    if (!res.ok) {
      const text = await res.text();
      return json({error: `API error: ${res.status}`, body: text, customers}, {status: 500});
    }

    const data = await res.json();
    if (!data.results || data.results.length === 0) break;

    for (const c of data.results) {
      customers.push({
        id: c.id,
        name: c.name || '',
        nickname: c.nickname || '',
        license_number: c.license_number || c.license || '',
        licenses: c.licenses || c.retailer_licenses || null,
      });
    }

    if (!data.next) break;
    page++;
  }

  return json({count: customers.length, customers});
}
