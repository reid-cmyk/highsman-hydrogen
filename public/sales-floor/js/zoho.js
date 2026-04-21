// Zoho CRM integration
// Uses OAuth 2.0 — user must authenticate first via connect modal

const Zoho = (() => {
  let accessToken = null;
  const BASE = 'https://www.zohoapis.com/crm/v3';

  function setToken(token) {
    accessToken = token;
    sessionStorage.setItem('zoho_token', token);
  }

  function getToken() {
    return accessToken || sessionStorage.getItem('zoho_token');
  }

  function headers() {
    return {
      Authorization: `Zoho-oauthtoken ${getToken()}`,
      'Content-Type': 'application/json',
    };
  }

  async function get(endpoint, params = {}) {
    const url = new URL(`${BASE}/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) throw new Error(`Zoho API error: ${res.status}`);
    return res.json();
  }

  async function fetchLeads() {
    const data = await get('Leads', {
      fields: 'First_Name,Last_Name,Email,Phone,Company,Lead_Status,Lead_Source,Annual_Revenue,Description,Created_Time,Modified_Time',
      per_page: 100,
      sort_by: 'Modified_Time',
      sort_order: 'desc',
    });
    return (data.data || []).map(normalizeLeadStatus);
  }

  async function fetchDeals() {
    const data = await get('Deals', {
      fields: 'Deal_Name,Account_Name,Stage,Amount,Closing_Date,Contact_Name,Description,Created_Time',
      per_page: 200,
    });
    return data.data || [];
  }

  async function fetchAccounts() {
    const data = await get('Accounts', {
      fields: 'Account_Name,Phone,Website,Industry,Annual_Revenue,Billing_City,Billing_State,Account_Type,Description,Modified_Time',
      per_page: 200,
      sort_by: 'Modified_Time',
      sort_order: 'desc',
    });
    return data.data || [];
  }

  // Map Zoho lead statuses to hot/warm/new/cold
  function normalizeLeadStatus(lead) {
    const zohoStatus = (lead.Lead_Status || '').toLowerCase();
    let status = 'new';
    if (['attempted to contact', 'contacted', 'pre-qualified', 'not contacted'].includes(zohoStatus)) {
      status = 'new';
    }
    if (['working - contacted', 'contact in future'].includes(zohoStatus)) {
      status = 'warm';
    }
    if (['qualified'].includes(zohoStatus)) {
      status = 'hot';
    }
    if (['unqualified', 'junk lead'].includes(zohoStatus)) {
      status = 'cold';
    }
    return { ...lead, _status: status, _fullName: `${lead.First_Name || ''} ${lead.Last_Name || ''}`.trim() };
  }

  function isConnected() {
    return !!getToken();
  }

  // Initiate OAuth flow (opens popup)
  function authorize() {
    const params = new URLSearchParams({
      scope: CONFIG.zoho.scopes,
      client_id: CONFIG.zoho.clientId,
      response_type: 'code',
      access_type: 'offline',
      redirect_uri: CONFIG.zoho.redirectUri,
    });
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?${params}`;
    window.open(authUrl, 'zoho_auth', 'width=600,height=700');
  }

  // Call this after receiving the auth code from redirect
  async function exchangeCode(code) {
    // In production, this exchange happens server-side to protect clientSecret
    const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CONFIG.zoho.clientId,
        client_secret: CONFIG.zoho.clientSecret,
        redirect_uri: CONFIG.zoho.redirectUri,
        code,
      }),
    });
    const data = await res.json();
    if (data.access_token) setToken(data.access_token);
    return data;
  }

  // For demo / dev: manually paste an access token
  function setManualToken(token) {
    setToken(token);
  }

  return { fetchLeads, fetchDeals, fetchAccounts, isConnected, authorize, exchangeCode, setManualToken, getToken };
})();
