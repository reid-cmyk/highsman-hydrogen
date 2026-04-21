// Sales Dashboard Configuration
// Zoho credentials are NOT here — they live server-side as Oxygen env vars
// (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN) and are used by
// app/routes/api.sales-floor-sync.tsx. The browser only talks to that route.

const CONFIG = {
  // Left intentionally empty — server-side route holds all Zoho secrets.
  zoho: {
    // Kept as empty strings so legacy code referencing CONFIG.zoho.* won't
    // throw. The server-side route is the source of truth.
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scopes: '',
  },

  gmail: {
    // Get from: https://console.cloud.google.com/
    clientId: 'YOUR_GOOGLE_CLIENT_ID',
    scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose',
  },

  anthropic: {
    // Used server-side only — never expose this key in browser JS in production.
    model: 'claude-sonnet-4-6',
  },

  twilio: {
    // Coming soon
    accountSid: '',
    authToken: '',
    fromNumber: '',
  },

  salesperson: {
    name: 'Reid Meyers',
    email: 'reid@highsman.com',
    company: 'Highsman',
    phone: '',
    title: 'Sales Representative',
  },
};
