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

  // Use a map to deduplicate by ID
  const customerMap = new Map<number, {id: number; name: string; nickname: string; license_number: string}>();

  // Follow the `next` URL for proper cursor-based pagination
  let url: string | null = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&page_size=200`;
  let pageCount = 0;

  while (url && pageCount < 50) {
    const res = await fetch(url, {
      headers: {Authorization: `Token ${apiKey}`},
    });

    if (!res.ok) {
      const text = await res.text();
      return json({error: `API error: ${res.status}`, body: text, count: customerMap.size}, {status: 500});
    }

    const data = await res.json();
    if (!data.results || data.results.length === 0) break;

    for (const c of data.results) {
      if (!customerMap.has(c.id)) {
        customerMap.set(c.id, {
          id: c.id,
          name: c.name || '',
          nickname: c.nickname || '',
          license_number: c.license_number || '',
        });
      }
    }

    url = data.next || null;
    pageCount++;
  }

  const customers = Array.from(customerMap.values());
  customers.sort((a, b) => a.name.localeCompare(b.name));

  return json({
    count: customers.length,
    pages_fetched: pageCount,
    customers,
  });
}
