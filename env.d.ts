/// <reference types="vite/client" />
/// <reference types="@shopify/remix-oxygen" />
/// <reference types="@shopify/hydrogen/storefront-api-types" />

import type {HydrogenCart, Storefront} from '@shopify/hydrogen';

declare global {
  /**
   * A global `process` object is only available during build to access NODE_ENV.
   */
  const process: {env: {NODE_ENV: 'production' | 'development'}};

  /**
   * Declare expected Env parameter in fetch handler.
   * Index signature allows dynamic env var access (e.g. env as Record<string,string>).
   */
  interface Env {
    [key: string]: any;
    SESSION_SECRET: string;
    PUBLIC_STOREFRONT_API_TOKEN: string;
    PRIVATE_STOREFRONT_API_TOKEN: string;
    PUBLIC_STORE_DOMAIN: string;
    PUBLIC_STOREFRONT_ID: string;
    KLAVIYO_PRIVATE_KEY: string;
    STAFF_DASHBOARD_PASSWORD: string;
    SALES_DASHBOARD_PASSWORD: string;
  }

  /**
   * Cloudflare Workers execution context — available in fetch handler.
   */
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }
}

declare module '@shopify/remix-oxygen' {
  export interface AppLoadContext {
    storefront: Storefront;
    cart: HydrogenCart;
    env: Env;
  }
}
