// Gmail integration via Google Identity Services + Gmail API

const Gmail = (() => {
  let accessToken = null;

  function getToken() {
    return accessToken || sessionStorage.getItem('gmail_token');
  }

  function setToken(token) {
    accessToken = token;
    sessionStorage.setItem('gmail_token', token);
  }

  function isConnected() {
    return !!getToken();
  }

  // Trigger Google OAuth popup using GIS (Google Identity Services)
  function authorize() {
    return new Promise((resolve, reject) => {
      if (!window.google) {
        reject(new Error('Google Identity Services not loaded. Add the GIS script to your page.'));
        return;
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.gmail.clientId,
        scope: CONFIG.gmail.scopes,
        callback: (response) => {
          if (response.error) { reject(response); return; }
          setToken(response.access_token);
          resolve(response.access_token);
        },
      });
      client.requestAccessToken();
    });
  }

  // Send an email via Gmail API
  async function send({ to, subject, body }) {
    const token = getToken();
    if (!token) throw new Error('Gmail not authenticated');

    // Build RFC 2822 message
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encoded = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Gmail send failed');
    }
    return res.json();
  }

  return { authorize, send, isConnected, getToken };
})();
