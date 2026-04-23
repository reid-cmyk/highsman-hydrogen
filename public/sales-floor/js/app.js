// Main application logic

// ─── State ────────────────────────────────────────────────────────────────────
let leads = [];
let accounts = [];
let deals = [];
let currentFilter = 'all';
// State-scope filters for the Leads + Accounts tabs. 'all' shows everything;
// any 2-letter code (NJ / NY / RI / MO …) narrows the list to that market.
// We render the tab strip dynamically from whatever states are present in the
// loaded data, so a rep working a single state never sees noise from others.
let currentLeadState = 'all';
let currentAccountState = 'all';
// New Customers state filter. Same tab strip pattern as Leads/Accounts — 'all'
// by default, NJ/NY/RI/MO narrows the list. MA is intentionally excluded per
// Reid (no MA new-customer tracking). NJ cards come from LeafLink with the
// full Vibes-onboard state machine; NY/RI/MO cards come from Zoho first-order
// accounts (Total_Orders_Count === 1) with a simpler call-the-buyer CTA.
let currentNewCustState = 'all';
let currentBriefLead = null;
let callsToday = 0;          // legacy: local tel:-click counter (pre-Quo)
let quoTodayCalls = null;    // real count from Quo; null = not yet fetched
let quoConfigured = false;   // whether the Quo integration is live on this deploy
let recentCalls = [];        // last 15 Quo calls (shaped by /api/sales-floor-quo-recent)
let recentCallsRefreshTimer = null;

// LeafLink-driven Orders Due + New Customers state. Both lists come from
// /api/sales-floor-leaflink-orders in a single round-trip and are kept in
// memory so the dashboard snapshot, Orders Due tab, and New Customers tab
// stay in sync without separate fetches per tab.
let reorderDue = [];      // shops 30d+ since last Highsman LeafLink order
let newCustomers = [];    // first-time Highsman LeafLink orders + state machine
let leaflinkOrdersMeta = null;
let leaflinkOrdersFetched = 0;     // ms timestamp of last successful fetch
let leaflinkOrdersLoading = false; // suppress overlapping fetches

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // The server injects window.__HS_REP__ on every /sales-floor/app response
  // (see app/routes/sales-floor.app.tsx). Hydrate CONFIG.salesperson from it
  // so every downstream helper (greeting, template filler, issue-reporter
  // default) uses the actual logged-in rep — not the hard-coded config.js
  // default. We keep the CONFIG.salesperson shape stable so existing code
  // that reads `.name` / `.email` keeps working.
  hydrateRepFromServer();

  updateGreeting();
  updateConnectionStatus();
  Issues.init();
  updateIssueBadge();

  // Auto-sync from Zoho on page load. If the CRM isn't configured or returns
  // empty, fall back to demo data so the dashboard is never blank.
  bootstrapCRM();
});

function hydrateRepFromServer() {
  try {
    const rep = window.__HS_REP__;
    if (!rep || typeof rep !== 'object') return;
    if (!CONFIG.salesperson) CONFIG.salesperson = {};
    CONFIG.salesperson.name = rep.displayName || CONFIG.salesperson.name;
    CONFIG.salesperson.firstName = rep.firstName || CONFIG.salesperson.firstName;
    CONFIG.salesperson.email = rep.email || CONFIG.salesperson.email;
    CONFIG.salesperson.signature = rep.signature || CONFIG.salesperson.signature;
    CONFIG.salesperson.id = rep.id;

    // Belt-and-suspenders: token replacement in the HTML template already
    // sets these, but re-populate in JS in case a cached page loads with
    // placeholder text. Also covers any future JS-rendered refs to rep email.
    const composeFromEl = document.getElementById('compose-from-addr');
    if (composeFromEl && rep.email) composeFromEl.textContent = rep.email;
    const sidebarName = document.getElementById('sidebar-rep-name');
    if (sidebarName && rep.displayName) sidebarName.textContent = rep.displayName;
    const sidebarEmail = document.getElementById('sidebar-rep-email');
    if (sidebarEmail && rep.email) sidebarEmail.textContent = rep.email;
  } catch (err) {
    console.warn('[sales-floor] hydrateRepFromServer failed (keeping defaults):', err);
  }
}

async function bootstrapCRM() {
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.textContent = 'Connecting to Zoho…';
  updateConnectionStatus('syncing');
  try {
    const snapshot = await Zoho.syncAll();
    const hasAny = snapshot.leads.length + snapshot.deals.length + snapshot.accounts.length > 0;

    if (snapshot.connected && hasAny) {
      leads = snapshot.leads;
      deals = snapshot.deals;
      accounts = snapshot.accounts;
      loadDemoAlerts(); // keep the alert panel populated until real alert logic lands
      renderAll();
      updateConnectionStatus('connected');
      if (statusEl) statusEl.textContent = `Synced ${new Date().toLocaleTimeString()}`;
      return;
    }

    // Configured but returned nothing, OR not configured at all → demo mode.
    console.warn('[sales-floor] CRM returned no data — falling back to demo.', snapshot);
    loadDemoData();
    updateConnectionStatus('demo');
    if (statusEl) {
      statusEl.textContent = snapshot.configured
        ? 'CRM empty — showing demo'
        : 'Demo mode';
    }
  } catch (err) {
    console.error('[sales-floor] CRM bootstrap failed:', err);
    loadDemoData();
    updateConnectionStatus('offline');
    if (statusEl) statusEl.textContent = 'Offline — showing demo';
  }
}

function updateGreeting() {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = CONFIG.salesperson.name ? ` ${CONFIG.salesperson.name.split(' ')[0]}` : '';
  document.getElementById('user-greeting').textContent = `${greeting}${name}`;
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');

  document.querySelectorAll('.hs-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`nav-${tab}`)?.classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Your day at a glance'],
    leads: ['Leads', 'New business development'],
    orders: ['Orders Due', 'Reorders, low inventory, off-menu shops'],
    newcustomers: ['New Customers', 'First-time Highsman shops'],
    accounts: ['Accounts', 'Account management'],
    compose: ['Email Templates', 'One-click personalized emails'],
    sms: ['Text', 'Two-way SMS via Quo'],
    issues: ['Issue Reporting', 'Customer issue tracking'],
  };
  const [title] = titles[tab] || [''];
  document.getElementById('page-title').textContent = title;

  if (tab === 'issues') initIssuesTab();
  // SMS lazy-init — only spin up polling once the user opens the panel
  if (tab === 'sms' && typeof SMS !== 'undefined' && typeof SMS.init === 'function') {
    SMS.init();
  } else if (tab !== 'sms' && typeof SMS !== 'undefined' && typeof SMS.pause === 'function') {
    SMS.pause();
  }

  // Refresh LeafLink-driven tabs on view. We don't refetch every render —
  // a 60s cache on the data lets reps tab around without hammering the API,
  // but tab focus is a strong "I want fresh data" signal.
  if (tab === 'orders' || tab === 'newcustomers') {
    loadLeaflinkOrders({force: false}).catch(() => {});
  }
}

// ─── CRM Sync ─────────────────────────────────────────────────────────────────
// The "Sync" button in the sidebar pulls fresh data from /api/sales-floor-sync.
// OAuth lives server-side — no connect modal needed for Zoho.
async function syncCRM() {
  const icon = document.getElementById('sync-icon');
  const statusEl = document.getElementById('sync-status');
  icon?.classList.add('animate-spin');
  if (statusEl) statusEl.textContent = 'Syncing…';
  updateConnectionStatus('syncing');
  try {
    const snapshot = await Zoho.syncAll();
    const hasAny = snapshot.leads.length + snapshot.deals.length + snapshot.accounts.length > 0;

    if (snapshot.connected && hasAny) {
      leads = snapshot.leads;
      deals = snapshot.deals;
      accounts = snapshot.accounts;
      renderAll();
      if (statusEl) statusEl.textContent = `Synced ${new Date().toLocaleTimeString()}`;
      toast('CRM data synced', 'success');
      updateConnectionStatus('connected');
    } else if (!snapshot.configured) {
      if (statusEl) statusEl.textContent = 'CRM not configured';
      toast('Zoho not configured on this deploy', 'error');
      updateConnectionStatus('demo');
    } else {
      if (statusEl) statusEl.textContent = 'No records returned';
      toast('Zoho returned no records', 'info');
      updateConnectionStatus('demo');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Sync failed';
    toast(`Sync error: ${err.message}`, 'error');
    updateConnectionStatus('offline');
  } finally {
    icon?.classList.remove('animate-spin');
  }
}

function renderAll() {
  // State tabs depend on the loaded data — populate them before the lists
  // render so the count chips on each tab line up with what's actually shown.
  renderLeadStateTabs();
  renderAccountStateTabs();
  renderNewCustStateTabs();
  renderLeads();
  renderAccounts();
  // Paint Zoho-only new-customer cards (NY/RI/MO) right away — they come from
  // accounts[] so they don't need the LeafLink fetch to complete. NJ cards
  // get added when loadLeaflinkOrders() lands.
  renderNewCustomers();
  renderDashboard();
  updateStats();
  populateIssueAccountDropdown();
  // Orders Due + NJ New Customers are LeafLink-driven, so they have their
  // own loader. Kick it off after the Zoho render lands so the dashboard's
  // other panels paint first.
  loadLeaflinkOrders({force: false}).catch(() => {});
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  const hot = leads.filter(l => l._status === 'hot').length;
  document.getElementById('stat-hot').textContent = hot;

  // Reorder Due: count of shops with no Highsman LeafLink order in 30+ days.
  // Source: /api/sales-floor-leaflink-orders. Falls back to "—" until the
  // first fetch completes so reps don't see a misleading "0" on slow loads.
  const reorderEl = document.getElementById('stat-reorder-due');
  if (reorderEl) {
    reorderEl.textContent = leaflinkOrdersFetched
      ? String(reorderDue.length)
      : '—';
  }

  // Calls Today: prefer the real Quo number when the integration is live;
  // fall back to the local tel:-click counter otherwise so demo deploys
  // still feel responsive.
  const callsDisplay = quoTodayCalls != null ? quoTodayCalls : callsToday;
  document.getElementById('stat-calls').textContent = callsDisplay;
  document.getElementById('stat-issues').textContent = Alerts.counts().total || '0';

  if (hot > 0) {
    const badge = document.getElementById('hot-badge');
    badge.textContent = hot;
    badge.classList.remove('hidden');
  }

  // Orders Due nav badge (sidebar + bottom nav) — surface the reorder-due
  // count on the nav itself so reps see the number without opening the tab.
  syncCountBadge('orders-nav-badge', reorderDue.length);
  syncCountBadge('bn-orders-badge', reorderDue.length);

  // New Customers nav badge — count of cards that still need rep action.
  // Includes LeafLink pending/ready/checkin_due AND Zoho-sourced zoho_new
  // (NY/RI/MO first-order welcome calls). vibes_booked is excluded because
  // that one's already in flight with Sky.
  const newcustActive = combinedNewCustomers().filter(c =>
    c.cardState === 'pending' ||
    c.cardState === 'ready' ||
    c.cardState === 'checkin_due' ||
    c.cardState === 'zoho_new'
  ).length;
  syncCountBadge('newcust-nav-badge', newcustActive);
  syncCountBadge('sheet-newcust-badge', newcustActive);
}

// Toggle a count badge element by ID — show with the integer when > 0,
// hide when 0 or missing. Single helper because we mirror the same value
// across sidebar nav, bottom nav, and the "More" sheet.
function syncCountBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = String(count);
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const hotLeadsEl = document.getElementById('dashboard-hot-leads');
  const hotLeads = leads.filter(l => l._status === 'hot').slice(0, 6);
  if (hotLeads.length === 0) {
    hotLeadsEl.innerHTML = `
      <div class="hs-empty-state py-10">
        <div class="hs-empty-state-icon"><i class="fa-solid fa-fire"></i></div>
        No hot leads right now — you're on top of things.
        <div style="margin-top:8px;font-size:0.82rem;opacity:0.8;">Head to <strong style="color:#fff;">Leads</strong> to warm up new prospects.</div>
      </div>`;
  } else {
    hotLeadsEl.innerHTML = hotLeads.map((l, i) => {
      const idx = leads.indexOf(l);
      const isTop = i === 0;
      const reason = l.Lead_Source ? `Source: ${l.Lead_Source}` : 'Ready to close';
      const phone = l.Phone || '';
      const callHref = phone ? `tel:${phone}` : '#';
      const rowClass = isTop ? 'dash-lead-row top-of-queue' : 'dash-lead-row';
      const callBtn = isTop
        ? `<a href="${callHref}" onclick="event.stopPropagation(); callLead(leads[${idx}]);" class="hs-btn-primary" style="min-width:110px;">
             <i class="fa-solid fa-phone"></i> Call Now
           </a>`
        : `<a href="${callHref}" onclick="event.stopPropagation(); callLead(leads[${idx}]);" class="lead-action-btn" title="Call">
             <i class="fa-solid fa-phone"></i>
           </a>`;
      const briefBtn = isTop
        ? `<button onclick="event.stopPropagation(); openBrief(${idx})" class="hs-btn-secondary" style="min-width:100px;">
             <i class="fa-solid fa-brain"></i> Brief
           </button>`
        : `<button onclick="event.stopPropagation(); openBrief(${idx})" class="lead-action-btn" title="AI Brief">
             <i class="fa-solid fa-brain"></i> Brief
           </button>`;
      return `
        <div class="${rowClass}" onclick="openBrief(${idx})">
          <div style="flex:1; min-width:0;">
            <div class="dash-lead-name">
              ${l._fullName || '—'}
              ${isTop ? '<span class="hs-reason-chip" style="margin-left:10px; color:#fff; border-color:rgba(255,255,255,0.4);">Top of Queue</span>' : ''}
            </div>
            <div class="dash-lead-company">${l.Company || '—'}${phone ? ` &middot; <a href="tel:${phone}" onclick="event.stopPropagation();" class="hs-tel-link">${phone}</a>` : ''}</div>
            ${isTop ? `<div class="dash-lead-company" style="margin-top:6px; opacity:0.7;">${reason}</div>` : ''}
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">
            ${callBtn}
            ${briefBtn}
          </div>
        </div>`;
    }).join('');
  }

  // Render alert panel
  Alerts.renderPanel();

  // ─── Orders Due snapshot — surfaced on the dashboard "At a Glance" row.
  // Renders the top 4 most-overdue reorder shops + a small "X new customers"
  // pill that deep-links to the New Customers tab. Empty/loading states fall
  // back to friendly copy so the panel never looks broken.
  const ordersEl = document.getElementById('dashboard-orders');
  if (ordersEl) {
    if (!leaflinkOrdersFetched) {
      ordersEl.innerHTML = `<div class="hs-empty-state">Loading orders…</div>`;
    } else if (reorderDue.length === 0 && combinedNewCustomers().length === 0) {
      ordersEl.innerHTML = `
        <div class="hs-empty-state">
          <div class="hs-empty-state-icon"><i class="fa-solid fa-clipboard-check"></i></div>
          Inbox zero on reorders. Spark Greatness.
        </div>`;
    } else {
      const newcustActive = combinedNewCustomers().filter(c =>
        c.cardState === 'pending' ||
        c.cardState === 'ready' ||
        c.cardState === 'checkin_due' ||
        c.cardState === 'zoho_new'
      ).length;
      const newcustPill = newcustActive > 0
        ? `<button onclick="showTab('newcustomers')" class="hs-orders-snap-pill">
             <i class="fa-solid fa-user-plus"></i>
             ${newcustActive} new ${newcustActive === 1 ? 'shop' : 'shops'} → onboard
           </button>`
        : '';
      const top = reorderDue.slice(0, 4);
      const overflow = reorderDue.length - top.length;
      const rows = top.map(r => {
        const days = Number.isFinite(r.daysSinceLastOrder) ? r.daysSinceLastOrder : 0;
        const sev = days >= 60 ? 'is-critical' : days >= 45 ? 'is-warn' : '';
        return `
          <div class="hs-orders-snap-row">
            <div class="hs-orders-snap-name">
              ${escapeHtml(r.customerName || '—')}
              ${r.state ? `<span class="hs-orders-snap-state">${escapeHtml(r.state)}</span>` : ''}
            </div>
            <div class="hs-orders-snap-days ${sev}">${days}d</div>
          </div>`;
      }).join('');
      const overflowRow = overflow > 0
        ? `<button onclick="showTab('orders')" class="hs-orders-snap-more">
             + ${overflow} more →
           </button>`
        : '';
      ordersEl.innerHTML = `
        ${newcustPill}
        ${rows || '<div class="hs-empty-state" style="padding:12px 0;">No reorders past 30 days.</div>'}
        ${overflowRow}
      `;
    }
  }
}

// ─── Lead List ────────────────────────────────────────────────────────────────
function renderLeads(filter = currentFilter) {
  currentFilter = filter;
  let list = currentFilter === 'all' ? leads : leads.filter(l => l._status === currentFilter);
  // State narrowing — applies on top of the status filter so reps can drill
  // down to e.g. "Hot leads in NJ" without losing either filter. Keys off the
  // server-resolved `_state` (Market_State picklist first, then address State)
  // so the filter matches what the tabs counted.
  if (currentLeadState && currentLeadState !== 'all') {
    list = list.filter(l => (l._state || normalizeStateCode(l.State)) === currentLeadState);
  }
  const q = document.getElementById('lead-search')?.value?.toLowerCase();
  if (q) list = list.filter(l =>
    (l._fullName || '').toLowerCase().includes(q) ||
    (l.Company || '').toLowerCase().includes(q) ||
    (l.Email || '').toLowerCase().includes(q)
  );
  const el = document.getElementById('lead-list');
  if (list.length === 0) {
    el.innerHTML = `<div class="hs-empty-state py-10">No leads match this filter.</div>`;
    return;
  }
  el.innerHTML = list.map((l) => {
    const idx = leads.indexOf(l);
    return contactCardHtml({
      idx,
      kind: 'lead',
      name: l._fullName,
      subtitle: l.Company,
      status: l._status,
      phone: l.Phone,
      mobile: l.Mobile,
      email: l.Email,
      onOpen: `openBrief(${idx})`,
      emailHandler: `quickEmail(${idx})`,
      textHandler: `quickText(${idx}, 'lead')`,
      briefHandler: `openBrief(${idx})`,
      // Inline add-field pills write back to the Leads module.
      zohoModule: 'Leads',
      zohoId: l.id,
    });
  }).join('');
}

function filterLeads(status) {
  currentFilter = status;
  document.querySelectorAll('#tab-leads .hs-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`filter-${status}`)?.classList.add('active');
  renderLeads(status);
}

function searchLeads() { renderLeads(); }

// ─── Orders Due (LeafLink-driven) ─────────────────────────────────────────────
// Replaces the old Pipeline board. Three columns:
//   1. Reorder Due  — Highsman shops with no LeafLink order in 30+ days (live)
//   2. Low Inventory Alert  — placeholder (Phase 2)
//   3. Off Menu Alert  — placeholder (Phase 2, most critical)
// Data shape comes from /api/sales-floor-leaflink-orders.

async function loadLeaflinkOrders({force = false} = {}) {
  if (leaflinkOrdersLoading) return;
  // 60-second cache unless force=true
  if (!force && leaflinkOrdersFetched && Date.now() - leaflinkOrdersFetched < 60_000) {
    return;
  }
  leaflinkOrdersLoading = true;
  try {
    const res = await fetch('/api/sales-floor-leaflink-orders', {
      credentials: 'include',
      headers: {Accept: 'application/json'},
    });
    if (!res.ok) throw new Error(`leaflink orders ${res.status}`);
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'leaflink orders failed');
    reorderDue = Array.isArray(data.reorderDue) ? data.reorderDue : [];
    newCustomers = Array.isArray(data.newCustomers) ? data.newCustomers : [];
    leaflinkOrdersMeta = data.meta || null;
    leaflinkOrdersFetched = Date.now();
  } catch (err) {
    console.warn('[loadLeaflinkOrders] failed', err);
    // Surface error in panel pill rather than blowing up the dashboard
    leaflinkOrdersFetched = Date.now();
    const pill = document.getElementById('reorder-due-meta');
    if (pill) {
      pill.textContent = 'Sync error — retry';
      pill.classList.remove('is-live');
      pill.classList.add('is-error');
    }
  } finally {
    leaflinkOrdersLoading = false;
    renderOrders();
    renderNewCustStateTabs();
    renderNewCustomers();
    renderDashboard();
    updateStats();
  }
}

function renderOrders() {
  const list = document.getElementById('reorder-due-list');
  const meta = document.getElementById('reorder-due-meta');
  if (!list) return;

  // Header pill — updates with live count + stale-state
  if (meta) {
    if (!leaflinkOrdersFetched) {
      meta.textContent = 'Loading…';
      meta.classList.remove('is-live', 'is-error');
    } else if (!meta.classList.contains('is-error')) {
      meta.textContent = `${reorderDue.length} due`;
      meta.classList.add('is-live');
    }
  }

  if (!leaflinkOrdersFetched) {
    list.innerHTML = `<div class="hs-empty-state hs-empty-state--col">
      <div class="hs-empty-state-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
      Loading reorder data…
    </div>`;
    return;
  }
  if (reorderDue.length === 0) {
    list.innerHTML = `<div class="hs-empty-state hs-empty-state--col">
      <div class="hs-empty-state-icon"><i class="fa-solid fa-check"></i></div>
      No shops past 30 days. Spark Greatness.
    </div>`;
    return;
  }

  // Sort: most overdue first
  const sorted = [...reorderDue].sort(
    (a, b) => (b.daysSinceLastOrder || 0) - (a.daysSinceLastOrder || 0),
  );

  list.innerHTML = sorted.map(r => {
    const days = Number.isFinite(r.daysSinceLastOrder) ? r.daysSinceLastOrder : 0;
    const sev = days >= 60 ? 'is-critical' : days >= 45 ? 'is-warn' : '';
    const lastOrder = r.lastOrderDate
      ? `Last: ${formatDate(r.lastOrderDate)}${r.lastOrderNumber ? ` · #${escapeHtml(String(r.lastOrderNumber))}` : ''}`
      : 'No prior orders on file';
    const statePill = r.state
      ? `<span class="hs-orders-state">${escapeHtml(r.state)}</span>`
      : '';
    // Cross-reference the live accounts list to surface the buyer contact —
    // /api/sales-floor-leaflink-orders returns the account-level phone, but
    // the buyer's mobile is on the contact attached to the matched account.
    const acct = r.zohoAccountId
      ? accounts.find(a => a.id === r.zohoAccountId)
      : null;
    // Property name: `buyer` (no underscore). The sync endpoint writes
  // acc.buyer = pickBuyer(list), so the matched-account's buyer is at
  // acct.buyer. Reading acct._buyer returns undefined and every New
  // Customer card silently shows "No buyer yet" regardless of Zoho state.
  const buyer = acct?.buyer || null;
    const buyerLine = buyer
      ? `<div class="hs-orders-buyer"><i class="fa-solid fa-user"></i> ${escapeHtml(buyer._fullName || '')}${buyer._jobRole ? ` · ${escapeHtml(buyer._jobRole)}` : ''}</div>`
      : '';
    const phone = buyer?.Mobile || buyer?.Phone || r.phone || '';
    const email = buyer?.Email || acct?.Email || '';
    const actions = [];
    if (phone) {
      actions.push(`<a class="hs-orders-action" href="tel:${escapeAttr(phone)}"><i class="fa-solid fa-phone"></i> Call</a>`);
      actions.push(`<button class="hs-orders-action" onclick="textBuyerByPhone('${escapeAttr(phone)}', '${escapeAttr(buyer?._fullName || r.customerName || '')}')"><i class="fa-solid fa-message"></i> Text</button>`);
    }
    if (email) {
      actions.push(`<a class="hs-orders-action" href="mailto:${escapeAttr(email)}"><i class="fa-solid fa-envelope"></i> Email</a>`);
    }
    return `
      <div class="hs-orders-card ${sev}">
        <div class="hs-orders-head">
          <div class="hs-orders-name">
            ${escapeHtml(r.customerName || '—')}
            ${statePill}
          </div>
          <div class="hs-orders-days ${sev}">${days}d</div>
        </div>
        <div class="hs-orders-meta">${escapeHtml(lastOrder)}</div>
        ${buyerLine}
        ${actions.length ? `<div class="hs-orders-actions">${actions.join('')}</div>` : ''}
      </div>`;
  }).join('');
}

// ─── New Customers (state-machine cards) ──────────────────────────────────────
// Two sources feed this tab:
//   1) LeafLink (NJ only — Canfections is our NJ seller): cards drive the full
//      state machine — pending → ready → vibes_booked → checkin_due → done.
//      These are the richest cards because we have order status + ship date +
//      the Vibes onboard workflow.
//   2) Zoho first-order accounts (NY/RI/MO — any state except NJ/MA): cards
//      are surfaced when Total_Orders_Count === 1 in Zoho. They're simpler —
//      no LeafLink order status, no Vibes workflow (Vibes is NJ-only v1) —
//      so the card is just "first order landed, call the buyer to welcome
//      them." Uses the new cardState 'zoho_new'.
// MA is intentionally excluded from both paths (Reid: no MA new-customer
// tracking). NJ LeafLink cards always win over Zoho entries for the same
// zohoAccountId (the LeafLink state machine carries more info).
function combinedNewCustomers() {
  // Keep LeafLink cards intact — they're the richer source.
  const leafByAcct = new Set(
    (newCustomers || [])
      .filter((c) => c && c.zohoAccountId)
      .map((c) => c.zohoAccountId),
  );
  const leaf = (newCustomers || []).filter((c) => c.cardState !== 'done');

  // Add Zoho first-order accounts that LeafLink didn't already surface.
  // Covers NJ / NY / RI / MO. MA is the only market we drop entirely.
  //
  // For NJ: LeafLink's richer state-machine card always wins via the
  // `leafByAcct` dedup — this Zoho fallback only fills in when LeafLink
  // didn't match the customer (e.g., name mismatch) or hasn't reported
  // that account yet. That ensures the NJ tab never disappears just
  // because LeafLink's feed is thin on a given day.
  const zohoOnly = [];
  for (const a of accounts) {
    if (!a || !a.id) continue;
    if (Number(a._orderCount || 0) !== 1) continue;
    if (leafByAcct.has(a.id)) continue;
    const stateCode = normalizeStateCode(a._state || a.Billing_State);
    if (!stateCode || stateCode === 'MA') continue;
    zohoOnly.push({
      kind: 'zoho',
      cardState: 'zoho_new',
      zohoAccountId: a.id,
      customerName: a.Account_Name || '—',
      state: stateCode,
      firstOrderDate: a.First_Order_Date || null,
      lastOrderDate: a.Last_Order_Date || null,
      // Parsed server-side from Deal_Name ("{Account} - Order #N"). Stays
      // null when the Deal_Name didn't carry a "#N" — card then falls back
      // to the date-only line.
      firstOrderNumber: a.First_Order_Number || null,
      // NJ gets the Brand Team Onboarding button — the /api/sales-floor-
      // vibes-onboard endpoint accepts firstOrderDate as a ship-date
      // fallback for Zoho-sourced cards and runs a duplicate-Deal check
      // in the Needs Onboarding pipeline before creating a new one.
      vibesEligible: stateCode === 'NJ',
      // 4/20 cohort still applies: if the single first order landed on/after
      // 4/20/2026, mark it. Matches the LeafLink-side cohort rule.
      is420Cohort: isOnOrAfter420(a.First_Order_Date || a.Last_Order_Date),
      // Brand Team "Booked" state. Either the server stamped _vibesBooked
      // from a signed Onboarding deal (fetchSalesFloorOnboardingDeals), or
      // markZohoReadyToBrandTeam just optimistically set it after a
      // successful click. Card stays visible; primary CTA flips to a
      // "Brand Team Booked" status pill with the 12-day check-in date.
      vibesBooked: !!a._vibesBooked,
      checkInDueDate: a._checkInDueDate || null,
    });
  }

  return [...leaf, ...zohoOnly];
}

// Is this date on or after 4/20/2026? Mirrors server-side cohort logic so the
// gold-bar treatment is consistent across LeafLink + Zoho-sourced cards.
function isOnOrAfter420(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getTime() >= new Date('2026-04-20T00:00:00Z').getTime();
}

function renderNewCustomers() {
  const list = document.getElementById('newcust-list');
  const meta = document.getElementById('newcust-count');
  if (!list) return;

  // Until LeafLink has fetched at least once we hold the UI in a loading state
  // — even though Zoho accounts may already be populated — so we don't paint a
  // half-list and then flash-update. Zoho-only cards appear alongside LeafLink
  // cards the moment both sources are ready.
  const combined = combinedNewCustomers();
  // Normalize c.state on the way in — LeafLink-sourced cards can come back
  // with "New Jersey" rather than "NJ" (Billing_State in Zoho isn't
  // guaranteed to be 2-letter), so compare on the canonical code.
  const stateFiltered = currentNewCustState === 'all'
    ? combined
    : combined.filter((c) => normalizeStateCode(c.state) === currentNewCustState);

  if (meta) {
    // Count anything that's not 'done' — LeafLink pending/ready/checkin_due
    // AND Zoho zoho_new cards all represent shops that still need action.
    const active = stateFiltered.filter(c =>
      c.cardState !== 'done' && c.cardState !== 'vibes_booked'
    ).length;
    const cohort420 = stateFiltered.filter(c => c.is420Cohort && c.cardState !== 'done').length;
    if (!leaflinkOrdersFetched) {
      meta.textContent = 'Loading…';
    } else {
      const base = `${active} active ${active === 1 ? 'shop' : 'shops'}`;
      meta.textContent = cohort420 > 0
        ? `${base} · ${cohort420} from 4/20`
        : base;
    }
  }

  if (!leaflinkOrdersFetched) {
    list.innerHTML = `<div class="hs-empty-state">
      <div class="hs-empty-state-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
      Loading new customers…
    </div>`;
    return;
  }

  if (stateFiltered.length === 0) {
    const scope = currentNewCustState === 'all' ? '' : ` in ${currentNewCustState}`;
    list.innerHTML = `<div class="hs-empty-state">
      <div class="hs-empty-state-icon"><i class="fa-solid fa-user-plus"></i></div>
      No new shops onboarding${scope} right now.
    </div>`;
    return;
  }

  // Order:
  //   1) 4/20 drop cohort first — fresh first-time Highsman buyers from the
  //      4/20 weekend. Lock them in now.
  //   2) within each group:
  //        checkin_due → ready → pending → zoho_new → vibes_booked
  //      (zoho_new sits near the bottom because we don't have order-status
  //       urgency to rank it against LeafLink cards — it's a "call the buyer"
  //       nudge that's always the same priority.)
  const order = {checkin_due: 0, ready: 1, pending: 2, zoho_new: 3, vibes_booked: 4};
  const sorted = [...stateFiltered].sort((a, b) => {
    const cohortDelta = (b.is420Cohort ? 1 : 0) - (a.is420Cohort ? 1 : 0);
    if (cohortDelta !== 0) return cohortDelta;
    return (order[a.cardState] ?? 9) - (order[b.cardState] ?? 9);
  });

  list.innerHTML = sorted.map((c, idx) => {
    return c.cardState === 'zoho_new'
      ? renderZohoNewCustCard(c, idx)
      : renderNewCustCard(c, idx);
  }).join('');
}

// Build the buyer contact line shown on each New Customer card. Rep asked
// for the contact name to be visible on every card (not just buried in the
// CTA buttons as a hover target). Shows "{Name} · {Role}" when we've got a
// buyer, otherwise a muted "No buyer contact on file" line. Kept as a
// helper so the Zoho-only and LeafLink card renderers stay in sync.
function renderNewCustBuyerLine(buyer) {
  if (!buyer) {
    return `<div class="hs-newcust-buyer is-empty"><i class="fa-solid fa-user-slash"></i> No buyer contact on file</div>`;
  }
  const name = escapeHtml(buyer._fullName || 'Unnamed Contact');
  const roleHtml = buyer._jobRole
    ? ` <span class="hs-newcust-buyer-role">· ${escapeHtml(buyer._jobRole)}</span>`
    : '';
  return `<div class="hs-newcust-buyer"><i class="fa-solid fa-user"></i> ${name}${roleHtml}</div>`;
}

// Render a simpler "first order from Zoho" card for NY/RI/MO. No LeafLink
// ship-date / order-status context and no Vibes-onboard button (Vibes is NJ
// v1 only). The rep's job here is simpler: call/text the buyer to welcome
// them to Highsman and confirm the order shipped smoothly.
function renderZohoNewCustCard(c, idx) {
  const acctId = escapeAttr(c.zohoAccountId || '');
  const name = escapeHtml(c.customerName || '—');
  const state = c.state ? `<span class="hs-newcust-state">${escapeHtml(c.state)}</span>` : '';
  const acct = c.zohoAccountId ? accounts.find(a => a.id === c.zohoAccountId) : null;
  // Property name: `buyer` (no underscore). The sync endpoint writes
  // acc.buyer = pickBuyer(list), so the matched-account's buyer is at
  // acct.buyer. Reading acct._buyer returns undefined and every New
  // Customer card silently shows "No buyer yet" regardless of Zoho state.
  const buyer = acct?.buyer || null;
  const buyerPhone = buyer?.Mobile || buyer?.Phone || acct?.Phone || '';
  const buyerEmail = buyer?.Email || acct?.Email || '';
  const buyerName = buyer?._fullName || c.customerName || '';

  // Mirror the LeafLink card's "Order #N · {status}" format when we have the
  // order number from Zoho — gives the rep the same reference they'd get from
  // the LeafLink pipeline. Falls back to "First order {date}" when the
  // matching Deal_Name didn't carry a #N token.
  const dateLabel = c.firstOrderDate
    ? escapeHtml(formatDate(c.firstOrderDate))
    : '';
  let orderLine = '';
  if (c.firstOrderNumber) {
    orderLine = dateLabel
      ? `<div class="hs-newcust-order">Order #${escapeHtml(String(c.firstOrderNumber))} · ${dateLabel}</div>`
      : `<div class="hs-newcust-order">Order #${escapeHtml(String(c.firstOrderNumber))}</div>`;
  } else if (dateLabel) {
    orderLine = `<div class="hs-newcust-order">First order ${dateLabel}</div>`;
  }

  // Copy + actions split by state AND booked state. Once the rep has clicked
  // Brand Team Onboarding (or the server sees a signed Onboarding deal from
  // a previous click), the card stays visible but flips into a "booked" view
  // — the primary CTA is replaced by a status pill showing the 12-day
  // check-in date, and the copy switches to remind the rep to stay in touch
  // until Sky visits.
  const isBooked = !!c.vibesBooked;
  const checkInLabel = c.checkInDueDate ? formatDate(c.checkInDueDate) : null;

  const body = isBooked
    ? `
    <div class="hs-newcust-copy">
      Brand team locked in. ${checkInLabel ? `Check in by <strong>${escapeHtml(checkInLabel)}</strong>` : 'Check in once Sky has walked product'} — keep the buyer warm until then.
    </div>`
    : c.vibesEligible
    ? `
    <div class="hs-newcust-copy">
      First order just landed. Send the brand team — Sky drops in to walk product and stock the shelves.
    </div>`
    : `
    <div class="hs-newcust-copy">
      First Highsman order just landed. Call the buyer — welcome them, confirm the drop, set the reorder cadence.
    </div>`;

  const actions = [];
  if (c.vibesEligible && !isBooked) {
    // NJ → Brand Team Onboarding is the primary CTA. Uses firstOrderDate as
    // the ship-date fallback (server accepts it for Zoho-sourced cards).
    // HTML-escape the JSON-stringified args so the interior double-quotes
    // don't close out the onclick="..." attribute. Without escapeAttr, the
    // attribute parser truncates at the first " and the handler never runs.
    const safeName = escapeAttr(JSON.stringify(c.customerName || ''));
    const safeOrder = escapeAttr(JSON.stringify(c.firstOrderNumber || ''));
    const safeDate = escapeAttr(JSON.stringify(c.firstOrderDate || ''));
    actions.push(
      `<button class="hs-newcust-btn is-primary" data-newcust-idx="${idx}" onclick="markZohoReadyToBrandTeam('${acctId}', ${safeName}, ${safeOrder}, ${safeDate}, ${idx})"><i class="fa-solid fa-route"></i> Brand Team Onboarding</button>`,
    );
  }
  // Budtender Training (Vibes Tier 2). NJ-only. Parallel to Onboarding but
  // can be booked even once the Onboarding deal is already locked in — the
  // account can have both at once (onboard the buyer on Tue, train the staff
  // the following Thu). When already booked we flip to a non-clickable pill
  // with the target date.
  if (c.vibesEligible) {
    const trainingBookedFlag = !!acct?._trainingBooked;
    const trainingDateLabel = acct?._trainingDate ? formatDate(acct._trainingDate) : '';
    if (trainingBookedFlag) {
      actions.push(
        `<button class="hs-newcust-btn is-disabled" disabled title="Training booked${trainingDateLabel ? ` — target ${trainingDateLabel}` : ''}"><i class="fa-solid fa-graduation-cap"></i> Training ${trainingDateLabel ? `· ${trainingDateLabel}` : 'Booked'}</button>`,
      );
    } else {
      const safeName = escapeAttr(JSON.stringify(c.customerName || ''));
      actions.push(
        `<button class="hs-newcust-btn" data-training-acct="${acctId}" onclick="markZohoTraining('${acctId}', ${safeName}, ${idx})"><i class="fa-solid fa-graduation-cap"></i> Training</button>`,
      );
    }
  }
  if (buyerPhone) {
    actions.push(`<a class="hs-newcust-btn${c.vibesEligible ? '' : ' is-primary'}" href="tel:${escapeAttr(buyerPhone)}"><i class="fa-solid fa-phone"></i> Call buyer</a>`);
    actions.push(`<button class="hs-newcust-btn" onclick="textBuyerByPhone('${escapeAttr(buyerPhone)}', '${escapeAttr(buyerName)}')"><i class="fa-solid fa-message"></i> Text</button>`);
  }
  if (buyerEmail) {
    actions.push(`<a class="hs-newcust-btn" href="mailto:${escapeAttr(buyerEmail)}"><i class="fa-solid fa-envelope"></i> Email</a>`);
  }
  // AI Brief — available regardless of whether we have a buyer yet. Without a
  // buyer the brief runs against the account-level phone/email (still useful
  // for the cold-open template and any CRM notes on the account).
  actions.push(`<button class="hs-newcust-btn" onclick="openBriefForNewCust('${acctId}')"><i class="fa-solid fa-brain"></i> Brief</button>`);
  const actionRow = actions.length
    ? `<div class="hs-newcust-actions">${actions.join('')}</div>`
    : `<div class="hs-newcust-actions"><span class="hs-newcust-btn is-disabled" title="No buyer contact on file"><i class="fa-solid fa-user-slash"></i> No buyer yet</span></div>`;

  const cohortPill = c.is420Cohort
    ? `<span class="hs-newcust-pill is-420" title="First Highsman order on or after 4/20/2026">4/20 DROP</span>`
    : '';
  const bookedPill = isBooked
    ? `<span class="hs-newcust-pill is-booked" title="Brand Team visit booked${checkInLabel ? ` — check in by ${checkInLabel}` : ''}"><i class="fa-solid fa-check"></i> Brand Team Booked</span>`
    : '';
  const cardClasses = ['hs-newcust-card', 'is-first-order'];
  if (c.is420Cohort) cardClasses.push('is-420-cohort');
  if (isBooked) cardClasses.push('is-booked');

  return `
    <div class="${cardClasses.join(' ')}" data-newcust-id="${acctId}">
      <div class="hs-newcust-head">
        <div class="hs-newcust-name">${name}${state}</div>
        <div class="hs-newcust-pills">
          ${bookedPill}
          ${cohortPill}
          <span class="hs-newcust-pill is-first-order">First Order</span>
        </div>
      </div>
      ${orderLine}
      ${renderNewCustBuyerLine(buyer)}
      ${body}
      ${actionRow}
    </div>`;
}

function renderNewCustCard(c, idx) {
  const acctId = escapeAttr(c.zohoAccountId || '');
  const name = escapeHtml(c.customerName || '—');
  const state = c.state ? `<span class="hs-newcust-state">${escapeHtml(c.state)}</span>` : '';
  const acct = c.zohoAccountId ? accounts.find(a => a.id === c.zohoAccountId) : null;
  // Property name: `buyer` (no underscore). The sync endpoint writes
  // acc.buyer = pickBuyer(list), so the matched-account's buyer is at
  // acct.buyer. Reading acct._buyer returns undefined and every New
  // Customer card silently shows "No buyer yet" regardless of Zoho state.
  const buyer = acct?.buyer || null;
  const buyerPhone = buyer?.Mobile || buyer?.Phone || c.phone || '';
  const orderLine = c.firstOrderNumber
    ? `<div class="hs-newcust-order">Order #${escapeHtml(String(c.firstOrderNumber))} · ${escapeHtml(c.firstOrderStatus || 'Pending')}</div>`
    : '';

  let pillCls = 'is-pending';
  let pillText = 'Awaiting Ship Date';
  let body = '';
  let actionRow = '';

  if (c.cardState === 'pending') {
    pillCls = 'is-pending';
    pillText = 'Awaiting Ship Date';
    body = `
      <div class="hs-newcust-copy">
        First order in. Vibes visit unlocks the moment the order is Accepted with a ship date.
      </div>`;
    actionRow = `
      <div class="hs-newcust-actions">
        <button class="hs-newcust-btn is-disabled" disabled title="Waiting on Accepted status + ship date">
          <i class="fa-solid fa-lock"></i> Brand Team Onboarding
        </button>
      </div>`;
  } else if (c.cardState === 'ready') {
    if (!c.vibesEligible) {
      pillCls = 'is-ready';
      pillText = 'Order Ready';
      body = `
        <div class="hs-newcust-copy">
          Order's locked in. Vibes coverage isn't live in ${escapeHtml(c.state || 'this state')} yet — give the buyer a call instead.
        </div>`;
      const tel = buyerPhone
        ? `<a class="hs-newcust-btn" href="tel:${escapeAttr(buyerPhone)}"><i class="fa-solid fa-phone"></i> Call buyer</a>`
        : '';
      actionRow = `<div class="hs-newcust-actions">${tel}</div>`;
    } else {
      pillCls = 'is-ready';
      pillText = 'Order Ready';
      // HTML-escape the JSON-stringified args so the interior double-quotes
      // don't close out the onclick="..." attribute. Without escapeAttr, the
      // attribute parser truncates at the first " and the handler never runs.
      const safeName = escapeAttr(JSON.stringify(c.customerName || ''));
      const safeOrder = escapeAttr(JSON.stringify(c.firstOrderNumber || ''));
      const safeShip = escapeAttr(JSON.stringify(c.actualShipDate || ''));
      const safeStatus = escapeAttr(JSON.stringify(c.firstOrderStatus || ''));
      body = `
        <div class="hs-newcust-copy">
          Ship date locked. Send the brand team — Sky drops in to walk product and stock the shelves.
        </div>`;
      actionRow = `
        <div class="hs-newcust-actions">
          <button class="hs-newcust-btn is-primary" data-newcust-idx="${idx}"
            onclick="markReadyToVibesVisit('${acctId}', ${safeName}, ${safeOrder}, ${safeShip}, ${safeStatus}, ${idx})">
            <i class="fa-solid fa-route"></i> Brand Team Onboarding
          </button>
        </div>`;
    }
  } else if (c.cardState === 'vibes_booked') {
    pillCls = 'is-booked';
    pillText = 'Vibes Booked';
    const due = c.checkInDueDate ? formatDate(c.checkInDueDate) : 'TBD';
    body = `
      <div class="hs-newcust-copy">
        Visit on Sky's board. Check in by <strong>${escapeHtml(due)}</strong> to see how product is moving.
      </div>`;
  } else if (c.cardState === 'checkin_due') {
    pillCls = 'is-checkin';
    pillText = 'Check-in Due';
    // Compute days post-ship from actualShipDate (server doesn't ship daysSinceShip).
    let days = 12;
    if (c.actualShipDate) {
      const ship = new Date(c.actualShipDate).getTime();
      if (!isNaN(ship)) days = Math.max(0, Math.floor((Date.now() - ship) / 86400000));
    }
    body = `
      <div class="hs-newcust-copy">
        ${days} days post-ship. Call the buyer — confirm sales, restock if they're flying.
      </div>`;
    const tel = buyerPhone
      ? `<a class="hs-newcust-btn" href="tel:${escapeAttr(buyerPhone)}"><i class="fa-solid fa-phone"></i> Call</a>`
      : '';
    actionRow = `
      <div class="hs-newcust-actions">
        ${tel}
        <button class="hs-newcust-btn is-primary" data-newcust-idx="${idx}"
          onclick="logCheckin('${acctId}', ${JSON.stringify(c.customerName || '')}, ${idx})">
          <i class="fa-solid fa-clipboard-check"></i> Log Check-in
        </button>
      </div>`;
  }

  // AI Brief button — reps want this available on every LeafLink-sourced new
  // customer card regardless of state (pending / ready / vibes_booked /
  // checkin_due). Inject it into the existing actions row if we've built one,
  // otherwise create a standalone row so the button is never missing.
  const briefBtn = `<button class="hs-newcust-btn" onclick="openBriefForNewCust('${acctId}')"><i class="fa-solid fa-brain"></i> Brief</button>`;

  // Budtender Training (Vibes Tier 2). NJ-only. Sits next to Brief on every
  // card state — pending/ready/vibes_booked/checkin_due all get the button
  // because training cadence is independent of the onboarding ship-date.
  // Flips to a booked pill when an open Training deal already exists on the
  // account (server stamps acct._trainingBooked from the signed Deal).
  let trainingBtn = '';
  if (c.vibesEligible) {
    const trainingBookedFlag = !!acct?._trainingBooked;
    const trainingDateLabel = acct?._trainingDate ? formatDate(acct._trainingDate) : '';
    if (trainingBookedFlag) {
      trainingBtn = `<button class="hs-newcust-btn is-disabled" disabled title="Training booked${trainingDateLabel ? ` — target ${trainingDateLabel}` : ''}"><i class="fa-solid fa-graduation-cap"></i> Training ${trainingDateLabel ? `· ${trainingDateLabel}` : 'Booked'}</button>`;
    } else {
      const safeName = escapeAttr(JSON.stringify(c.customerName || ''));
      trainingBtn = `<button class="hs-newcust-btn" data-training-acct="${acctId}" onclick="markZohoTraining('${acctId}', ${safeName}, ${idx})"><i class="fa-solid fa-graduation-cap"></i> Training</button>`;
    }
  }

  const extraBtns = `${trainingBtn}${briefBtn}`;
  if (actionRow.includes('</div>')) {
    actionRow = actionRow.replace('</div>', `${extraBtns}</div>`);
  } else {
    actionRow = `<div class="hs-newcust-actions">${extraBtns}</div>`;
  }

  const cohortPill = c.is420Cohort
    ? `<span class="hs-newcust-pill is-420" title="First Highsman order on or after 4/20/2026">4/20 DROP</span>`
    : '';
  const cardClasses = ['hs-newcust-card', pillCls];
  if (c.is420Cohort) cardClasses.push('is-420-cohort');

  return `
    <div class="${cardClasses.join(' ')}" data-newcust-id="${acctId}">
      <div class="hs-newcust-head">
        <div class="hs-newcust-name">${name}${state}</div>
        <div class="hs-newcust-pills">
          ${cohortPill}
          <span class="hs-newcust-pill ${pillCls}">${pillText}</span>
        </div>
      </div>
      ${orderLine}
      ${renderNewCustBuyerLine(buyer)}
      ${body}
      ${actionRow}
    </div>`;
}

// ─── New Customer state transitions ──────────────────────────────────────────
async function markReadyToVibesVisit(zohoAccountId, customerName, firstOrderNumber, actualShipDate, firstOrderStatus, idx) {
  // Resolve by Zoho account id — `idx` is the sorted-view index, not the
  // source-array index, so a direct newCustomers[idx] lookup misfires after
  // any re-sort (e.g. 4/20 cohort hoist).
  const card = newCustomers.find((c) => c.zohoAccountId === zohoAccountId);
  if (!card) return;

  // Optimistic: flip to vibes_booked locally
  const prevState = card.cardState;
  const prevDue = card.checkInDueDate;
  card.cardState = 'vibes_booked';
  card.checkInDueDate = card.checkInDueDate || estimateCheckinDue(actualShipDate);
  renderNewCustomers();
  renderDashboard();
  updateStats();

  try {
    const res = await fetch('/api/sales-floor-vibes-onboard', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        zohoAccountId,
        customerName,
        firstOrderNumber,
        actualShipDate,
        firstOrderStatus,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Vibes onboard failed (${res.status})`);
    }
    // Lock in the server's check-in date (authoritative)
    card.dealId = data.dealId || null;
    card.checkInDueDate = data.checkInDueDate || card.checkInDueDate;
    card.cardState = 'vibes_booked';
    renderNewCustomers();
    // Outlier locations (Shore House Canna, Cape May, LBI) get a longer toast
    // with an info/warning tone so Sky knows to arrange the visit direct with
    // Serena instead of waiting for the weekly route to pick it up.
    if (data.isOutlier) {
      toast(data.message || 'Outlier location — arrange direct with Serena.', 'info', 8000);
    } else {
      toast(data.message || `Brand team locked in. Check in by ${formatDate(card.checkInDueDate)}.`);
    }
  } catch (err) {
    // Rollback
    card.cardState = prevState;
    card.checkInDueDate = prevDue;
    renderNewCustomers();
    renderDashboard();
    updateStats();
    toast(err.message || 'Brand Team onboarding failed', 'error');
  }
}

// Zoho-sourced twin of markReadyToVibesVisit. Used on the NJ Zoho-fallback
// cards (Total_Orders_Count === 1 on the Account but LeafLink's name match
// missed). Sends firstOrderDate in place of actualShipDate — the server
// accepts that as a ship-date fallback and the /api/sales-floor-vibes-onboard
// endpoint dedup-checks existing Needs Onboarding deals so this is safe to
// click twice. No local state-machine row to optimistically flip (these
// cards are derived on the fly from accounts[]), so we just disable the
// button, POST, and toast on return.
async function markZohoReadyToBrandTeam(zohoAccountId, customerName, firstOrderNumber, firstOrderDate, idx) {
  // Lock the button so a double-tap doesn't fire twice.
  const buttons = document.querySelectorAll(
    `[data-newcust-idx="${idx}"]`,
  );
  for (const b of buttons) {
    if (b.tagName === 'BUTTON') {
      b.disabled = true;
      b.classList.add('is-disabled');
    }
  }

  try {
    const res = await fetch('/api/sales-floor-vibes-onboard', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        zohoAccountId,
        customerName,
        firstOrderNumber,
        // Zoho-path body: firstOrderDate is the basis for the 12-day check-in
        // timer when actualShipDate/firstOrderStatus aren't available.
        firstOrderDate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Brand team onboarding failed (${res.status})`);
    }
    // Flip the account into "booked" state WITHOUT destroying _orderCount —
    // doing that wiped the card entirely because combinedNewCustomers() gates
    // Zoho-sourced cards on `_orderCount === 1`. We want the card to stay
    // visible in a booked visual state so the rep can still call/text/email
    // the buyer (and see the 12-day check-in date) until the actual check-in
    // is logged. On the next server sync, fetchSalesFloorOnboardingDeals
    // stamps _vibesBooked from the signed Deal so the state persists.
    const acct = accounts.find((a) => a && a.id === zohoAccountId);
    if (acct) {
      acct._vibesBooked = true;
      acct._checkInDueDate = data.checkInDueDate || null;
    }
    renderNewCustomers();
    renderDashboard();
    updateStats();
    const when = data.checkInDueDate ? formatDate(data.checkInDueDate) : 'soon';
    // Outlier drops don't ride the weekly route — Sky needs to know to text
    // Serena direct. Longer toast + info tone so the message lands.
    if (data.isOutlier) {
      toast(data.message || 'Outlier location — arrange direct with Serena.', 'info', 8000);
    } else {
      toast(
        data.message || (
          data.alreadyBooked
            ? `Already on Sky's board. Check in by ${when}.`
            : `Brand team locked in. Check in by ${when}.`
        ),
      );
    }
  } catch (err) {
    for (const b of buttons) {
      if (b.tagName === 'BUTTON') {
        b.disabled = false;
        b.classList.remove('is-disabled');
      }
    }
    toast(err.message || 'Brand Team onboarding failed', 'error');
  }
}

// Book a Budtender Training visit (Vibes Tier 2). Parallel to the Onboarding
// flow but with the [TIER:TRAINING] marker in the Deal description — Sky's
// route builder buckets Training separately from Onboarding, and dedup lets
// both exist on the same account at once (onboard the buyer, train the staff).
//
// Any rep can fire this against any NJ account, regardless of order history —
// training is where product knowledge lands on the floor and sometimes the
// training visit is the thing that tips a cold account into its first order.
// The server enforces NJ-only (Vibes coverage rule) and de-dupes open Training
// deals on the same account. Sky cannot book Tier 3 Check-Ins (those are
// system-auto-scheduled) — if the buyer asks for a visit that isn't a fresh
// onboard, Sky books it as a Training.
async function markZohoTraining(zohoAccountId, customerName, idx, opts) {
  const trainingFocus = (opts && opts.trainingFocus) || '';
  // Lock every matching Training button across the UI (could appear in both
  // Accounts list and New Customers list for the same zohoAccountId).
  const buttons = document.querySelectorAll(
    `[data-training-idx="${idx}"], [data-training-acct="${zohoAccountId}"]`,
  );
  for (const b of buttons) {
    if (b.tagName === 'BUTTON') {
      b.disabled = true;
      b.classList.add('is-disabled');
    }
  }

  try {
    const res = await fetch('/api/sales-floor-vibes-training', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({zohoAccountId, customerName, trainingFocus}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Training booking failed (${res.status})`);
    }
    // Stamp both _trainingBooked + _trainingDate on the account record so the
    // card flips into booked state immediately. Server will re-stamp from the
    // signed Training deal on the next sync so the state survives a refresh.
    const acct = accounts.find((a) => a && a.id === zohoAccountId);
    if (acct) {
      acct._trainingBooked = true;
      acct._trainingDealId = data.dealId || null;
      acct._trainingDate = data.trainingDate || null;
    }
    renderAccounts();
    renderNewCustomers();
    renderDashboard();
    updateStats();
    // Training on an outlier location → tell Sky to coordinate direct with
    // Serena instead of waiting for the weekly route to pick it up.
    if (data.isOutlier) {
      toast(
        data.message || 'Outlier location — reach out to Serena direct to arrange a Shore run.',
        'info',
        8000,
      );
    } else {
      const when = data.trainingDate ? formatDate(data.trainingDate) : 'this week';
      toast(
        data.message || (
          data.alreadyBooked
            ? `Training already on Sky's board. Target ${when}.`
            : `Training booked. Serena in by ${when}.`
        ),
      );
    }
  } catch (err) {
    for (const b of buttons) {
      if (b.tagName === 'BUTTON') {
        b.disabled = false;
        b.classList.remove('is-disabled');
      }
    }
    toast(err.message || 'Training booking failed', 'error');
  }
}

async function logCheckin(zohoAccountId, customerName, idx) {
  const card = newCustomers.find((c) => c.zohoAccountId === zohoAccountId);
  if (!card) return;

  const summary = (prompt(`Quick note on ${customerName} — how's product moving?`, '') || '').trim();
  const prevState = card.cardState;

  // Optimistic: graduate to done (will disappear from list)
  card.cardState = 'done';
  renderNewCustomers();
  renderDashboard();
  updateStats();

  try {
    const res = await fetch('/api/sales-floor-checkin-done', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({zohoAccountId, customerName, summary}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Check-in log failed (${res.status})`);
    }
    toast(`Check-in logged for ${customerName}.`);
  } catch (err) {
    // Rollback
    card.cardState = prevState;
    renderNewCustomers();
    renderDashboard();
    updateStats();
    toast(err.message || 'Check-in log failed', 'error');
  }
}

function estimateCheckinDue(shipISO) {
  const ship = shipISO ? new Date(shipISO).getTime() : Date.now();
  if (isNaN(ship)) return null;
  return new Date(ship + 12 * 86400 * 1000).toISOString().slice(0, 10);
}

// Fire the Text action from an Orders Due card. The card is keyed by Zoho
// account, not a leads/accounts index, so we open the SMS module directly.
function textBuyerByPhone(phone, name) {
  const e164 = normalizePhoneE164(phone);
  showTab('sms');
  setTimeout(() => {
    if (!window.SMS) return;
    if (e164) {
      window.SMS.openConversation(e164);
    } else {
      window.SMS.openNew && window.SMS.openNew();
      const nameEl = document.getElementById('sms-new-name');
      if (nameEl && name) nameEl.value = name;
    }
  }, 60);
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
// Accounts tab is gated to "has at least one order" — _orderCount >= 1. The
// order count comes from the Zoho Accounts.Total_Orders_Count field, which the
// LeafLink→Zoho integration maintains across every market (NJ + NY + MO + RI,
// etc.). Zero-order accounts are temporarily hidden here; Reid plans to move
// them to Leads in Zoho. We intentionally do NOT filter on LeafLink presence —
// the LeafLink feed only polls Canfections NJ, which would hide valid orders
// from MO/NY/RI etc. Zoho is the cross-state superset.
//
// `orderedAccounts` is shared with renderAccountStateTabs() so the tab chips
// reflect the gated list, not the full list — otherwise "RI 2" could show when
// clicking RI would return zero results.
function orderedAccounts() {
  return accounts.filter((a) => (a._orderCount || 0) >= 1);
}

function renderAccounts() {
  let list = orderedAccounts();
  if (currentAccountState && currentAccountState !== 'all') {
    // `_state` is the server-resolved canonical state (Account_State picklist
    // first, Billing_State fallback, Shipping_State last). Filtering on
    // Billing_State alone used to hide records where the picklist said "RI"
    // but billing was blank or the long-form "Rhode Island".
    list = list.filter(a => normalizeStateCode(a._state || a.Billing_State) === currentAccountState);
  }
  const q = document.getElementById('account-search')?.value?.toLowerCase();
  if (q) list = list.filter(a =>
    (a.Account_Name || '').toLowerCase().includes(q) ||
    (a.Industry || '').toLowerCase().includes(q)
  );
  document.getElementById('account-count').textContent = `${list.length} account${list.length !== 1 ? 's' : ''}`;
  const el = document.getElementById('account-list');
  if (list.length === 0) {
    el.innerHTML = `
      <div class="hs-empty-state py-10">
        <div class="hs-empty-state-icon"><i class="fa-solid fa-building"></i></div>
        No accounts loaded. Sync Zoho CRM to get started.
      </div>`;
    return;
  }
  el.innerHTML = list.map((a) => {
    const idx = accounts.indexOf(a);
    const subtitle = a.Industry || '';
    // Display the canonical 2-letter state (from _state) instead of whatever
    // shape Billing_State happens to be in — keeps cards consistent ("Warwick,
    // RI" everywhere instead of a mix of "Warwick, Rhode Island" and
    // "Warwick, RI") and hides blank-billing records cleanly.
    const stateLabel = a._state || normalizeStateCode(a.Billing_State) || '';
    const location = [a.Billing_City, stateLabel].filter(Boolean).join(', ');

    // Order-count badge in the card header. First-order accounts get a loud
    // "NEW" flag so reps recognize them instantly; repeat accounts get a quiet
    // "x orders" pill so the rep knows at a glance how engaged the shop is.
    // Values come straight from Zoho's Total_Orders_Count (single source of
    // truth across all markets — see server note in api.sales-floor-sync.tsx).
    const orderCount = a._orderCount || 0;
    let headerExtra = '';
    if (orderCount === 1) {
      headerExtra = `<span class="hs-account-order-badge is-new" title="First order on record">NEW</span>`;
    } else if (orderCount >= 2) {
      headerExtra = `<span class="hs-account-order-badge" title="${orderCount} orders on record">${orderCount} orders</span>`;
    }

    // Buyer takes precedence over the account-level Email/Phone. The buyer's
    // contact info is the data the rep actually wants to act on — calling the
    // shop's main switchboard rarely lands you in front of the person who
    // signs the PO.
    const buyer = a.buyer || null;
    const contactCount = Array.isArray(a.contacts) ? a.contacts.length : 0;
    const cardPhone = buyer ? (buyer.Mobile || buyer.Phone || a.Phone) : a.Phone;
    const cardEmail = buyer ? (buyer.Email || a.Email || '') : (a.Email || '');

    // Buyer pill: name + role, with a "Change" link. When there's no buyer
    // but the account has contacts, surface a CTA to set one. When there are
    // no contacts at all, fall back to a quiet hint.
    let extraRow = '';
    if (buyer) {
      extraRow = `
        <div class="hs-account-buyer">
          <div class="hs-account-buyer-line">
            <span class="hs-account-buyer-pill">
              <i class="fa-solid fa-user-tie"></i> Buyer
            </span>
            <div class="hs-account-buyer-meta">
              <div class="hs-account-buyer-name">${escapeHtml(buyer._fullName || '—')}</div>
              <div class="hs-account-buyer-role">${escapeHtml(buyer._jobRole || 'No Job Role set in Zoho')}</div>
            </div>
          </div>
          <button class="hs-account-buyer-change" type="button"
                  onclick="event.stopPropagation(); openBuyerPicker(${idx})"
                  title="Change the buyer for this account">
            <i class="fa-solid fa-pen-to-square"></i><span>Change</span>
          </button>
        </div>`;
    } else if (contactCount > 0) {
      extraRow = `
        <div class="hs-account-buyer is-empty">
          <div class="hs-account-buyer-line">
            <span class="hs-account-buyer-pill is-empty">
              <i class="fa-solid fa-user-plus"></i> No Buyer
            </span>
            <div class="hs-account-buyer-meta">
              <div class="hs-account-buyer-name">${contactCount} contact${contactCount === 1 ? '' : 's'} on file</div>
              <div class="hs-account-buyer-role">Pick the Buyer / Purchasing contact</div>
            </div>
          </div>
          <button class="hs-account-buyer-change is-cta" type="button"
                  onclick="event.stopPropagation(); openBuyerPicker(${idx})">
            <i class="fa-solid fa-user-check"></i><span>Set Buyer</span>
          </button>
        </div>`;
    } else {
      extraRow = `
        <div class="hs-account-buyer is-empty">
          <div class="hs-account-buyer-line">
            <span class="hs-account-buyer-pill is-empty">
              <i class="fa-solid fa-user-slash"></i> No Contacts
            </span>
            <div class="hs-account-buyer-meta">
              <div class="hs-account-buyer-name">No contacts in Zoho</div>
              <div class="hs-account-buyer-role">Add a contact to assign a buyer</div>
            </div>
          </div>
        </div>`;
    }

    // "Flag for Pete" toggle. When the account is already flagged, render an
    // active pill so Sky sees at a glance that Pete is already on it; clicking
    // removes the tag. When not flagged, clicking hands the account off to
    // Pete's /new-business Follow-Ups queue via the Zoho Tag.
    const flagged = !!a._flaggedForPete;
    const flagPill = `
      <button class="hs-action-pill is-flag-pete${flagged ? ' is-active' : ''}"
              onclick="event.stopPropagation(); toggleFlagForPete(${idx})"
              title="${flagged ? 'On Pete\\u2019s follow-up queue — click to remove' : 'Hand this account to Pete for follow-up'}">
        <i class="fa-solid fa-flag"></i>
        <span>${flagged ? 'On Pete' : 'Flag Pete'}</span>
      </button>`;

    // Budtender Training (Vibes Tier 2). NJ-only because Vibes coverage is
    // NJ-only in v1 — any other state's button renders disabled with a
    // "Vibes is NJ-only" tooltip so the rep understands why it's dark.
    // When a Training deal already exists, the button flips to a booked pill
    // showing the target visit date so Sky can't double-book.
    const njAccount = stateLabel === 'NJ';
    const trainingBooked = !!a._trainingBooked;
    const trainingDateLabel = a._trainingDate ? formatDate(a._trainingDate) : '';
    let trainingPill = '';
    if (trainingBooked) {
      trainingPill = `
        <button class="hs-action-pill is-training is-booked" disabled
                title="Training booked${trainingDateLabel ? ` — target ${trainingDateLabel}` : ''}">
          <i class="fa-solid fa-graduation-cap"></i>
          <span>Training ${trainingDateLabel ? `· ${trainingDateLabel}` : 'Booked'}</span>
        </button>`;
    } else if (njAccount) {
      const safeName = escapeAttr(JSON.stringify(a.Account_Name || ''));
      trainingPill = `
        <button class="hs-action-pill is-training"
                data-training-acct="${escapeAttr(a.id || '')}"
                onclick="event.stopPropagation(); markZohoTraining('${escapeAttr(a.id || '')}', ${safeName}, ${idx})"
                title="Book a Budtender Training visit with Serena">
          <i class="fa-solid fa-graduation-cap"></i>
          <span>Training</span>
        </button>`;
    } else {
      trainingPill = `
        <button class="hs-action-pill is-training is-disabled" disabled
                title="Vibes is NJ-only for v1">
          <i class="fa-solid fa-graduation-cap"></i>
          <span>Training</span>
        </button>`;
    }

    return contactCardHtml({
      idx,
      kind: 'account',
      name: a.Account_Name,
      subtitle,
      location,
      phone: cardPhone,
      email: cardEmail,
      emailHandler: `quickEmailAccount(${idx})`,
      textHandler: `quickText(${idx}, 'account')`,
      briefHandler: `openBriefForAccount(${idx})`,
      extraRow,
      headerExtra,
      // Training + Flag Pete both live in the single extraAction slot;
      // concatenating keeps the layout tight (one flex row) without having
      // to open a new prop on contactCardHtml just for a second pill.
      extraAction: `${trainingPill}${flagPill}`,
      // For accounts the inline add writes to the BUYER contact, not the
      // account itself (account-level Phone/Email are noisy switchboard
      // lines). No buyer = no inline add — the rep uses the buyer picker
      // to set one first, then adds the number/email.
      zohoModule: buyer?.id ? 'Contacts' : undefined,
      zohoId: buyer?.id || undefined,
    });
  }).join('');
}

function searchAccounts() { renderAccounts(); }

// ─── Flag for Pete ──────────────────────────────────────────────────────────
// Hands off (or reclaims) an account between Sky's Sales Floor queue and
// Pete's /new-business Follow-Ups queue. Single source of truth is the Zoho
// `pete-followup` Tag — the client toggle is optimistic so Sky doesn't wait
// on the round trip, but the UI reverts + toasts an error on failure.
async function toggleFlagForPete(idx) {
  const a = accounts[idx];
  if (!a || !a.id) return;
  const wasFlagged = !!a._flaggedForPete;
  const nextAction = wasFlagged ? 'unflag' : 'flag';

  // Optimistic flip. Sky sees the pill change state the instant she clicks;
  // if the API fails we roll it back and surface a toast.
  a._flaggedForPete = !wasFlagged;
  renderAccounts();

  try {
    const res = await fetch('/api/new-business-flag-followup', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({accountId: a.id, action: nextAction}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    toast(
      wasFlagged
        ? `${a.Account_Name || 'Account'} removed from Pete\u2019s queue`
        : `${a.Account_Name || 'Account'} flagged for Pete`,
      'success',
    );
  } catch (err) {
    // Roll back the optimistic flip and tell Sky what happened so she can retry.
    a._flaggedForPete = wasFlagged;
    renderAccounts();
    toast(`Flag failed: ${err?.message || 'unknown error'}`, 'error');
  }
}

// ─── State Filter Tabs (Leads + Accounts) ────────────────────────────────────
// Reps want a one-click way to scope their list to a specific state market
// (NJ, NY, RI, MO, etc.). The tab strip is rendered from whatever states are
// actually present in the loaded data — if the rep has no NY accounts, no
// NY tab shows up. "All" is always first; states sort alphabetically; counts
// reflect the un-state-filtered data so the chips don't lie about what's
// behind them.
//
// State values in Zoho are inconsistent ("New Jersey" vs "NJ" vs "Nj" vs
// "  nj  ") so we normalize to a 2-letter uppercase code before grouping
// and matching. Anything we can't recognize gets grouped under "—".

// Long-name → 2-letter code lookup. Covers the markets Highsman ships to;
// anything else falls through to a slugged 2-char fallback.
const US_STATE_LOOKUP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC',
};
function normalizeStateCode(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (US_STATE_LOOKUP[lower]) return US_STATE_LOOKUP[lower];
  // Already a 2-letter code? Uppercase + return.
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  // Fallback: first 2 alpha chars uppercased — not perfect but stable.
  const fallback = s.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
  return fallback || '';
}

// Tally counts per state code for whatever's in `records` (using `getter` to
// pull the raw state string off each record). Returns a sorted array of
// {code, count} so the tab strip renders deterministically.
function tallyStates(records, getter) {
  const counts = new Map();
  for (const r of records) {
    const code = normalizeStateCode(getter(r)) || '—';
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({code, count}))
    .sort((a, b) => {
      // Push the "—" (unknown) bucket to the end; everything else is alpha.
      if (a.code === '—') return 1;
      if (b.code === '—') return -1;
      return a.code.localeCompare(b.code);
    });
}

// Render the state-tab strip on the New Customers tab. Same pattern as the
// Leads/Accounts tabs: "All" first, then whichever state codes show up in the
// combined list (never MA — filtered out in combinedNewCustomers). Counts
// reflect the combined list, not the currently-filtered list, so a rep can
// see how many NY / RI / MO cards exist before clicking through.
function renderNewCustStateTabs() {
  const host = document.getElementById('newcust-state-tabs');
  if (!host) return;
  const combined = combinedNewCustomers();
  const buckets = tallyStates(combined, (c) => c.state);
  host.innerHTML = stateTabsHtml('newcust', buckets, currentNewCustState, combined.length);
}

function filterNewCustomersByState(code) {
  currentNewCustState = code;
  renderNewCustStateTabs();
  renderNewCustomers();
}

function renderLeadStateTabs() {
  const host = document.getElementById('lead-state-tabs');
  if (!host) return;
  // Bucket off the server-resolved `_state` (Market_State picklist first,
  // address State as fallback) so tab counts match what the filter returns.
  // Address `State` alone is noisy — half the records have the city or the
  // long-form state in there.
  const buckets = tallyStates(leads, (l) => l._state || l.State);
  host.innerHTML = stateTabsHtml('lead', buckets, currentLeadState, leads.length);
}
function renderAccountStateTabs() {
  const host = document.getElementById('account-state-tabs');
  if (!host) return;
  // Bucket off the server-resolved `_state` so the tab counts match what the
  // filter actually returns. Billing_State alone misses records where the
  // picklist holds the real state and billing is blank / long-form.
  // Use orderedAccounts() — not the full list — so "RI 2" never lies about
  // what's behind the chip when the tab itself filters to ordered accounts.
  const ordered = orderedAccounts();
  const buckets = tallyStates(ordered, (a) => a._state || a.Billing_State);
  host.innerHTML = stateTabsHtml('account', buckets, currentAccountState, ordered.length);
}

function stateTabsHtml(kind, buckets, active, totalCount) {
  // No data? Hide the strip entirely — an empty tab row is just clutter.
  if (!buckets.length) return '';
  const handler = kind === 'lead'
    ? 'filterLeadsByState'
    : kind === 'newcust'
      ? 'filterNewCustomersByState'
      : 'filterAccountsByState';
  const allBtn = `
    <button onclick="${handler}('all')"
            class="hs-state-tab ${active === 'all' ? 'active' : ''}"
            data-state="all">
      All<span class="hs-state-tab-count">${totalCount}</span>
    </button>`;
  const stateBtns = buckets.map(b => `
    <button onclick="${handler}('${escapeAttr(b.code)}')"
            class="hs-state-tab ${active === b.code ? 'active' : ''}"
            data-state="${escapeAttr(b.code)}"
            title="${b.code === '—' ? 'No state on file' : b.code}">
      ${escapeHtml(b.code)}<span class="hs-state-tab-count">${b.count}</span>
    </button>`).join('');
  return allBtn + stateBtns;
}

function filterLeadsByState(code) {
  currentLeadState = code;
  renderLeadStateTabs();
  renderLeads();
}
function filterAccountsByState(code) {
  currentAccountState = code;
  renderAccountStateTabs();
  renderAccounts();
}

// ─── Buyer Picker Modal ──────────────────────────────────────────────────────
// Opens a modal listing every contact on the account so the rep can pick
// who the buyer is. Clicking a contact POSTs to /api/sales-floor-set-account-buyer
// which writes the canonical buyer role ("Purchasing & Inventory Management")
// to that contact's Role_Title picklist (labelled "Job Role" in Zoho UI) in
// Zoho. We don't clear the previous buyer's role — multiple people can carry
// buyer duties.
//
// State is parked on `_buyerPicker` rather than a global because the modal is
// transient — opening on a different account just overwrites the slot.
let _buyerPicker = { accountIdx: null };

function openBuyerPicker(accountIdx) {
  const acc = accounts[accountIdx];
  if (!acc) return;
  _buyerPicker.accountIdx = accountIdx;
  const titleEl = document.getElementById('buyer-picker-account');
  if (titleEl) titleEl.textContent = acc.Account_Name || '—';
  const subEl = document.getElementById('buyer-picker-sub');
  if (subEl) {
    const loc = [acc.Billing_City, acc.Billing_State].filter(Boolean).join(', ');
    subEl.textContent = loc || 'Pick the contact who owns purchasing.';
  }
  renderBuyerPickerList();
  document.getElementById('buyer-picker-modal')?.classList.remove('hidden');
}

function closeBuyerPicker() {
  document.getElementById('buyer-picker-modal')?.classList.add('hidden');
  _buyerPicker.accountIdx = null;
}

function renderBuyerPickerList() {
  const host = document.getElementById('buyer-picker-list');
  if (!host) return;
  const acc = accounts[_buyerPicker.accountIdx];
  const list = (acc && Array.isArray(acc.contacts)) ? acc.contacts : [];
  if (!list.length) {
    host.innerHTML = `
      <div class="hs-empty-state py-8">
        <div class="hs-empty-state-icon"><i class="fa-solid fa-user-slash"></i></div>
        No contacts on this account in Zoho.
        <div style="margin-top:8px;font-size:0.82rem;opacity:0.7;">Add a contact in Zoho first, then sync.</div>
      </div>`;
    return;
  }
  // Buyer first, then everyone else (alpha by name) — keeps the current
  // buyer obvious and one click away if the rep just wants to confirm.
  const currentBuyerId = acc.buyer?.id || null;
  const sorted = [...list].sort((a, b) => {
    if (a.id === currentBuyerId) return -1;
    if (b.id === currentBuyerId) return 1;
    return (a._fullName || '').localeCompare(b._fullName || '');
  });
  host.innerHTML = sorted.map(c => {
    const isCurrent = c.id === currentBuyerId;
    const role = c._jobRole || 'No role on file';
    const meta = [c.Email, c.Mobile || c.Phone].filter(Boolean).join(' · ');
    return `
      <button class="hs-buyer-row ${isCurrent ? 'is-current' : ''}"
              type="button"
              onclick="selectBuyer('${escapeAttr(c.id)}')">
        <div class="hs-buyer-row-avatar">${initials(c._fullName || '')}</div>
        <div class="hs-buyer-row-main">
          <div class="hs-buyer-row-name">
            ${escapeHtml(c._fullName || '—')}
            ${isCurrent ? '<span class="hs-buyer-current-pill">Current</span>' : ''}
          </div>
          <div class="hs-buyer-row-role">${escapeHtml(role)}</div>
          ${meta ? `<div class="hs-buyer-row-meta">${escapeHtml(meta)}</div>` : ''}
        </div>
        <div class="hs-buyer-row-cta">
          <i class="fa-solid ${isCurrent ? 'fa-circle-check' : 'fa-arrow-right'}"></i>
        </div>
      </button>`;
  }).join('');
}

async function selectBuyer(contactId) {
  const idx = _buyerPicker.accountIdx;
  const acc = accounts[idx];
  if (!acc || !contactId) return;
  const newBuyer = (acc.contacts || []).find(c => c.id === contactId);
  if (!newBuyer) { toast('Contact not found on this account', 'error'); return; }

  // Optimistic UI — update the in-memory account so the card flips to the new
  // buyer immediately. We snapshot the previous buyer in case the API rejects
  // and we need to roll back without forcing a full re-sync.
  //
  // NOTE: 'Buyer / Manager' is the Zoho Role_Title picklist `actual_value`;
  // its display label is 'Purchasing & Inventory Management (Buyer,
  // Procurement, Inventory Manager)'. We set the actual_value here so the
  // optimistic state matches what Zoho will return on the next sync (no
  // flicker between pre- and post-sync values).
  const prevBuyer = acc.buyer;
  newBuyer._jobRole = 'Buyer / Manager';
  acc.buyer = newBuyer;
  renderAccounts();
  closeBuyerPicker();

  try {
    const res = await fetch('/api/sales-floor-set-account-buyer', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({contactId}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    toast(`${newBuyer._fullName} set as buyer`, 'success');
  } catch (err) {
    // Roll back in-memory and re-render so the card matches Zoho's truth again.
    acc.buyer = prevBuyer;
    if (newBuyer && prevBuyer && newBuyer.id !== prevBuyer.id) {
      // Role_Title (UI label "Job Role") is the only buyer-role signal —
      // never fall back to Title or Job_Title.
      newBuyer._jobRole = newBuyer.Role_Title || '';
    }
    renderAccounts();
    toast(`Could not save buyer: ${err.message}`, 'error');
  }
}

// ─── AI Brief Modal ───────────────────────────────────────────────────────────
// Shared open path — takes a pre-built lead-shape object and paints the modal.
// Used by three entry points:
//   openBrief(idx)               → Leads tab        → leads[idx]
//   openBriefForAccount(idx)     → Accounts tab     → account + buyer synthesized
//   openBriefForNewCust(acctId)  → New Customer tab → new-cust card + buyer synthesized
//
// The /api/brief server validates only that the lead has First_Name,
// Last_Name, or _fullName — so synthesized objects are safe as long as we
// fill those in plus the contact channels we know about.
async function openBriefForLeadObj(leadObj) {
  if (!leadObj) return;
  currentBriefLead = leadObj;
  const lead = currentBriefLead;
  const companyLine = lead.Company ? ` — ${lead.Company}` : '';
  document.getElementById('brief-lead-name').textContent = `${lead._fullName || '—'}${companyLine}`;
  document.getElementById('brief-content').innerHTML = `
    <div class="hs-loading">
      <div class="hs-spinner"></div>
      <p style="font-family:'Barlow Semi Condensed',sans-serif;font-size:0.9rem;color:#A9ACAF;margin-top:12px;">Generating your brief...</p>
    </div>`;
  document.getElementById('brief-modal').classList.remove('hidden');

  // Show the "Zoho" deep-link button whenever we know which record the brief
  // is about. Leads come from the raw Zoho Lead object (id is the Lead id);
  // Account- and New-Customer-shaped briefs carry an explicit _zohoModule /
  // _zohoId pair set by leadFromAccount() / leadFromNewCust().
  const zohoBtn = document.getElementById('brief-open-zoho-btn');
  if (zohoBtn) {
    const hasZoho = !!((lead._zohoModule && lead._zohoId) || lead.id);
    zohoBtn.classList.toggle('hidden', !hasZoho);
  }

  try {
    const brief = await AIBrief.generate(lead);
    document.getElementById('brief-content').innerHTML = AIBrief.renderBrief(brief);
  } catch (err) {
    document.getElementById('brief-content').innerHTML = `<p style="font-family:'Barlow Semi Condensed',sans-serif;color:#DC2626;padding:16px;">Could not generate brief: ${err.message}</p>`;
  }
}

async function openBrief(idx) {
  return openBriefForLeadObj(leads[idx]);
}

// Build a lead-shape object from an Account card so the Brief can run the
// same Quo+Gmail+Claude pipeline reps get on the Leads tab. Buyer info
// takes precedence over the account-level contact data (calling the shop's
// switchboard rarely reaches the person who signs the PO).
function leadFromAccount(a) {
  if (!a) return null;
  const buyer = a.buyer || null;
  const firstName = buyer?.First_Name || '';
  const lastName = buyer?.Last_Name || '';
  const fullName =
    buyer?._fullName ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    a.Account_Name ||
    '';
  const phone = buyer?.Mobile || buyer?.Phone || a.Phone || '';
  const email = buyer?.Email || a.Email || '';
  // Collect EVERY email attached to the account — buyer + all linked contacts.
  // The Brief route uses these to derive a company domain for the Gmail search
  // when the primary buyer has no email on file (e.g. "Akshay TBD" placeholder
  // buyers). Without this, Sky's history with OTHER contacts at the shop never
  // surfaces and Claude produces a cold brief for a warm account.
  const contactEmails = Array.isArray(a.contacts)
    ? a.contacts.map((c) => (c?.Email || '').trim()).filter(Boolean)
    : [];
  return {
    First_Name: firstName,
    Last_Name: lastName,
    _fullName: fullName,
    Company: a.Account_Name || '',
    Phone: phone,
    Mobile: buyer?.Mobile || '',
    Email: email,
    _status: a._orderCount >= 2 ? 'active' : (a._orderCount === 1 ? 'new customer' : 'account'),
    Lead_Source: 'Existing Account',
    Description: a.Description || buyer?.Description || '',
    // Handy for the client-side render (Sky's Play "CRM notes" block pulls
    // from lead.Description — already covered above).
    _jobRole: buyer?._jobRole || '',
    // Website + contact-email fallbacks — the Brief uses these to run a
    // domain-wide Gmail search so existing-account briefs surface the real
    // history even when the buyer has no email on file.
    Website: a.Website || '',
    _contactEmails: contactEmails,
    // Deep-link target for the Brief drawer's "Zoho" button. Prefer the
    // buyer Contact when we have one — the Account record is the PO/shop
    // shell, but role/notes edits happen on the person. Fall back to the
    // Account so the button still works on shops with no buyer assigned.
    _zohoModule: buyer?.id ? 'Contacts' : 'Accounts',
    _zohoId: buyer?.id || a.id || null,
  };
}

async function openBriefForAccount(idx) {
  const a = accounts[idx];
  return openBriefForLeadObj(leadFromAccount(a));
}

// Build a lead-shape object from a New Customer card. The card itself only
// carries summary fields (customerName, state, order info, buyer pointer) —
// we reach over to the matched Zoho account + its buyer to pull the phone,
// email, and CRM notes the Brief pipeline expects.
function leadFromNewCust(c) {
  if (!c) return null;
  const acct = c.zohoAccountId ? accounts.find(x => x.id === c.zohoAccountId) : null;
  const buyer = acct?.buyer || null;
  const firstName = buyer?.First_Name || '';
  const lastName = buyer?.Last_Name || '';
  const fullName =
    buyer?._fullName ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    c.customerName ||
    acct?.Account_Name ||
    '';
  const phone = buyer?.Mobile || buyer?.Phone || acct?.Phone || c.phone || '';
  const email = buyer?.Email || acct?.Email || '';
  const contactEmails = Array.isArray(acct?.contacts)
    ? acct.contacts.map((x) => (x?.Email || '').trim()).filter(Boolean)
    : [];
  return {
    First_Name: firstName,
    Last_Name: lastName,
    _fullName: fullName,
    Company: c.customerName || acct?.Account_Name || '',
    Phone: phone,
    Mobile: buyer?.Mobile || '',
    Email: email,
    _status: 'new customer',
    Lead_Source: c.is420Cohort ? '4/20 Drop' : 'First Order',
    Description: acct?.Description || buyer?.Description || '',
    _jobRole: buyer?._jobRole || '',
    // Same Brief-domain fallbacks as leadFromAccount — otherwise New Customer
    // briefs miss Sky's prior history with the shop.
    Website: acct?.Website || '',
    _contactEmails: contactEmails,
    // Brief drawer's "Zoho" deep-link — prefer the buyer Contact if we have
    // one matched, else the Account shell.
    _zohoModule: buyer?.id ? 'Contacts' : (acct?.id ? 'Accounts' : null),
    _zohoId: buyer?.id || acct?.id || null,
  };
}

async function openBriefForNewCust(zohoAccountId) {
  if (!zohoAccountId) return;
  const c = combinedNewCustomers().find(x => x.zohoAccountId === zohoAccountId);
  return openBriefForLeadObj(leadFromNewCust(c));
}

function closeBrief() {
  document.getElementById('brief-modal').classList.add('hidden');
  // Re-hide the Zoho deep-link button so it doesn't flash for a frame the
  // next time the drawer opens on a record without a known Zoho id.
  const zohoBtn = document.getElementById('brief-open-zoho-btn');
  if (zohoBtn) zohoBtn.classList.add('hidden');
  currentBriefLead = null;
}

function callLead(lead) {
  if (!lead) return;
  callsToday++;
  document.getElementById('stat-calls').textContent = callsToday;
  toast(`Call logged for ${lead._fullName}`, 'success');
  if (lead.Phone) window.location.href = `tel:${lead.Phone}`;
}

function emailFromBrief() {
  if (!currentBriefLead) return;
  closeBrief();
  document.getElementById('email-to').value = currentBriefLead.Email || '';
  document.getElementById('email-name').value = currentBriefLead._fullName || '';
  document.getElementById('email-company').value = currentBriefLead.Company || '';
  showTab('compose');
}

// Sister of emailFromBrief — opens (or starts) an SMS thread with the
// briefed lead. Used by the Brief modal's Text button.
function textFromBrief() {
  if (!currentBriefLead) return;
  const idx = leads.indexOf(currentBriefLead);
  closeBrief();
  if (idx >= 0) quickText(idx, 'lead');
}

// ─── Email ────────────────────────────────────────────────────────────────────
function previewTemplate() {
  const key = document.getElementById('email-template').value;
  const name = document.getElementById('email-name').value;
  const company = document.getElementById('email-company').value;
  if (!key) return;
  const filled = fillTemplate(key, { name, company, sender: CONFIG.salesperson.name });
  if (!filled) return;
  document.getElementById('email-subject').value = filled.subject;
  document.getElementById('email-body').value = filled.body;
  document.getElementById('email-preview-box').classList.remove('hidden');
}

async function sendTemplateEmail() {
  const to = document.getElementById('email-to').value;
  const subject = document.getElementById('email-subject').value;
  const body = document.getElementById('email-body').value;
  if (!to || !subject) { toast('Please fill in To and select a template', 'error'); return; }
  if (!body) { toast('Hit Preview first to generate the message', 'error'); return; }
  try {
    const result = await Gmail.send({ to, subject, body });
    const from = result?.from ? ` from ${result.from}` : '';
    toast(`Email sent to ${to}${from}`, 'success');
  } catch (err) {
    toast(`Send failed: ${err.message}`, 'error');
  }
}

async function sendQuickEmail() {
  const templateKey = document.getElementById('quick-template').value;
  const to = document.getElementById('quick-to').value;
  const name = document.getElementById('quick-name').value;
  if (!templateKey || !to) { toast('Select a template and enter an email', 'error'); return; }
  const filled = fillTemplate(templateKey, { name, sender: CONFIG.salesperson.name });
  try {
    const result = await Gmail.send({ to, subject: filled.subject, body: filled.body });
    const from = result?.from ? ` from ${result.from}` : '';
    toast(`Email sent to ${to}${from}`, 'success');
  } catch (err) {
    toast(`Send failed: ${err.message}`, 'error');
  }
}

function quickEmail(idx) {
  const lead = leads[idx];
  document.getElementById('email-to').value = lead.Email || '';
  document.getElementById('email-name').value = lead._fullName || '';
  document.getElementById('email-company').value = lead.Company || '';
  showTab('compose');
}

// ─── Account-side email shortcut ──────────────────────────────────────────────
// When an Account has an assigned buyer (Job Role = Purchasing & Inventory
// Management), we prefer the buyer's email + first name so the email is
// addressed to the actual person who signs the PO, not a generic info@
// inbox. Falls back to the Account's own Email if no buyer is set.
function quickEmailAccount(idx) {
  const a = accounts[idx];
  if (!a) return;
  const buyer = a.buyer || null;
  const to = (buyer?.Email) || a.Email || '';
  const buyerFirstName = buyer ? (buyer.First_Name || (buyer._fullName || '').split(/\s+/)[0]) : '';
  document.getElementById('email-to').value = to;
  document.getElementById('email-name').value = buyerFirstName || '';
  document.getElementById('email-company').value = a.Account_Name || '';
  showTab('compose');
  if (!to) {
    toast(buyer ? 'Buyer has no email on file' : 'No email on this account', 'info');
  }
}

// ─── Text shortcut (Lead or Account) ──────────────────────────────────────────
// Routes to the SMS panel and opens an existing thread when one exists, else
// drops into the New Text modal pre-filled with the contact's number + name.
// Both renderers (renderLeads / renderAccounts) call this with the index +
// kind so we can grab the right record + display name without prop-drilling.
function quickText(idx, kind) {
  const rec = kind === 'account' ? accounts[idx] : leads[idx];
  if (!rec) return;
  const phone = rec.Mobile || rec.Phone || '';
  const name = kind === 'account' ? (rec.Account_Name || '') : (rec._fullName || '');
  const e164 = normalizePhoneE164(phone);

  showTab('sms');

  // Defer one tick so the SMS tab DOM is visible before we ask SMS to render
  // a conversation pane (otherwise the threads list flashes first).
  setTimeout(() => {
    if (!window.SMS) return;
    if (e164) {
      window.SMS.openConversation(e164);
    } else {
      // No usable number on record — open the New Text modal so the rep can
      // type one in. Pre-fill name so the saved Note ties back to the contact.
      window.SMS.openNew && window.SMS.openNew();
      const nameEl = document.getElementById('sms-new-name');
      if (nameEl && name) nameEl.value = name;
    }
  }, 60);
}

// Browser mirror of the server-side E.164 normalizer (also lives in sms.js).
// Duplicated here so quickText() works even if SMS hasn't booted yet.
function normalizePhoneE164(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^\+[1-9]\d{1,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Pretty-print an E.164 (or any 10/11-digit phone) for display in cards.
// Falls back to the raw value when the input doesn't look like a US number.
function prettyPhone(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/[^\d]/g, '');
  if (d.length === 11 && d.startsWith('1')) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return String(raw);
}

// ─── Reusable Contact Card (Lead + Account) ───────────────────────────────────
// One template renders both Lead and Account rows so the action bar
// (Call / Text / Email / Brief) is visually identical and any new action
// only needs to be added in one place. Cards are vertically structured:
//
//   ┌───────────────────────────────────────────────┐
//   │ avatar   Name                       [status]  │ ← header
//   │          Subtitle (company or industry)       │
//   ├───────────────────────────────────────────────┤
//   │ <i> phone     <i> email     <i> location      │ ← meta strip
//   ├───────────────────────────────────────────────┤
//   │ [Call]  [Text]  [Email]  [Brief]              │ ← action bar
//   └───────────────────────────────────────────────┘
//
// This gives every channel its own visual weight — no more "email is the
// big button and call is buried in a tel: link" — and gives reps a single
// glance to find every action they can take from this card.
function contactCardHtml(opts) {
  const {
    idx,
    kind,                 // 'lead' | 'account'
    name,
    subtitle,
    status,               // for leads: hot|warm|cold (renders badge)
    location,             // for accounts: "City, ST"
    phone,
    email,
    onOpen,               // optional outer click handler (e.g. open brief)
    emailHandler,
    textHandler,
    briefHandler,
    extraRow,             // optional HTML to render between meta + actions
                          // (used by Account cards to show the Buyer pill)
    headerExtra,          // optional HTML rendered to the right of the
                          // status badge in the header (e.g. "Change buyer" link)
    extraAction,          // optional extra pill button rendered inside the
                          // actions row after Brief. Used by Account cards for
                          // the "Flag for Pete" follow-up toggle so Sky can
                          // hand off an account to Pete's /new-business queue
                          // without leaving Sales Floor.
    zohoModule,           // 'Leads' | 'Contacts' — which Zoho module backs
                          // this card. Enables the inline "+ Add phone" /
                          // "+ Add email" pills when the field is missing.
    zohoId,               // Zoho record id for the module above (lead id for
                          // Leads cards, buyer contact id for Account cards).
  } = opts;

  const display = name || '—';
  const safeName = escapeHtml(display);
  const safeSub = escapeHtml(subtitle || '');
  const phonePretty = phone ? prettyPhone(phone) : '';
  const phoneE164 = phone ? (normalizePhoneE164(phone) || phone) : '';
  const ico = kind === 'account'
    ? '<i class="fa-solid fa-building"></i>'
    : initials(display);

  const headerOpen = onOpen
    ? `<div class="hs-contact-card" data-idx="${idx}" onclick="${onOpen}">`
    : `<div class="hs-contact-card" data-idx="${idx}">`;

  const statusBadge = status
    ? `<span class="badge badge-${status}">${status}</span>`
    : '';

  const metaCells = [];
  if (phoneE164) {
    metaCells.push(`
      <a class="hs-contact-meta-cell" href="tel:${escapeAttr(phoneE164)}" onclick="event.stopPropagation();" title="Call ${escapeAttr(phonePretty)}">
        <i class="fa-solid fa-phone"></i>
        <span>${escapeHtml(phonePretty)}</span>
      </a>`);
  }
  if (email) {
    metaCells.push(`
      <span class="hs-contact-meta-cell" title="${escapeAttr(email)}">
        <i class="fa-solid fa-envelope"></i>
        <span class="hs-contact-meta-truncate">${escapeHtml(email)}</span>
      </span>`);
  }
  if (location) {
    metaCells.push(`
      <span class="hs-contact-meta-cell" title="${escapeAttr(location)}">
        <i class="fa-solid fa-location-dot"></i>
        <span>${escapeHtml(location)}</span>
      </span>`);
  }

  // ── Action bar — Call · Text · Email · Brief.
  // Layout stays 4-up across every card (no "this card has 3 buttons, that
  // card has 2" jitter). When a channel is empty AND we have a Zoho id to
  // write back to, the disabled button is replaced with an "+ Add phone" /
  // "+ Add email" pill that opens the inline add-field sheet. Accounts
  // without a buyer can't add data here — the buyer picker handles that
  // flow first. Leads always have a Zoho id (they ARE the Zoho record).
  const canAdd = !!(zohoModule && zohoId);
  const safeNameAttr = escapeAttr(display);
  const addPhoneCall = canAdd
    ? `openAddField(${JSON.stringify(zohoModule)}, ${JSON.stringify(zohoId)}, 'phone', ${JSON.stringify(display)}, ${idx}, ${JSON.stringify(kind)})`
    : '';
  const addEmailCall = canAdd
    ? `openAddField(${JSON.stringify(zohoModule)}, ${JSON.stringify(zohoId)}, 'email', ${JSON.stringify(display)}, ${idx}, ${JSON.stringify(kind)})`
    : '';

  const callBtn = phoneE164
    ? `<a class="hs-action-pill is-call" href="tel:${escapeAttr(phoneE164)}" onclick="event.stopPropagation(); ${kind === 'lead' ? `callLead(leads[${idx}]);` : ''}" title="Call">
         <i class="fa-solid fa-phone"></i><span>Call</span>
       </a>`
    : (canAdd
        ? `<button class="hs-action-pill is-call is-add" onclick="event.stopPropagation(); ${addPhoneCall}" title="Add a phone number for ${safeNameAttr}">
             <i class="fa-solid fa-plus"></i><span>Add phone</span>
           </button>`
        : `<button class="hs-action-pill is-call is-disabled" disabled title="No phone on record">
             <i class="fa-solid fa-phone"></i><span>Call</span>
           </button>`);

  const textBtn = phoneE164
    ? `<button class="hs-action-pill is-text" onclick="event.stopPropagation(); ${textHandler}" title="Send text">
         <i class="fa-solid fa-comment-sms"></i><span>Text</span>
       </button>`
    : (canAdd
        ? `<button class="hs-action-pill is-text is-add" onclick="event.stopPropagation(); ${addPhoneCall}" title="Add a phone number for ${safeNameAttr}">
             <i class="fa-solid fa-plus"></i><span>Add phone</span>
           </button>`
        : `<button class="hs-action-pill is-text is-disabled" disabled title="No mobile number on record">
             <i class="fa-solid fa-comment-sms"></i><span>Text</span>
           </button>`);

  const emailBtn = email
    ? `<button class="hs-action-pill is-email" onclick="event.stopPropagation(); ${emailHandler}" title="Send email">
         <i class="fa-solid fa-envelope"></i><span>Email</span>
       </button>`
    : (canAdd
        ? `<button class="hs-action-pill is-email is-add" onclick="event.stopPropagation(); ${addEmailCall}" title="Add an email for ${safeNameAttr}">
             <i class="fa-solid fa-plus"></i><span>Add email</span>
           </button>`
        : `<button class="hs-action-pill is-email is-disabled" disabled title="No email on record">
             <i class="fa-solid fa-envelope"></i><span>Email</span>
           </button>`);

  const briefBtn = briefHandler
    ? `<button class="hs-action-pill is-brief" onclick="event.stopPropagation(); ${briefHandler}" title="AI Brief">
         <i class="fa-solid fa-brain"></i><span>Brief</span>
       </button>`
    : '';

  return `
    ${headerOpen}
      <div class="hs-contact-header">
        <div class="hs-contact-avatar ${kind === 'account' ? 'is-account' : ''}">${ico}</div>
        <div class="hs-contact-identity">
          <div class="hs-contact-name">${safeName}</div>
          ${safeSub ? `<div class="hs-contact-sub">${safeSub}</div>` : ''}
        </div>
        ${statusBadge}
        ${headerExtra || ''}
      </div>
      ${metaCells.length ? `<div class="hs-contact-meta">${metaCells.join('')}</div>` : ''}
      ${extraRow || ''}
      <div class="hs-contact-actions">
        ${callBtn}
        ${textBtn}
        ${emailBtn}
        ${briefBtn}
        ${extraAction || ''}
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

// ─── Connection Status ────────────────────────────────────────────────────────
// The legacy client-side "Connect Services" modal has been retired. Zoho +
// Gmail OAuth both live server-side (Oxygen env vars), so from the browser's
// perspective the dashboard is always "connected" — we just reflect the
// live sync state (Connected / Syncing / Offline / Demo) in the status pills.
function updateConnectionStatus(state = 'connected') {
  // state ∈ 'connected' | 'syncing' | 'offline' | 'demo'
  const copy = {
    connected: 'Connected',
    syncing: 'Syncing…',
    offline: 'Offline',
    demo: 'Demo mode',
  };
  const label = copy[state] || copy.connected;
  const dotClass = state === 'connected' ? 'hs-status-dot connected' : 'hs-status-dot';

  // Update both the desktop top-bar pill and the mobile pagehead chip.
  ['status-dot', 'status-dot-m'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.className = dotClass;
  });
  ['status-text', 'status-text-m'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'success', durationMs = 3500) {
  const el = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent = msg;
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  icon.className = `fa-solid ${icons[type] || icons.success}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), durationMs);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val) {
  const n = parseFloat(val) || 0;
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

// ─── Issues Tab ───────────────────────────────────────────────────────────────
let _issueFilter = 'all';

function populateIssueAccountDropdown() {
  const sel = document.getElementById('issue-account');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select account —</option>' +
    accounts.map(a =>
      `<option value="${a.Id || a.Account_Name}"${(a.Id || a.Account_Name) === current ? ' selected' : ''}>${a.Account_Name}</option>`
    ).join('');
}

function initIssuesTab() {
  populateIssueAccountDropdown();
  const dateEl = document.getElementById('issue-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
  const repEl = document.getElementById('issue-reporter');
  if (repEl) repEl.value = CONFIG.salesperson.name || 'Sales Rep';
  renderIssueLog();
}

function submitIssue() {
  const accountSel  = document.getElementById('issue-account');
  const accountId   = accountSel.value;
  const accountName = accountSel.options[accountSel.selectedIndex]?.text || '';
  const contactName = document.getElementById('issue-contact').value.trim();
  const type        = document.getElementById('issue-type').value;
  const severity    = document.getElementById('issue-severity').value;
  const description = document.getElementById('issue-description').value.trim();
  const date        = document.getElementById('issue-date').value;
  const reporter    = document.getElementById('issue-reporter').value;

  if (!accountId || !type || !description) {
    toast('Please fill in Account, Issue Type, and Description', 'error');
    return;
  }

  const issue = Issues.create({ accountId, accountName, contactName, type, severity, description, date, reporter });

  // Flag in Zoho CRM (best-effort, no user-facing error)
  Issues.flagInZoho(issue);

  // Reset fields but keep date & reporter
  accountSel.value = '';
  document.getElementById('issue-contact').value     = '';
  document.getElementById('issue-type').value        = '';
  document.getElementById('issue-severity').value    = 'Medium';
  document.getElementById('issue-description').value = '';

  const escalateMsg = issue.escalated ? ` — escalated to Exec Team` : '';
  toast(`Issue logged and escalated (${issue.ticketId})${escalateMsg}`, 'success');

  renderIssueLog();
  updateIssueBadge();
}

function resolveIssue(ticketId) {
  Issues.resolve(ticketId);
  renderIssueLog();
  updateIssueBadge();
  toast(`${ticketId} marked as resolved`, 'success');
}

function filterIssues(filter) {
  _issueFilter = filter;
  document.querySelectorAll('.hs-filter-btn').forEach(b => {
    if (b.id && b.id.startsWith('ifilter-')) b.classList.remove('active');
  });
  document.getElementById(`ifilter-${filter}`)?.classList.add('active');
  renderIssueLog();
}

function renderIssueLog() {
  const all = Issues.getAll();

  let list = all;
  if (_issueFilter === 'open')     list = all.filter(i => i.status !== 'Resolved');
  if (_issueFilter === 'resolved') list = all.filter(i => i.status === 'Resolved');

  const so = Issues.SEVERITY_ORDER;
  const open = list
    .filter(i => i.status !== 'Resolved')
    .sort((a, b) => so[a.severity] - so[b.severity] || new Date(b.timestamp) - new Date(a.timestamp));
  const resolved = list
    .filter(i => i.status === 'Resolved')
    .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
  const sorted = [...open, ...resolved];

  // Update counts chip
  const countsEl = document.getElementById('issue-log-counts');
  if (countsEl) {
    const c = Issues.counts();
    countsEl.textContent = c.open > 0 ? `${c.open} open` : 'all clear';
  }

  const el = document.getElementById('issue-log');
  if (!el) return;

  if (sorted.length === 0) {
    el.innerHTML = `<div class="hs-empty-state">No issues match this filter.</div>`;
    return;
  }

  el.innerHTML = sorted.map(issue => {
    const sev        = issue.severity.toLowerCase();
    const isResolved = issue.status === 'Resolved';
    const rowMod     = isResolved ? 'issue-row--resolved' : `issue-row--${sev}`;
    const sevMod     = `issue-sev--${sev}`;
    const statusMod  = isResolved ? 'issue-status--resolved' : 'issue-status--open';
    const statusText = issue.status;

    return `
    <div class="issue-row ${rowMod}">
      <div class="issue-col-ticket">${issue.ticketId}</div>
      <div style="flex:1;min-width:0;">
        <div class="issue-account-name">${issue.accountName || '—'}</div>
        ${issue.contactName ? `<div class="issue-contact-name">${issue.contactName}</div>` : ''}
      </div>
      <div class="issue-col-type">${issue.type}</div>
      <div class="issue-col-badge">
        <span class="issue-sev-badge ${sevMod}">${issue.severity}</span>
      </div>
      <div class="issue-col-badge">
        <span class="issue-status-badge ${statusMod}">${statusText}</span>
      </div>
      <div class="issue-col-date">${formatDate(issue.date) || issue.date}</div>
      <div class="issue-col-action">
        ${!isResolved
          ? `<button onclick="resolveIssue('${issue.ticketId}')" class="lead-action-btn">
               <i class="fa-solid fa-check mr-1"></i>Resolve
             </button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

function updateIssueBadge() {
  const badge = document.getElementById('issues-nav-badge');
  if (!badge) return;
  const { open } = Issues.counts();
  if (open > 0) {
    badge.textContent = open;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ─── Demo alerts — edit these or add new ones until live data feed is connected ──
// Call Alerts.add({...}) anywhere, or add entries here at startup.
function loadDemoAlerts() {

  // ACCOUNT LOSS — always renders first, pulsing critical border
  Alerts.add({
    type: Alerts.TYPE.ACCOUNT_LOSS,
    accountName: 'Pacific Northwest Supply',
    accountId: 'acct-002',
    productName: 'Highsman Reserve 12-Pack',
    dateRemoved: new Date('2026-04-15'),
    monthlyValue: 8400,
    totalAtRisk: 100800,
  });

  // OUT OF STOCK
  Alerts.add({
    type: Alerts.TYPE.OUT_OF_STOCK,
    accountName: 'Meridian Group',
    accountId: 'acct-001',
    productName: 'Highsman Classic 6-Pack',
    outOfStockSince: new Date('2026-04-17'),
    dailyRevenueLoss: 320,
  });

  Alerts.add({
    type: Alerts.TYPE.OUT_OF_STOCK,
    accountName: 'Lakefront Hospitality',
    accountId: 'acct-004',
    productName: 'Highsman Seasonal Variety Pack',
    outOfStockSince: new Date('2026-04-19'),
    dailyRevenueLoss: 185,
  });

  // REORDER DUE
  Alerts.add({
    type: Alerts.TYPE.REORDER_DUE,
    accountName: 'Coastal Builders Inc.',
    accountId: 'acct-005',
    lastOrderDate: new Date('2026-03-15'),
    avgOrderCycleDays: 28,
    daysOverdue: 8,
  });

  Alerts.add({
    type: Alerts.TYPE.REORDER_DUE,
    accountName: 'NovaTech Solutions',
    accountId: 'acct-003',
    lastOrderDate: new Date('2026-03-22'),
    avgOrderCycleDays: 21,
    daysOverdue: 5,
  });
}

// ─── Demo data (remove when real CRM connected) ───────────────────────────────
function loadDemoData() {
  leads = [
    { _fullName: 'Sarah Johnson', First_Name: 'Sarah', Last_Name: 'Johnson', Company: 'Apex Retail Co.', Email: 'sarah@apexretail.com', Phone: '555-0101', _status: 'hot', Lead_Source: 'Cold Call', Description: 'Interested in bulk pricing. Asked for proposal by end of week.' },
    { _fullName: 'Marcus Williams', First_Name: 'Marcus', Last_Name: 'Williams', Company: 'Blue Ridge Logistics', Email: 'mwilliams@blueridge.com', Phone: '555-0188', _status: 'hot', Lead_Source: 'Referral', Description: 'Referred by existing client. High urgency — needs solution Q1.' },
    { _fullName: 'Jen Park', First_Name: 'Jen', Last_Name: 'Park', Company: 'Sunrise Foods', Email: 'jen@sunrisefoods.com', Phone: '555-0234', _status: 'warm', Lead_Source: 'Web Form', Description: 'Downloaded whitepaper. Opened email twice.' },
    { _fullName: 'Tom Rivera', First_Name: 'Tom', Last_Name: 'Rivera', Company: 'Coastal Builders Inc.', Email: 'trivera@coastalbuilders.com', Phone: '555-0312', _status: 'warm', Lead_Source: 'Trade Show', Description: 'Met at conference. Follow up in 2 weeks.' },
    { _fullName: 'Aisha Okonkwo', First_Name: 'Aisha', Last_Name: 'Okonkwo', Company: 'NovaTech Solutions', Email: 'aisha@novatech.io', Phone: '555-0445', _status: 'new', Lead_Source: 'LinkedIn', Description: '' },
    { _fullName: 'Derek Chow', First_Name: 'Derek', Last_Name: 'Chow', Company: 'Chow & Associates', Email: 'derek@chowassoc.com', Phone: '555-0501', _status: 'new', Lead_Source: 'Google Ads', Description: '' },
  ];

  deals = [
    { Deal_Name: 'Apex Retail — Initial Order', Account_Name: 'Apex Retail Co.', Stage: 'Proposal/Price Quote', Amount: 45000, Closing_Date: '2026-05-15' },
    { Deal_Name: 'Blue Ridge Q1 Contract', Account_Name: 'Blue Ridge Logistics', Stage: 'Needs Analysis', Amount: 120000, Closing_Date: '2026-04-30' },
    { Deal_Name: 'Sunrise Foods Trial', Account_Name: 'Sunrise Foods', Stage: 'Qualification', Amount: 18000, Closing_Date: '2026-06-01' },
    { Deal_Name: 'NovaTech Pilot', Account_Name: 'NovaTech Solutions', Stage: 'Closed Won', Amount: 32000, Closing_Date: '2026-04-10' },
  ];

  accounts = [
    { Id: 'acct-001', Account_Name: 'Meridian Group',            Industry: 'Manufacturing', Billing_City: 'Atlanta',  Billing_State: 'GA', Phone: '555-1001' },
    { Id: 'acct-002', Account_Name: 'Pacific Northwest Supply',  Industry: 'Distribution',  Billing_City: 'Portland', Billing_State: 'OR', Phone: '555-1045' },
    { Id: 'acct-003', Account_Name: 'NovaTech Solutions',        Industry: 'Technology',    Billing_City: 'Austin',   Billing_State: 'TX', Phone: '555-1100' },
    { Id: 'acct-004', Account_Name: 'Lakefront Hospitality',     Industry: 'Hospitality',   Billing_City: 'Chicago',  Billing_State: 'IL', Phone: '555-1222' },
    { Id: 'acct-005', Account_Name: 'Coastal Builders Inc.',     Industry: 'Construction',  Billing_City: 'Seattle',  Billing_State: 'WA', Phone: '555-1350' },
    { Id: 'acct-006', Account_Name: 'Apex Retail Co.',           Industry: 'Retail',        Billing_City: 'Denver',   Billing_State: 'CO', Phone: '555-1400' },
  ];

  loadDemoAlerts();
  renderAll();
}

// ─── Quo (phone system) ───────────────────────────────────────────────────────
// Owns the Recent Calls panel + Calls Today stat. Fetches from
// /api/sales-floor-quo-recent — server-side route that holds the API key and
// caches the Quo response for 30s at the edge.
//
// Auto-refresh cadence is 45s (slightly longer than the server cache to
// avoid hammering). Also refetched on tab focus so "I just hung up" appears
// without a manual refresh.
const Quo = (() => {
  const ENDPOINT = '/api/sales-floor-quo-recent';
  const REFRESH_MS = 45 * 1000;

  async function load() {
    try {
      const res = await fetch(ENDPOINT, {credentials: 'same-origin'});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      quoConfigured = !!data.configured;
      recentCalls = Array.isArray(data.calls) ? data.calls : [];
      quoTodayCalls = typeof data.todayCount === 'number' ? data.todayCount : null;

      renderStatusPill(data.ok ? 'live' : 'error', data.error);
      render();
      updateStats();
      return data;
    } catch (err) {
      console.warn('[quo] load failed:', err.message);
      quoConfigured = false;
      renderStatusPill('error', err.message);
      render();
      return null;
    }
  }

  function render() {
    const el = document.getElementById('recent-calls-list');
    if (!el) return;

    if (!quoConfigured) {
      el.innerHTML = `
        <div class="hs-empty-state py-8">
          <div class="hs-empty-state-icon"><i class="fa-solid fa-phone"></i></div>
          Quo isn't connected on this deploy yet.
        </div>`;
      return;
    }
    if (!recentCalls.length) {
      el.innerHTML = `
        <div class="hs-empty-state py-8">
          <div class="hs-empty-state-icon"><i class="fa-solid fa-phone"></i></div>
          No calls yet today — get on the phones.
        </div>`;
      return;
    }
    el.innerHTML = recentCalls.map(rowHtml).join('');
  }

  function rowHtml(c) {
    const iconClass = c.direction === 'incoming'
      ? (c.rawStatus === 'missed' || c.rawStatus === 'no-answer' ? 'is-missed' : 'is-incoming')
      : 'is-outgoing';
    const iconGlyph = c.direction === 'incoming'
      ? (c.rawStatus === 'missed' || c.rawStatus === 'no-answer' ? 'fa-phone-slash' : 'fa-arrow-down-long')
      : 'fa-arrow-up-long';

    const name = c.contactName || c.otherPartyPretty || 'Unknown';
    const phoneHtml = c.otherParty
      ? `<a href="tel:${escapeAttr(c.otherParty)}" class="hs-tel-link" onclick="event.stopPropagation();">${escapeHtml(c.otherPartyPretty || c.otherParty)}</a>`
      : '—';

    const summaryBlock = c.summary
      ? `<div class="hs-call-summary"><span class="hs-call-summary-label">AI Summary</span>${escapeHtml(c.summary)}</div>`
      : '';

    const recordBtn = c.recordingUrl
      ? `<a class="hs-call-action" href="${escapeAttr(c.recordingUrl)}" target="_blank" rel="noopener" title="Play recording"><i class="fa-solid fa-play"></i></a>`
      : '';

    return `
      <div class="hs-call-row">
        <div class="hs-call-icon ${iconClass}"><i class="fa-solid ${iconGlyph}"></i></div>
        <div class="hs-call-main">
          <div class="hs-call-name">${escapeHtml(name)}</div>
          <div class="hs-call-meta">
            ${phoneHtml}
            <span class="hs-call-time">${relativeTime(c.createdAt)} · ${escapeHtml(c.status)}${c.duration ? ' · ' + escapeHtml(c.durationLabel) : ''}</span>
          </div>
          ${summaryBlock}
        </div>
        <div class="hs-call-actions">
          ${c.otherParty ? `<a class="hs-call-action" href="tel:${escapeAttr(c.otherParty)}" title="Call back"><i class="fa-solid fa-phone"></i></a>` : ''}
          ${recordBtn}
        </div>
      </div>`;
  }

  function renderStatusPill(state, errMsg) {
    const pill = document.getElementById('quo-status-pill');
    if (!pill) return;
    pill.classList.remove('hidden', 'is-live', 'is-error');
    const label = pill.querySelector('.hs-panel-pill-label');

    if (state === 'live') {
      pill.classList.add('is-live');
      if (label) label.textContent = 'Quo live';
    } else if (state === 'error') {
      pill.classList.add('is-error');
      if (label) label.textContent = errMsg ? 'Quo offline' : 'Quo unavailable';
      pill.title = errMsg || '';
    } else {
      if (label) label.textContent = 'Quo';
    }
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const diff = Date.now() - then;
    if (diff < 60_000) return 'just now';
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'yesterday';
    return `${d}d ago`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

  function start() {
    load();
    if (recentCallsRefreshTimer) clearInterval(recentCallsRefreshTimer);
    recentCallsRefreshTimer = setInterval(load, REFRESH_MS);
    // Refetch when the tab regains focus so reps see fresh data after a call.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });
  }

  return {load, render, start};
})();

// Exposed so the Refresh button in the panel header can call it inline.
function refreshRecentCalls() {
  const btn = event?.currentTarget;
  const icon = btn?.querySelector('i');
  icon?.classList.add('fa-spin');
  Quo.load().finally(() => icon?.classList.remove('fa-spin'));
}
window.refreshRecentCalls = refreshRecentCalls;

// Kick off after DOM is ready. Done here at the bottom so the Quo IIFE is
// defined before start() references it. Safe to call even if the user is
// on the /sales-floor _index (login) page — start() no-ops when the panel
// isn't present.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Quo.start());
} else {
  Quo.start();
}


// ─────────────────────────────────────────────────────────────────────────────
// Inline Add-Field (phone / email) — mid-call quick capture
// ─────────────────────────────────────────────────────────────────────────────
// When a rep gets a phone number or email while talking to a shop, they tap
// the "+ Add phone" or "+ Add email" pill on the card. A bottom sheet slides
// up; they type → tap Save → we PUT to Zoho via /api/sales-floor-contact-update
// and refresh the card in place. Total interaction under 5 seconds — they
// never leave the Floor PWA.
//
// For everything else (role, account linkage, notes, etc.) the Brief drawer
// carries an "Open in Zoho" button that deep-links to the full record on
// crm.zoho.com (the mobile CRM app catches this URL if installed).

const _addField = {
  module: null,    // 'Leads' | 'Contacts'
  recordId: null,
  kind: null,      // 'phone' | 'email'
  cardKind: null,  // 'lead' | 'account' — which list to refresh after save
  cardIdx: null,   // index in that list, so we can scroll the row back into view
};

function openAddField(module, recordId, kind, recordName, cardIdx, cardKind) {
  if (!module || !recordId) return;
  _addField.module = module;
  _addField.recordId = recordId;
  _addField.kind = kind;
  _addField.cardKind = cardKind;
  _addField.cardIdx = cardIdx;

  const eyebrow = document.getElementById('hs-addfield-eyebrow');
  const title = document.getElementById('hs-addfield-title');
  const sub = document.getElementById('hs-addfield-sub');
  const label = document.getElementById('hs-addfield-label');
  const input = document.getElementById('hs-addfield-input');
  const err = document.getElementById('hs-addfield-error');
  if (!input) return;

  if (kind === 'email') {
    eyebrow.textContent = 'Add email';
    label.textContent = 'Email address';
    input.type = 'email';
    input.inputMode = 'email';
    input.placeholder = 'buyer@shop.com';
  } else {
    eyebrow.textContent = 'Add phone';
    label.textContent = 'Phone number';
    input.type = 'tel';
    input.inputMode = 'tel';
    input.placeholder = '(555) 123-4567';
  }
  title.textContent = recordName || '—';
  sub.textContent = 'Saved to Zoho the moment you tap Save.';
  input.value = '';
  err.textContent = '';
  err.classList.add('hidden');

  const sheet = document.getElementById('hs-addfield-sheet');
  sheet.classList.remove('hidden');
  // Let the backdrop render before focusing so iOS actually raises the keyboard.
  setTimeout(() => input.focus(), 120);
}

function closeAddField() {
  document.getElementById('hs-addfield-sheet')?.classList.add('hidden');
  _addField.module = null;
  _addField.recordId = null;
  _addField.kind = null;
  _addField.cardKind = null;
  _addField.cardIdx = null;
}

async function submitAddField() {
  const input = document.getElementById('hs-addfield-input');
  const err = document.getElementById('hs-addfield-error');
  const saveBtn = document.getElementById('hs-addfield-save');
  const val = (input?.value || '').trim();
  if (!val) {
    err.textContent = 'Enter a value before saving.';
    err.classList.remove('hidden');
    return;
  }

  // Client-side sanity — the server validates again, but this keeps bad
  // input from round-tripping when the rep's thumb hits Save too fast.
  if (_addField.kind === 'email') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
      err.textContent = 'That doesn\u2019t look like an email address.';
      err.classList.remove('hidden');
      return;
    }
  } else {
    const digits = val.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      err.textContent = 'That phone number looks off. Use 10 digits for US.';
      err.classList.remove('hidden');
      return;
    }
  }
  err.classList.add('hidden');

  // Build the patch. Phone adds write to BOTH Phone and Mobile on Leads so
  // the Call AND Text channels both light up on the card afterwards. On
  // Contacts Zoho distinguishes them — we still write both to max out what
  // the rep can do from the floor without a second trip through the sheet.
  const patch = {};
  if (_addField.kind === 'email') {
    patch.Email = val;
  } else {
    patch.Phone = val;
    patch.Mobile = val;
  }

  saveBtn.disabled = true;
  saveBtn.classList.add('is-saving');
  try {
    const res = await fetch('/api/sales-floor-contact-update', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        module: _addField.module,
        recordId: _addField.recordId,
        patch,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Save failed (${res.status})`);
    }

    // Reflect the new value locally so the card flips from "Add phone" to a
    // working Call/Text/Email pill without waiting on the next full sync.
    const stored = data.patch || patch;
    applyContactPatchLocally(_addField.module, _addField.recordId, stored);

    // Re-render the list the card belongs to so the new state shows up.
    if (_addField.cardKind === 'lead') {
      if (typeof renderLeads === 'function') renderLeads();
    } else if (_addField.cardKind === 'account') {
      if (typeof renderAccounts === 'function') renderAccounts();
    }

    toast(
      _addField.kind === 'email' ? 'Email saved to Zoho' : 'Phone saved to Zoho',
      'check',
    );
    closeAddField();
  } catch (e) {
    err.textContent = e.message || 'Save failed. Try again.';
    err.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
    saveBtn.classList.remove('is-saving');
  }
}

// Mutate the in-memory record so the UI reflects the new value before the
// next /api/sales-floor-sync comes around. Covers Leads and the buyer
// contact inside an Account.
function applyContactPatchLocally(mod, recordId, patch) {
  if (mod === 'Leads') {
    const l = Array.isArray(leads) ? leads.find((x) => x.id === recordId) : null;
    if (l) {
      if (patch.Phone) l.Phone = patch.Phone;
      if (patch.Mobile) l.Mobile = patch.Mobile;
      if (patch.Email) l.Email = patch.Email;
    }
    return;
  }
  if (mod === 'Contacts' && Array.isArray(accounts)) {
    for (const a of accounts) {
      const c = a?.buyer?.id === recordId
        ? a.buyer
        : (Array.isArray(a?.contacts) ? a.contacts.find((x) => x.id === recordId) : null);
      if (c) {
        if (patch.Phone) c.Phone = patch.Phone;
        if (patch.Mobile) c.Mobile = patch.Mobile;
        if (patch.Email) c.Email = patch.Email;
      }
    }
  }
}

window.openAddField = openAddField;
window.closeAddField = closeAddField;
window.submitAddField = submitAddField;


// ─────────────────────────────────────────────────────────────────────────────
// Brief drawer → Open in Zoho deep-link
// ─────────────────────────────────────────────────────────────────────────────
// Anything that isn't phone / email (role changes, linking an account,
// long-form notes) is low-frequency and lives better in Zoho's own UI.
// This button deep-links the currentBriefLead into crm.zoho.com — on iOS
// and Android that URL auto-opens the Zoho CRM app if installed, otherwise
// falls back to the mobile web CRM.

function openCurrentBriefInZoho() {
  const lead = (typeof currentBriefLead !== 'undefined' && currentBriefLead) || null;
  if (!lead) return;
  let url = null;
  // Lead card → Leads module.
  if (lead._zohoModule && lead._zohoId) {
    url = `https://crm.zoho.com/crm/tab/${lead._zohoModule}/${lead._zohoId}`;
  } else if (lead.id) {
    // Fallback for historical callers that only stashed an id.
    url = `https://crm.zoho.com/crm/tab/Leads/${lead.id}`;
  }
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}
window.openCurrentBriefInZoho = openCurrentBriefInZoho;
