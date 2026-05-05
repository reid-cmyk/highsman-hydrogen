import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from '@remix-run/react';
import type {LinksFunction, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import tailwindCss from '~/styles/tailwind.css?url';
import {Layout} from '~/components/Layout';

/**
 * Path prefixes that should NOT be indexed by search engines.
 * Keep in sync with public/robots.txt.
 *
 * robots.txt blocks crawling; this meta tag blocks indexing for any URL
 * that gets crawled anyway (direct links, leaked URLs, etc.).
 */
const NOINDEX_PREFIXES = [
  // Internal dashboards
  '/ceo',
  '/ops',
  '/sales',
  '/sales-floor',
  '/sales-staging',
  '/staff-dashboard',
  '/shift-report',
  '/grading-rubric',
  '/expense',
  '/directory',
  '/leads',
  '/new-business',
  // B2B / wholesale / rep tools
  '/njmenu',
  '/njpopups',
  '/njnorth',
  '/njsouth',
  // Vibes brand-rep app
  '/vibes',
  // Budtender training & gated education
  '/budtender-education',
  '/budtenders',
  '/budtender-quiz',
  '/training',
  '/pages/budtender-education',
  // API + utility paths
  '/api',
  '/account',
  '/cart',
  '/search',
];

function shouldNoIndex(pathname: string): boolean {
  return NOINDEX_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

/**
 * Path prefixes where the Klaviyo popup must be suppressed — every
 * B2B/wholesale, staff-internal, brand-rep, and budtender route.
 *
 * Reuses NOINDEX_PREFIXES (internal/staff/budtender/api are 1:1) and
 * adds the public-but-B2B partner pages (/retail, /newjersey, /njbuyers,
 * /njlaunch) where the popup is off-brand for the audience even though
 * the page itself is indexable.
 *
 * Strategy: when this matches, root.tsx skips the Klaviyo script tag
 * entirely AND injects a CSS + MutationObserver kill-switch to wipe any
 * Klaviyo elements that get injected by Shopify storefront defaults or
 * any future loader.
 *
 * Companion memory: feedback_klaviyo_popup_suppression.md.
 */
const NO_KLAVIYO_PREFIXES = [
  ...NOINDEX_PREFIXES,
  // B2B partner pages — indexable, but no consumer popup
  '/retail',
  '/newjersey',
  '/njbuyers',
  '/njlaunch',
];

function shouldSuppressKlaviyo(pathname: string): boolean {
  return NO_KLAVIYO_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export const links: LinksFunction = () => [
  {rel: 'stylesheet', href: tailwindCss},
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
  },
];

export async function loader({context, request}: LoaderFunctionArgs) {
  const {cart} = context;
  const url = new URL(request.url);
  const noIndex = shouldNoIndex(url.pathname);
  const noKlaviyo = shouldSuppressKlaviyo(url.pathname);
  // Fetch cart server-side and return a slim shape so the Header can
  // render the cart count badge with the correct totalQuantity on first
  // paint without shipping the full cart payload to every page.
  const cartData = await cart.get();
  return {
    cart: cartData ? {totalQuantity: cartData.totalQuantity ?? 0} : null,
    publicStoreDomain: context.env.PUBLIC_STORE_DOMAIN,
    noIndex,
    noKlaviyo,
  };
}

// Belt-and-suspenders kill-switch markup that runs even when the Klaviyo
// script is gated. Catches:
//   • Modern Klaviyo wrappers (`kl-private-reset-css-*` hashed classes)
//   • Legacy `klaviyo-form-overlay` and `needsclick` selectors
//   • Anything Shopify's storefront defaults inject under `[id^="kl-"]`
// MutationObserver picks up popups that mount AFTER initial render — Klaviyo
// loads async and historically injects ~200ms after first paint.
//
// Per-route useEffect copies (10+ files) became outdated as Klaviyo shipped
// new popup variants. This single root-level kill switch is now the single
// source of truth — see memory feedback_klaviyo_popup_suppression.md.
const KLAVIYO_KILL_CSS = `
  [data-testid="klaviyo-form-overlay"],
  .klaviyo-form-overlay,
  .klaviyo-form,
  [class*="klaviyo-form-version-"],
  [class*="kl-private-reset-css"],
  [class*="needsclick"][class*="kl-private"],
  [id^="kl-"],
  [id^="klaviyo-"],
  iframe[id^="kl_"],
  [class*="klaviyo"][class*="overlay"],
  [class*="klaviyo"][class*="modal"],
  [id*="klaviyo"][id*="popup"] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  body { overflow: auto !important; }
`;

const KLAVIYO_KILL_OBSERVER = `
(function(){
  if (window.__hsKlaviyoKilled) return;
  window.__hsKlaviyoKilled = true;
  var SEL = '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, .klaviyo-form, [class*="klaviyo-form-version-"], [class*="kl-private-reset-css"], [class*="needsclick"][class*="kl-private"], [id^="kl-"], [id^="klaviyo-"], iframe[id^="kl_"]';
  function nuke(){
    try { document.querySelectorAll(SEL).forEach(function(el){ el.remove(); }); } catch(e){}
  }
  // Stub the programmatic openForm API so any third-party trigger fails silently.
  try {
    Object.defineProperty(window, 'klaviyo', {
      configurable: true,
      get: function(){
        return { push: function(){}, identify: function(){}, openForm: function(){}, isIdentified: function(){return false;} };
      },
    });
  } catch(e){}
  nuke();
  if (typeof MutationObserver === 'function') {
    var mo = new MutationObserver(function(){ nuke(); });
    var start = function(){ if (document.body) mo.observe(document.body, {childList:true, subtree:true}); else setTimeout(start, 50); };
    start();
  } else {
    setInterval(nuke, 500);
  }
})();
`;

export default function App() {
  const data = useLoaderData<typeof loader>();
  const noIndex = data?.noIndex ?? false;
  const noKlaviyo = data?.noKlaviyo ?? false;
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {noIndex ? (
          <meta name="robots" content="noindex, nofollow, noarchive" />
        ) : null}
        {/* Klaviyo kill-switch CSS — server-rendered so it's already in the
            DOM before Klaviyo's async script can inject anything. Active on
            every B2B/wholesale/staff/budtender path via NO_KLAVIYO_PREFIXES. */}
        {noKlaviyo ? (
          <style
            id="hs-klaviyo-kill"
            dangerouslySetInnerHTML={{__html: KLAVIYO_KILL_CSS}}
          />
        ) : null}
        <Meta />
        <Links />
      </head>
      <body className="bg-surface text-on-surface font-body">
        <Layout>
          <Outlet />
        </Layout>
        <ScrollRestoration />
        <Scripts />
        {/* Klaviyo — only loaded on consumer routes. Internal/B2B routes
            both skip the script tag AND get the kill-switch CSS + observer
            above as belt-and-suspenders against any future loader path. */}
        {noKlaviyo ? (
          <script
            type="text/javascript"
            dangerouslySetInnerHTML={{__html: KLAVIYO_KILL_OBSERVER}}
          />
        ) : (
          <>
            <script
              async
              type="text/javascript"
              src="https://static.klaviyo.com/onsite/js/XiTH4j/klaviyo.js?company_id=XiTH4j"
            ></script>
            <script
              type="text/javascript"
              dangerouslySetInnerHTML={{
                __html: `!function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise((function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();`,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = 'Unknown error';
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorMessage = error.data?.message ?? error.statusText;
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-surface text-on-surface font-body min-h-screen flex items-center justify-center">
        <div className="text-center px-8">
          <h1 className="font-headline text-[10rem] leading-none font-bold uppercase">
            {errorStatus}
          </h1>
          <p className="font-headline text-3xl uppercase tracking-widest mt-4 text-on-surface-variant">
            {errorMessage}
          </p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
