// Gmail client — thin wrapper around the server-side /api/sales-floor-send-email
// route. OAuth for sky@highsman.com lives in Oxygen env vars (GMAIL_CLIENT_ID /
// GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN) and the browser never sees them.
//
// The legacy client-side GIS flow has been retired — this module keeps the same
// surface (Gmail.send / Gmail.isConnected / Gmail.authorize) so callers in
// app.js continue to work.

const Gmail = (() => {
  const ENDPOINT = '/api/sales-floor-send-email';

  // The server is always the sender — treat Gmail as "connected" from the
  // browser's perspective so the UI never shows a connect modal for it.
  function isConnected() { return true; }

  // No-op (server handles OAuth). Kept so older call sites don't crash.
  function authorize() { return Promise.resolve(true); }
  function getToken() { return null; }

  async function send({to, subject, body, cc, replyTo}) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({to, subject, body, cc, replyTo}),
    });

    // Try to parse JSON even on non-2xx so we can surface a useful error.
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }

    if (!res.ok || !data || data.ok === false) {
      const msg = (data && data.error) || `Gmail send failed (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return data; // { ok:true, messageId, from }
  }

  return {send, isConnected, authorize, getToken};
})();
