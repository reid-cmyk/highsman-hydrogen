// public/sales-floor/js/lit-state-filter.js
// ─────────────────────────────────────────────────────────────────────────────
// Adds a per-column State Filter to the Low Inventory + Off Menu Lit Alert
// columns on /sales-floor (desktop + mobile), mirroring the existing
// Reorder Due filter (#orders-state-tabs / filterOrdersByState in app.js).
//
// Loaded AFTER /sales-floor/js/app.js so it can safely wrap the existing
// renderLitLowInv / renderLitOffMenu globals without redefining them.
// All operations are guarded — if the corresponding container isn't in the
// DOM (e.g. on an older shell) this script is a no-op.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // Per-column filter state. 'all' matches Reorder Due's convention.
  window.currentLowInvState = window.currentLowInvState || 'all';
  window.currentOffMenuState = window.currentOffMenuState || 'all';

  // Try several shapes — lit alerts rows can come back from the VPS as either
  // a flat account record or a wrapped {account, ...} envelope.
  function rowState(row) {
    if (!row) return null;
    var s = row.state || row.State || row.accountState || row.Account_State ||
            row.billingState || row.Billing_State || row.shippingState || row.Shipping_State;
    if (!s && row.account) {
      s = row.account.state || row.account.State || row.account.Account_State ||
          row.account.Billing_State || row.account.Shipping_State;
    }
    if (!s) return null;
    s = String(s).trim().toUpperCase();
    return s.length === 2 ? s : s; // already a code; full names left alone
  }

  function uniqStates(rows) {
    var set = Object.create(null);
    (rows || []).forEach(function (r) {
      var s = rowState(r);
      if (s) set[s] = (set[s] || 0) + 1;
    });
    return Object.keys(set).sort().map(function (k) { return [k, set[k]]; });
  }

  function chipHTML(label, value, count, active, handler) {
    var cls = 'hs-state-tab' + (active ? ' active' : '');
    return '<button type="button" onclick="' + handler + '(\'' + value + '\')"' +
           ' class="' + cls + '" data-state="' + value + '" role="tab">' +
           label + '<span class="hs-state-tab-count">' + count + '</span>' +
           '</button>';
  }

  function renderTabs(hostId, rows, currentVal, handlerName) {
    var host = document.getElementById(hostId);
    if (!host) return;
    var states = uniqStates(rows);
    var total = (rows || []).length;
    var html = chipHTML('All', 'all', total, currentVal === 'all', handlerName);
    states.forEach(function (pair) {
      html += chipHTML(pair[0], pair[0], pair[1], currentVal === pair[0], handlerName);
    });
    host.innerHTML = html;
  }

  // Public click handlers — referenced by inline onclick in chipHTML().
  window.filterLowInvByState = function (code) {
    window.currentLowInvState = code;
    if (typeof window.renderLitLowInv === 'function') window.renderLitLowInv();
  };
  window.filterOffMenuByState = function (code) {
    window.currentOffMenuState = code;
    if (typeof window.renderLitOffMenu === 'function') window.renderLitOffMenu();
  };

  // Wrap renderLit* so the underlying global array is filtered, the chips are
  // re-rendered with fresh counts, and the original renderer paints the body.
  function wrap(fnName, arrName, hostId, currentGetter, handlerName) {
    if (typeof window[fnName] !== 'function') {
      // app.js hasn't run yet — try again shortly.
      return setTimeout(function () { wrap(fnName, arrName, hostId, currentGetter, handlerName); }, 200);
    }
    var orig = window[fnName];
    window[fnName] = function () {
      var snapshot = window[arrName];
      var current = currentGetter();
      try {
        if (current && current !== 'all') {
          window[arrName] = (snapshot || []).filter(function (r) {
            return rowState(r) === current;
          });
        }
        var result = orig.apply(this, arguments);
        // Re-render tabs from the *unfiltered* snapshot so all states stay
        // available even after a filter is applied.
        renderTabs(hostId, snapshot, current, handlerName);
        return result;
      } finally {
        window[arrName] = snapshot;
      }
    };
  }

  function init() {
    wrap('renderLitLowInv',  'litAlertsLowInv',  'low-inv-state-tabs',  function () { return window.currentLowInvState; },  'filterLowInvByState');
    wrap('renderLitOffMenu', 'litAlertsOffMenu', 'off-menu-state-tabs', function () { return window.currentOffMenuState; }, 'filterOffMenuByState');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
