import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';

/**
 * app/routes/[robots.txt].tsx
 *
 * The brackets escape the literal "." in the filename — this serves
 * https://highsman.com/robots.txt
 *
 * Disallow rules cover the unlisted /ceo dashboard, its scanner endpoint,
 * and the /directory staff site map so they don't surface in search results
 * even if a link ever leaks.
 */
export async function loader(_args: LoaderFunctionArgs) {
  const body = [
    'User-agent: *',
    'Disallow: /ceo',
    'Disallow: /api/ceo-scan',
    'Disallow: /directory',
    '',
    'Sitemap: https://highsman.com/sitemap.xml',
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
