import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from '@remix-run/react';
import type {LinksFunction, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import tailwindCss from '~/styles/tailwind.css?url';
import {Layout} from '~/components/Layout';

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

export async function loader({context}: LoaderFunctionArgs) {
  const {storefront, cart} = context;
  return {
    cart: cart.get(),
    publicStoreDomain: context.env.PUBLIC_STORE_DOMAIN,
  };
}

export default function App() {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-surface text-on-surface font-body">
        <Layout>
          <Outlet />
        </Layout>
        <ScrollRestoration />
        <Scripts />
        {/* Klaviyo */}
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
