/**
 * HIGHSMAN — Inventory Alert System
 *
 * Three alert types, sorted by severity. Designed to be the foundation
 * of the larger Business Management Dashboard — keep data structures clean.
 *
 * To add an alert manually (until live data feed is connected):
 *   Alerts.add({ type: Alerts.TYPE.ACCOUNT_LOSS, accountName: '...', ... })
 *
 * Full field reference for each type is documented on each render function below.
 */

const Alerts = (() => {

  // ─── Constants ──────────────────────────────────────────────────────────────

  const TYPE = {
    ACCOUNT_LOSS: 'account_loss',  // Product pulled from retailer menu — CRITICAL
    OUT_OF_STOCK: 'out_of_stock',  // Product confirmed OOS at account
    REORDER_DUE:  'reorder_due',   // Account past their normal reorder window
  };

  // Lower number = higher severity = renders first
  const SORT_ORDER = { account_loss: 0, out_of_stock: 1, reorder_due: 2 };

  const META = {
    account_loss: {
      label: 'Account Loss',
      badgeClass: 'alert-type-badge--critical',
      cardClass: 'alert-card--critical',
      icon: 'fa-fire',
      color: '#991B1B',
    },
    out_of_stock: {
      label: 'Out of Stock',
      badgeClass: 'alert-type-badge--oos',
      cardClass: 'alert-card--oos',
      icon: 'fa-triangle-exclamation',
      color: '#EF4444',
    },
    reorder_due: {
      label: 'Reorder Due',
      badgeClass: 'alert-type-badge--reorder',
      cardClass: 'alert-card--reorder',
      icon: 'fa-cart-shopping',
      color: '#F97316',
    },
  };

  // ─── State ──────────────────────────────────────────────────────────────────

  let _alerts = [];

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a new alert. Fields by type:
   *
   * ACCOUNT_LOSS:
   *   accountName, accountId?, productName, dateRemoved (Date),
   *   monthlyValue (number), totalAtRisk (number)
   *
   * OUT_OF_STOCK:
   *   accountName, accountId?, productName,
   *   outOfStockSince (Date), dailyRevenueLoss (number)
   *
   * REORDER_DUE:
   *   accountName, accountId?,
   *   lastOrderDate (Date), avgOrderCycleDays (number), daysOverdue (number)
   */
  function add(alertData) {
    _alerts.push({
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date(),
      dismissed: false,
      accountId: null,
      ...alertData,
    });
    return publicAPI; // chainable: Alerts.add({...}).add({...})
  }

  function dismiss(id) {
    _alerts = _alerts.filter(a => a.id !== id);
    renderPanel();
  }

  function getAll() {
    return [..._alerts]
      .filter(a => !a.dismissed)
      .sort((a, b) => SORT_ORDER[a.type] - SORT_ORDER[b.type]);
  }

  function counts() {
    const active = getAll();
    return {
      account_loss: active.filter(a => a.type === TYPE.ACCOUNT_LOSS).length,
      out_of_stock: active.filter(a => a.type === TYPE.OUT_OF_STOCK).length,
      reorder_due:  active.filter(a => a.type === TYPE.REORDER_DUE).length,
      total:        active.length,
    };
  }

  function hasCritical() {
    return _alerts.some(a => a.type === TYPE.ACCOUNT_LOSS && !a.dismissed);
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  function renderPanel() {
    const list       = document.getElementById('alert-list');
    const countEl    = document.getElementById('alert-header-counts');
    const banner     = document.getElementById('critical-alert-banner');
    const statIssues = document.getElementById('stat-issues');
    if (!list) return;

    const all = getAll();
    const c   = counts();

    // Stat tile
    if (statIssues) statIssues.textContent = c.total || '0';

    // Count badges in panel header
    if (countEl) {
      const parts = [];
      if (c.account_loss) parts.push(`<span class="alert-count-badge alert-count-badge--critical">${c.account_loss} Critical</span>`);
      if (c.out_of_stock)  parts.push(`<span class="alert-count-badge alert-count-badge--oos">${c.out_of_stock} OOS</span>`);
      if (c.reorder_due)   parts.push(`<span class="alert-count-badge alert-count-badge--reorder">${c.reorder_due} Reorder</span>`);
      countEl.innerHTML = parts.join('');
    }

    // Full-width critical banner above stats
    if (banner) {
      if (c.account_loss > 0) {
        banner.classList.remove('hidden');
        const msg = banner.querySelector('.critical-banner-msg');
        if (msg) msg.textContent =
          `${c.account_loss} Account Loss alert${c.account_loss > 1 ? 's' : ''} — product${c.account_loss > 1 ? 's' : ''} removed from retailer menu. Immediate action required.`;
      } else {
        banner.classList.add('hidden');
      }
    }

    // Sidebar critical dot
    const dot = document.getElementById('alert-sidebar-dot');
    if (dot) {
      hasCritical() ? dot.classList.remove('hidden') : dot.classList.add('hidden');
    }

    // Alert cards
    if (all.length === 0) {
      list.innerHTML = `<div class="hs-empty-state py-10">No active alerts. All accounts in good standing.</div>`;
      return;
    }
    list.innerHTML = all.map(renderCard).join('');
  }

  function renderCard(a) {
    switch (a.type) {
      case TYPE.ACCOUNT_LOSS: return cardAccountLoss(a);
      case TYPE.OUT_OF_STOCK: return cardOutOfStock(a);
      case TYPE.REORDER_DUE:  return cardReorderDue(a);
      default: return '';
    }
  }

  // ── ACCOUNT LOSS card ───────────────────────────────────────────────────────
  function cardAccountLoss(a) {
    return `
      <div class="alert-card alert-card--critical" id="alert-${a.id}">
        <div class="alert-card-top">
          <span class="alert-type-badge alert-type-badge--critical">
            <i class="fa-solid ${META.account_loss.icon}"></i>&nbsp; Critical — Account Loss
          </span>
          <button class="alert-dismiss-btn" onclick="Alerts.dismiss('${a.id}')" title="Dismiss">✕</button>
        </div>

        <div class="alert-account-name">${a.accountName}</div>

        <div class="alert-details">
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Product Removed</span>
            <span class="alert-detail-value">${a.productName || '—'}</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Date Removed</span>
            <span class="alert-detail-value">${fmtDate(a.dateRemoved)}</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Monthly Value</span>
            <span class="alert-detail-value alert-value--critical">$${(a.monthlyValue || 0).toLocaleString()}<span class="alert-detail-unit">/mo</span></span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Total at Risk</span>
            <span class="alert-detail-value alert-value--critical">$${(a.totalAtRisk || 0).toLocaleString()}</span>
          </div>
        </div>

        <div class="alert-actions">
          <button class="alert-btn alert-btn--critical" onclick="alertAction('call_now', '${a.accountName}')">
            <i class="fa-solid fa-phone"></i> Call Immediately
          </button>
          <button class="alert-btn alert-btn--outline" onclick="alertAction('escalate', '${a.accountName}')">
            <i class="fa-solid fa-circle-exclamation"></i> Escalate to Manager
          </button>
          <button class="alert-btn alert-btn--outline" onclick="alertAction('winback', '${a.accountName}')">
            <i class="fa-solid fa-rotate-left"></i> Win-Back Campaign
          </button>
        </div>
      </div>`;
  }

  // ── OUT OF STOCK card ───────────────────────────────────────────────────────
  function cardOutOfStock(a) {
    const since    = new Date(a.outOfStockSince);
    const daysOOS  = Math.max(0, Math.floor((Date.now() - since) / 86_400_000));
    const lost     = ((a.dailyRevenueLoss || 0) * daysOOS).toLocaleString();
    return `
      <div class="alert-card alert-card--oos" id="alert-${a.id}">
        <div class="alert-card-top">
          <span class="alert-type-badge alert-type-badge--oos">
            <i class="fa-solid ${META.out_of_stock.icon}"></i>&nbsp; Out of Stock
          </span>
          <button class="alert-dismiss-btn" onclick="Alerts.dismiss('${a.id}')" title="Dismiss">✕</button>
        </div>

        <div class="alert-account-name">${a.accountName}</div>

        <div class="alert-details">
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Product</span>
            <span class="alert-detail-value">${a.productName || '—'}</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Out of Stock</span>
            <span class="alert-detail-value">${daysOOS} day${daysOOS !== 1 ? 's' : ''}</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Daily Revenue Loss</span>
            <span class="alert-detail-value">$${(a.dailyRevenueLoss || 0).toLocaleString()}<span class="alert-detail-unit">/day</span></span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Est. Revenue Lost</span>
            <span class="alert-detail-value alert-value--oos">$${lost}</span>
          </div>
        </div>

        <div class="alert-actions">
          <button class="alert-btn alert-btn--oos" onclick="alertAction('call_now', '${a.accountName}')">
            <i class="fa-solid fa-phone"></i> Call Now
          </button>
          <button class="alert-btn alert-btn--outline" onclick="alertAction('emergency_restock', '${a.accountName}')">
            <i class="fa-solid fa-envelope"></i> Emergency Restock Email
          </button>
          <button class="alert-btn alert-btn--outline" onclick="alertAction('brand_rep', '${a.accountName}')">
            <i class="fa-solid fa-person-walking-arrow-right"></i> Request Brand Rep Visit
          </button>
        </div>
      </div>`;
  }

  // ── REORDER DUE card ────────────────────────────────────────────────────────
  function cardReorderDue(a) {
    const dueDate = new Date(new Date(a.lastOrderDate).getTime() + a.avgOrderCycleDays * 86_400_000);
    return `
      <div class="alert-card alert-card--reorder" id="alert-${a.id}">
        <div class="alert-card-top">
          <span class="alert-type-badge alert-type-badge--reorder">
            <i class="fa-solid ${META.reorder_due.icon}"></i>&nbsp; Reorder Due
          </span>
          <button class="alert-dismiss-btn" onclick="Alerts.dismiss('${a.id}')" title="Dismiss">✕</button>
        </div>

        <div class="alert-account-name">${a.accountName}</div>

        <div class="alert-details">
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Last Order</span>
            <span class="alert-detail-value">${fmtDate(a.lastOrderDate)}</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Avg Order Cycle</span>
            <span class="alert-detail-value">${a.avgOrderCycleDays} days</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Was Due</span>
            <span class="alert-detail-value">${fmtDate(dueDate)}</span>
          </div>
          <div class="alert-detail-pair">
            <span class="alert-detail-label">Days Overdue</span>
            <span class="alert-detail-value alert-value--reorder">${a.daysOverdue} days</span>
          </div>
        </div>

        <div class="alert-actions">
          <button class="alert-btn alert-btn--reorder" onclick="alertAction('call_now', '${a.accountName}')">
            <i class="fa-solid fa-phone"></i> Call Now
          </button>
          <button class="alert-btn alert-btn--outline" onclick="alertAction('reorder_email', '${a.accountName}')">
            <i class="fa-solid fa-envelope"></i> Send Reorder Email
          </button>
        </div>
      </div>`;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const publicAPI = { TYPE, add, dismiss, getAll, counts, hasCritical, renderPanel };
  return publicAPI;
})();

// ─── Alert action handler ────────────────────────────────────────────────────
// Wire each action key to real integrations as the platform grows.

function alertAction(action, accountName) {
  const label = {
    call_now:         `Logging call to ${accountName}...`,
    escalate:         `Escalating ${accountName} to manager...`,
    winback:          `Launching win-back campaign for ${accountName}...`,
    emergency_restock:`Sending emergency restock email for ${accountName}...`,
    brand_rep:        `Requesting brand rep visit at ${accountName}...`,
    reorder_email:    `Sending reorder email to ${accountName}...`,
  }[action] || `${action} — ${accountName}`;

  toast(label, action === 'call_now' ? 'info' : 'success');

  if (action === 'call_now') {
    callsToday++;
    const el = document.getElementById('stat-calls');
    if (el) el.textContent = callsToday;
  }
}
