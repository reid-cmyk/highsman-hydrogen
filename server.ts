import {createStorefrontClient, storefrontRedirect} from '@shopify/hydrogen';
import {
  createRequestHandler,
  getStorefrontHeaders,
  type AppLoadContext,
} from '@shopify/remix-oxygen';
import {createCartHandler} from '@shopify/hydrogen';

export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    try {
      // Create Storefront client
      const {storefront} = createStorefrontClient({
        i18n: {language: 'EN', country: 'US'},
        publicStorefrontToken: env.PUBLIC_STOREFRONT_API_TOKEN,
        privateStorefrontToken: env.PRIVATE_STOREFRONT_API_TOKEN,
        storeDomain: env.PUBLIC_STORE_DOMAIN,
        storefrontId: env.PUBLIC_STOREFRONT_ID,
        storefrontHeaders: getStorefrontHeaders(request),
      });

      // Create cart handler with cookie-based cart ID
      const cart = createCartHandler({
        storefront,
        getCartId: () => {
          // Check cookie first
          const cookieHeader = request.headers.get('Cookie') || '';
          const match = cookieHeader.match(/cart=([^;]+)/);
          if (match) return match[1];
          // Fallback to URL param
          const url = new URL(request.url);
          return url.searchParams.get('cartId') ?? undefined;
        },
        setCartId: (cartId: string) => {
          const headers = new Headers();
          headers.append(
            'Set-Cookie',
            `cart=${cartId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
          );
          return headers;
        },
      });

      const handleRequest = createRequestHandler({
        // @ts-expect-error - virtual module
        build: await import('virtual:remix/server-build'),
        mode: process.env.NODE_ENV,
        getLoadContext: (): AppLoadContext => ({
          storefront,
          cart,
          env,
          waitUntil: executionContext.waitUntil.bind(executionContext),
        }),
      });

      const response = await handleRequest(request);

      if (response.status === 404) {
        return storefrontRedirect({request, response, storefront});
      }

      return response;
    } catch (error) {
      console.error(error);
      return new Response('An unexpected error occurred', {status: 500});
    }
  },
};
