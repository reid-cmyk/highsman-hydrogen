// Zoho CRM client — thin wrapper around the server-side /api/sales-floor-sync route.
//
// The previous version tried to call Zoho directly from the browser, which
// doesn't work (CORS + secrets exposure). All OAuth lives server-side now in
// app/routes/api.sales-floor-sync.tsx — this file just caches the last sync
// response so multiple renderers can share it without re-fetching.

const Zoho = (() => {
  const ENDPOINT = '/api/sales-floor-sync';

  let cache = {
    leads: [],
    deals: [],
    accounts: [],
    syncedAt: null,
    configured: false,
    connected: false,
  };

  async function syncAll() {
    const res = await fetch(ENDPOINT, {
      method: 'GET',
      headers: {Accept: 'application/json'},
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
    const data = await res.json();

    cache = {
      leads: Array.isArray(data.leads) ? data.leads : [],
      deals: Array.isArray(data.deals) ? data.deals : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      syncedAt: data.meta?.syncedAt || new Date().toISOString(),
      configured: !!data.meta?.configured,
      connected: !!data.ok,
      error: data.error || null,
    };
    return cache;
  }

  async function fetchLeads() {
    if (!cache.syncedAt) await syncAll();
    return cache.leads;
  }

  async function fetchDeals() {
    if (!cache.syncedAt) await syncAll();
    return cache.deals;
  }

  async function fetchAccounts() {
    if (!cache.syncedAt) await syncAll();
    return cache.accounts;
  }

  function isConnected() {
    return cache.connected;
  }

  function isConfigured() {
    return cache.configured;
  }

  function lastSync() {
    return cache.syncedAt;
  }

  function lastError() {
    return cache.error || null;
  }

  // No-op stubs for the legacy connect-modal flow. The server now handles
  // auth entirely; the UI can keep showing a "Sync" button that just calls
  // syncAll() via the dashboard's syncCRM().
  function authorize() {
    // Server handles OAuth via refresh token — nothing to do in the browser.
    return Promise.resolve();
  }
  function exchangeCode() { return Promise.resolve(); }
  function setManualToken() {}
  function getToken() { return null; }

  return {
    syncAll,
    fetchLeads,
    fetchDeals,
    fetchAccounts,
    isConnected,
    isConfigured,
    lastSync,
    lastError,
    // Legacy surface kept so old init code won't crash:
    authorize,
    exchangeCode,
    setManualToken,
    getToken,
  };
})();
