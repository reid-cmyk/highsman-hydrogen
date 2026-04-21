// Main application logic

// ─── State ────────────────────────────────────────────────────────────────────
let leads = [];
let accounts = [];
let deals = [];
let currentFilter = 'all';
let currentBriefLead = null;
let callsToday = 0;

const PIPELINE_STAGES = [
  { key: 'Qualification',    label: 'Qualification',    color: '#6366f1' },
  { key: 'Needs Analysis',   label: 'Needs Analysis',   color: '#8b5cf6' },
  { key: 'Value Proposition',label: 'Proposal',         color: '#f59e0b' },
  { key: 'Proposal/Price Quote', label: 'Proposal',     color: '#f59e0b' },
  { key: 'Id. Decision Makers', label: 'Decision',      color: '#ec4899' },
  { key: 'Perception Analysis', label: 'Negotiating',   color: '#ef4444' },
  { key: 'Closed Won',       label: 'Won',              color: '#10b981' },
  { key: 'Closed Lost',      label: 'Lost',             color: '#94a3b8' },
];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateGreeting();
  updateConnectionStatus();
  Issues.init();
  updateIssueBadge();

  // Auto-sync from Zoho on page load. If the CRM isn't configured or returns
  // empty, fall back to demo data so the dashboard is never blank.
  bootstrapCRM();
});

async function bootstrapCRM() {
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.textContent = 'Connecting to Zoho…';
  try {
    const snapshot = await Zoho.syncAll();
    const hasAny = snapshot.leads.length + snapshot.deals.length + snapshot.accounts.length > 0;

    if (snapshot.connected && hasAny) {
      leads = snapshot.leads;
      deals = snapshot.deals;
      accounts = snapshot.accounts;
      loadDemoAlerts(); // keep the alert panel populated until real alert logic lands
      renderAll();
      updateConnectionStatus(true);
      if (statusEl) statusEl.textContent = `Synced ${new Date().toLocaleTimeString()}`;
      return;
    }

    // Configured but returned nothing, OR not configured at all → demo mode.
    console.warn('[sales-floor] CRM returned no data — falling back to demo.', snapshot);
    loadDemoData();
    if (statusEl) {
      statusEl.textContent = snapshot.configured
        ? 'CRM empty — showing demo'
        : 'Demo mode';
    }
  } catch (err) {
    console.error('[sales-floor] CRM bootstrap failed:', err);
    loadDemoData();
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
    pipeline: ['Pipeline', 'Open opportunities'],
    accounts: ['Accounts', 'Account management'],
    compose: ['Email Templates', 'One-click personalized emails'],
    issues: ['Issue Reporting', 'Customer issue tracking'],
  };
  const [title] = titles[tab] || [''];
  document.getElementById('page-title').textContent = title;

  if (tab === 'issues') initIssuesTab();
}

// ─── CRM Sync ─────────────────────────────────────────────────────────────────
// The "Sync" button in the sidebar pulls fresh data from /api/sales-floor-sync.
// OAuth lives server-side — no connect modal needed for Zoho.
async function syncCRM() {
  const icon = document.getElementById('sync-icon');
  const statusEl = document.getElementById('sync-status');
  icon?.classList.add('animate-spin');
  if (statusEl) statusEl.textContent = 'Syncing…';
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
      updateConnectionStatus(true);
    } else if (!snapshot.configured) {
      if (statusEl) statusEl.textContent = 'CRM not configured';
      toast('Zoho not configured on this deploy', 'error');
    } else {
      if (statusEl) statusEl.textContent = 'No records returned';
      toast('Zoho returned no records', 'info');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Sync failed';
    toast(`Sync error: ${err.message}`, 'error');
  } finally {
    icon?.classList.remove('animate-spin');
  }
}

function renderAll() {
  renderLeads();
  renderPipeline();
  renderAccounts();
  renderDashboard();
  updateStats();
  populateIssueAccountDropdown();
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  const hot = leads.filter(l => l._status === 'hot').length;
  document.getElementById('stat-hot').textContent = hot;

  const pipelineValue = deals
    .filter(d => !['Closed Won','Closed Lost'].includes(d.Stage))
    .reduce((sum, d) => sum + (parseFloat(d.Amount) || 0), 0);
  document.getElementById('stat-pipeline').textContent = formatCurrency(pipelineValue);

  document.getElementById('stat-calls').textContent = callsToday;
  document.getElementById('stat-issues').textContent = Alerts.counts().total || '0';

  if (hot > 0) {
    const badge = document.getElementById('hot-badge');
    badge.textContent = hot;
    badge.classList.remove('hidden');
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
            <div class="dash-lead-company">${l.Company || '—'}${phone ? ` &middot; <span style="opacity:0.9;">${phone}</span>` : ''}</div>
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

  const pipelineEl = document.getElementById('dashboard-pipeline');
  if (deals.length === 0) {
    pipelineEl.innerHTML = `<div class="hs-empty-state">No pipeline data yet</div>`;
  } else {
    const byStage = {};
    deals.forEach(d => {
      if (!byStage[d.Stage]) byStage[d.Stage] = { count: 0, value: 0 };
      byStage[d.Stage].count++;
      byStage[d.Stage].value += parseFloat(d.Amount) || 0;
    });
    pipelineEl.innerHTML = Object.entries(byStage)
      .filter(([stage]) => !['Closed Lost'].includes(stage))
      .map(([stage, data]) => `
        <div class="pipeline-snap-row">
          <span class="pipeline-snap-stage">${stage}<span class="pipeline-snap-count" style="font-family:'Barlow Semi Condensed';font-size:0.75rem;color:#A9ACAF;margin-left:4px;">(${data.count})</span></span>
          <span class="pipeline-snap-value">${formatCurrency(data.value)}</span>
        </div>`).join('');
  }
}

// ─── Lead List ────────────────────────────────────────────────────────────────
function renderLeads(filter = currentFilter) {
  currentFilter = filter;
  let list = currentFilter === 'all' ? leads : leads.filter(l => l._status === currentFilter);
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
    return `
    <div class="lead-row" onclick="openBrief(${idx})">
      <div class="lead-avatar">${initials(l._fullName)}</div>
      <div class="lead-info">
        <div class="lead-name">${l._fullName || '—'}</div>
        <div class="lead-company">${l.Company || '—'}</div>
        <div class="lead-meta">${l.Email || ''}${l.Phone ? ' · ' + l.Phone : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <span class="badge badge-${l._status}">${l._status}</span>
        <div style="display:flex;gap:6px;">
          <button onclick="event.stopPropagation(); quickEmail(${idx})" class="lead-action-btn" title="Send email">
            <i class="fa-solid fa-envelope"></i>
          </button>
          <button onclick="event.stopPropagation(); openBrief(${idx})" class="lead-action-btn" title="AI Brief">
            <i class="fa-solid fa-brain"></i> Brief
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterLeads(status) {
  currentFilter = status;
  document.querySelectorAll('#tab-leads .hs-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`filter-${status}`)?.classList.add('active');
  renderLeads(status);
}

function searchLeads() { renderLeads(); }

// ─── Pipeline Board ───────────────────────────────────────────────────────────
function renderPipeline() {
  const board = document.getElementById('pipeline-board');
  if (deals.length === 0) {
    board.innerHTML = `<div class="hs-empty-state py-16 bg-brand-black w-full">Connect Zoho CRM to load your pipeline</div>`;
    return;
  }

  const stageOrder = PIPELINE_STAGES.map(s => s.key);
  const allStages = [...new Set([...stageOrder, ...deals.map(d => d.Stage)])];

  board.innerHTML = allStages.map(stage => {
    const stageDef = PIPELINE_STAGES.find(s => s.key === stage);
    const label = stageDef?.label || stage;
    const stageDeals = deals.filter(d => d.Stage === stage);
    const total = stageDeals.reduce((s, d) => s + (parseFloat(d.Amount) || 0), 0);

    if (stageDeals.length === 0 && !stageDef) return '';
    return `
      <div class="pipeline-column flex-shrink-0">
        <div class="pipeline-column-header">
          <span>${label}</span>
          <span class="col-value">${total > 0 ? formatCurrency(total) : stageDeals.length}</span>
        </div>
        <div class="pipeline-cards">
          ${stageDeals.map(d => `
            <div class="pipeline-card">
              <div class="pipeline-card-name">${d.Deal_Name || '—'}</div>
              <div class="pipeline-card-company">${d.Account_Name?.name || d.Account_Name || '—'}</div>
              ${d.Amount ? `<div class="pipeline-card-amount">${formatCurrency(d.Amount)}</div>` : ''}
              ${d.Closing_Date ? `<div class="pipeline-card-date">Closes ${formatDate(d.Closing_Date)}</div>` : ''}
            </div>`).join('')}
          ${stageDeals.length === 0 ? '<div style="font-family:\'Barlow Semi Condensed\';font-size:0.75rem;color:#A9ACAF;text-align:center;padding:16px 0;">No deals</div>' : ''}
        </div>
      </div>`;
  }).join('');
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
function renderAccounts() {
  let list = accounts;
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
  el.innerHTML = list.map(a => {
    const meta = [a.Industry, a.Billing_City, a.Billing_State].filter(Boolean).join(' · ');
    return `
    <div class="account-row">
      <div class="account-icon">
        <i class="fa-solid fa-building"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div class="lead-name">${a.Account_Name || '—'}</div>
        <div class="lead-company">${meta || '—'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${a.Phone ? `<a href="tel:${a.Phone}" class="lead-action-btn" title="Call"><i class="fa-solid fa-phone"></i> ${a.Phone}</a>` : ''}
        <button class="lead-action-btn" title="Email"><i class="fa-solid fa-envelope"></i> Email</button>
      </div>
    </div>`;
  }).join('');
}

function searchAccounts() { renderAccounts(); }

// ─── AI Brief Modal ───────────────────────────────────────────────────────────
async function openBrief(idx) {
  currentBriefLead = leads[idx];
  const lead = currentBriefLead;
  document.getElementById('brief-lead-name').textContent = `${lead._fullName} — ${lead.Company || ''}`;
  document.getElementById('brief-content').innerHTML = `
    <div class="hs-loading">
      <div class="hs-spinner"></div>
      <p style="font-family:'Barlow Semi Condensed',sans-serif;font-size:0.9rem;color:#A9ACAF;margin-top:12px;">Generating your brief...</p>
    </div>`;
  document.getElementById('brief-modal').classList.remove('hidden');

  try {
    const brief = await AIBrief.generate(lead);
    document.getElementById('brief-content').innerHTML = AIBrief.renderBrief(brief);
  } catch (err) {
    document.getElementById('brief-content').innerHTML = `<p style="font-family:'Barlow Semi Condensed',sans-serif;color:#DC2626;padding:16px;">Could not generate brief: ${err.message}</p>`;
  }
}

function closeBrief() {
  document.getElementById('brief-modal').classList.add('hidden');
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
  if (!Gmail.isConnected()) { toast('Connect Gmail first', 'error'); showConnectModal(); return; }
  try {
    await Gmail.send({ to, subject, body });
    toast(`Email sent to ${to}`, 'success');
  } catch (err) {
    toast(`Send failed: ${err.message}`, 'error');
  }
}

async function sendQuickEmail() {
  const templateKey = document.getElementById('quick-template').value;
  const to = document.getElementById('quick-to').value;
  const name = document.getElementById('quick-name').value;
  if (!templateKey || !to) { toast('Select a template and enter an email', 'error'); return; }
  if (!Gmail.isConnected()) { toast('Connect Gmail first', 'error'); showConnectModal(); return; }
  const filled = fillTemplate(templateKey, { name, sender: CONFIG.salesperson.name });
  try {
    await Gmail.send({ to, subject: filled.subject, body: filled.body });
    toast(`Email sent to ${to}`, 'success');
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

// ─── Connect Modal ────────────────────────────────────────────────────────────
function showConnectModal() { document.getElementById('connect-modal').classList.remove('hidden'); }
function closeConnectModal() { document.getElementById('connect-modal').classList.add('hidden'); }

async function initConnections() {
  closeConnectModal();
  toast('Opening Zoho CRM authorization…', 'info');
  Zoho.authorize();
}

function updateConnectionStatus(connected = false) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;
  if (connected || Zoho.isConnected()) {
    dot.className = 'hs-status-dot connected';
    text.textContent = 'Zoho connected';
  } else {
    dot.className = 'hs-status-dot';
    text.textContent = Zoho.isConfigured() ? 'Zoho idle' : 'Demo mode';
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent = msg;
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  icon.className = `fa-solid ${icons[type] || icons.success}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
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
