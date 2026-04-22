// ─────────────────────────────────────────────────────────────────────────────
// Missed Calls — "Call Back" panel on /sales-floor dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Renders the open missed-call queue at the top of the dashboard tab.
// Source of truth: /api/sales-floor-missed-calls (Zoho Tasks + Quo fallback).
//
// Each row shows:
//   • Caller name (from Zoho Contact match) or pretty phone if unknown
//   • Phone number (tel: link — taps to dial on mobile)
//   • When they called (relative time)
//   • Quick actions: Call back (tel:) and Mark Done (closes the Zoho Task)
//
// Badge wiring:
//   • #stat-missed         — KPI tile on the dashboard stats grid
//   • #stat-card-missed    — show/hide wrapper for that tile
//   • #missed-calls-nav-badge   — sidebar Dashboard nav
//   • #bn-missed-badge          — bottom-nav Floor button
//   • #missed-calls-count-pill  — pill in the panel header ("3 open")
//
// Refresh cadence: 60s (Zoho search is the bottleneck — server caches 30s).
// Also refreshes on tab focus so reps see fresh data after a missed call.
// "Mark Done" is optimistic — row disappears immediately, then we hit
// /api/sales-floor-task-complete to flip the Zoho Task to Completed.
// ─────────────────────────────────────────────────────────────────────────────

const MissedCalls = (() => {
  const ENDPOINT = '/api/sales-floor-missed-calls';
  const REFRESH_MS = 60 * 1000;

  let items = [];
  let timer = null;
  let inFlight = null;

  async function load() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const res = await fetch(ENDPOINT, {credentials: 'same-origin'});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        items = Array.isArray(data.missed) ? data.missed : [];
        render();
        updateBadges();
        return data;
      } catch (err) {
        console.warn('[missed-calls] load failed:', err.message);
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function render() {
    const panel = document.getElementById('missed-calls-panel');
    const list = document.getElementById('missed-calls-list');
    if (!panel || !list) return;

    if (!items.length) {
      // Hide the whole panel when inbox-zero — saves real estate above
      // Recent Calls when there's nothing to act on.
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');

    list.innerHTML = items.map(rowHtml).join('');

    // Wire up Mark Done buttons (event delegation would also work, but
    // keeping it explicit makes the close handler easy to find).
    Array.from(list.querySelectorAll('[data-mc-done]')).forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const id = btn.getAttribute('data-mc-done');
        markDone(id);
      });
    });
  }

  function rowHtml(m) {
    const name = m.callerName || m.callerPretty || m.callerE164 || 'Unknown caller';
    const subline = m.callerName && m.callerPretty
      ? m.callerPretty
      : (m.dueDate ? `Due ${m.dueDate}` : '');
    const tel = m.callerE164 ? escapeAttr(m.callerE164) : '';

    const recordingMatch = (m.description || '').match(/(?:Voicemail|Recording):\s*(\S+)/i);
    const recordingUrl = recordingMatch ? recordingMatch[1] : null;
    const recordBtn = recordingUrl
      ? `<a class="hs-call-action" href="${escapeAttr(recordingUrl)}" target="_blank" rel="noopener" title="Play voicemail">
           <i class="fa-solid fa-play"></i>
         </a>`
      : '';

    const sourceTag = m.source === 'zoho-task'
      ? `<span class="hs-mc-tag" title="Tracked in Zoho Tasks">Zoho</span>`
      : `<span class="hs-mc-tag is-pending" title="Pending Zoho Task — webhook indexing">Pending</span>`;

    const doneBtn = m.zohoTaskId
      ? `<button class="hs-call-action hs-mc-done" data-mc-done="${escapeAttr(m.zohoTaskId)}" title="Mark called back">
           <i class="fa-solid fa-check"></i>
         </button>`
      : '';

    return `
      <div class="hs-mc-row" data-mc-id="${escapeAttr(m.id)}">
        <div class="hs-call-icon is-missed"><i class="fa-solid fa-phone-slash"></i></div>
        <div class="hs-call-main">
          <div class="hs-call-name">
            ${escapeHtml(name)}
            ${sourceTag}
          </div>
          <div class="hs-call-meta">
            ${tel ? `<a href="tel:${tel}" class="hs-tel-link" onclick="event.stopPropagation();">${escapeHtml(m.callerPretty || m.callerE164)}</a>` : '—'}
            <span class="hs-call-time">${relativeTime(m.createdAt)}${subline && subline !== m.callerPretty ? ' · ' + escapeHtml(subline) : ''}</span>
          </div>
        </div>
        <div class="hs-call-actions">
          ${tel ? `<a class="hs-call-action hs-mc-callback" href="tel:${tel}" title="Call back"><i class="fa-solid fa-phone"></i></a>` : ''}
          ${recordBtn}
          ${doneBtn}
        </div>
      </div>`;
  }

  // Optimistic close — drop the row, push the task id to
  // /api/sales-floor-task-complete which flips the Zoho Task to Completed.
  // On failure, restore the row and show a toast-style message in the panel.
  async function markDone(taskId) {
    if (!taskId) return;
    const original = items.slice();
    items = items.filter((m) => m.zohoTaskId !== taskId);
    render();
    updateBadges();

    try {
      const res = await fetch('/api/sales-floor-task-complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({taskId}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'task close failed');
      // Re-fetch in the background to pick up any other state drift.
      setTimeout(load, 1500);
    } catch (err) {
      console.error('[missed-calls] mark done failed', err);
      // Roll back: restore the row + flash a brief warning on the panel.
      items = original;
      render();
      updateBadges();
      const list = document.getElementById('missed-calls-list');
      if (list) {
        const warn = document.createElement('div');
        warn.className = 'hs-mc-warn';
        warn.textContent = `Couldn't mark done — ${err.message}. Try again from Zoho.`;
        list.prepend(warn);
        setTimeout(() => warn.remove(), 4000);
      }
    }
  }

  function updateBadges() {
    const count = items.length;

    const setBadge = (id, n, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (n > 0) {
        el.textContent = text != null ? text : String(n);
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    };

    setBadge('missed-calls-nav-badge', count);
    setBadge('bn-missed-badge', count);

    const pill = document.getElementById('missed-calls-count-pill');
    if (pill) {
      const label = pill.querySelector('.hs-panel-pill-label');
      if (count > 0) {
        if (label) label.textContent = `${count} open`;
        pill.classList.remove('hidden');
      } else {
        pill.classList.add('hidden');
      }
    }

    // KPI tile — show/hide whole card so it doesn't stick at "0".
    const statCard = document.getElementById('stat-card-missed');
    const statNum = document.getElementById('stat-missed');
    if (statNum) statNum.textContent = String(count);
    if (statCard) statCard.classList.toggle('hidden', count === 0);
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
    if (timer) clearInterval(timer);
    timer = setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });
  }

  return {load, render, start, markDone};
})();

// Inline-handler hook for the panel's Refresh button.
function refreshMissedCalls() {
  const btn = event?.currentTarget;
  const icon = btn?.querySelector('i');
  icon?.classList.add('fa-spin');
  MissedCalls.load().finally(() => icon?.classList.remove('fa-spin'));
}
window.refreshMissedCalls = refreshMissedCalls;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MissedCalls.start());
} else {
  MissedCalls.start();
}
