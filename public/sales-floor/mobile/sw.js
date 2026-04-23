/* Highsman Sales Floor — Service Worker
 *
 * Minimal offline-capable shell: caches the static JS/CSS bundles and the
 * manifest/icons so the app opens when the network is flaky. All API calls
 * (/api/sales-floor-*) are ALWAYS network-first and never cached — reps
 * need fresh data, not yesterday's queue.
 */

const VERSION = 'hs-floor-mobile-v13';
const PRECACHE = `${VERSION}-static`;
const RUNTIME = `${VERSION}-runtime`;

// Static assets safe to precache. The HTML shell itself is NOT in this list
// — we fetch it fresh every time so rep token injection stays current.
const PRECACHE_URLS = [
  '/sales-floor/mobile/styles.css?v=10',
  '/sales-floor/mobile/manifest.json',
  '/sales-floor/js/config/config.js',
  '/sales-floor/js/templates.js',
  '/sales-floor/js/zoho.js',
  '/sales-floor/js/gmail.js',
  '/sales-floor/js/ai-brief.js',
  '/sales-floor/js/alerts.js',
  '/sales-floor/js/issues.js',
  '/sales-floor/js/contact-search.js',
  '/sales-floor/js/sms.js',
  '/sales-floor/js/sms-templates.js',
  '/sales-floor/js/missed-calls.js',
  '/sales-floor/js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) =>
        // allSettled — one missing file should not block install
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => null),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('hs-floor-mobile-') && !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET for caching purposes
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin only
  if (url.origin !== self.location.origin) return;

  // 1) API requests → network only, never cache.
  if (
    url.pathname.startsWith('/api/sales-floor-') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // let the browser handle it normally
  }

  // 2) HTML shell (/sales-floor/mobile and anything under it that's navigation)
  // → network first, fall back to cache if offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/sales-floor/mobile'))),
    );
    return;
  }

  // 3) Static assets under /sales-floor/ → cache first, then network.
  if (url.pathname.startsWith('/sales-floor/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          // Only cache successful responses
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // 4) Everything else → default browser behavior.
});

// Allow the page to ask SW to drop its cache (we use this on logout).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FLUSH_CACHE') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
