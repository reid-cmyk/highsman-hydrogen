// Sales Dashboard Configuration
// Replace placeholder values with your actual credentials

const CONFIG = {
  zoho: {
    // Get from: https://api-console.zoho.com/
    clientId: 'YOUR_ZOHO_CLIENT_ID',
    clientSecret: 'YOUR_ZOHO_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/auth/zoho/callback',
    // Scopes needed: ZohoCRM.modules.leads.READ, ZohoCRM.modules.accounts.READ,
    //                ZohoCRM.modules.deals.READ, ZohoCRM.modules.contacts.READ
    scopes: 'ZohoCRM.modules.leads.ALL,ZohoCRM.modules.accounts.ALL,ZohoCRM.modules.deals.ALL,ZohoCRM.modules.contacts.ALL',
  },

  gmail: {
    // Get from: https://console.cloud.google.com/
    clientId: 'YOUR_GOOGLE_CLIENT_ID',
    // Scopes: gmail.send, gmail.compose
    scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose',
  },

  anthropic: {
    // Used server-side only — never expose this key in browser JS in production
    // For this demo, calls will be proxied or handled via backend
    model: 'claude-sonnet-4-6',
  },

  twilio: {
    // Coming soon
    accountSid: '',
    authToken: '',
    fromNumber: '',
  },

  salesperson: {
    name: 'Your Name',
    email: '',
    company: 'Your Company',
    phone: '',
    title: 'Sales Representative',
  },
};
