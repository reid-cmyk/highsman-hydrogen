// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — SMS module
// ─────────────────────────────────────────────────────────────────────────────
// Owns the /sales-floor "Text" tab. Two views in one panel:
//   • Threads list (left)        — `/api/sales-floor-sms`
//   • Conversation pane (right)  — `/api/sales-floor-sms?with=+15555550100`
//   • Composer + "New" modal     — POST `/api/sales-floor-send-sms`
//
// Polling cadence (kept gentle to stay under Quo's 1 RPS/key budget):
//   • Threads list:  every 30s while tab is open
//   • Open thread:   every 10s
//   • Pauses entirely when the user navigates away from the SMS tab
//
// Optimistic send: the composer pushes a "sending…" bubble immediately, then
// reconciles when the server returns the real Quo message id. If the send
// fails, the bubble flips to a red "tap to retry" state instead of vanishing
// (reps need to know if a text didn't go out).
// ─────────────────────────────────────────────────────────────────────────────

window.SMS = (function () {
  // ─── State ─────────────────────────────────────────────────────────────────
  const S = {
    threads: [],
    openWith: null,          // E.164 of currently-open conversation
    messages: [],            // shaped messages for the open thread
    fromE164: null,          // rep's Quo number, surfaced from /api/sales-floor-sms
    threadsTimer: null,
    historyTimer: null,
    booted: false,
    optimisticById: new Map(), // tempId -> {status:'sending'|'failed', body, to}
  };

  const REFRESH_THREADS_MS = 30_000;
  const REFRESH_HISTORY_MS = 10_000;

  // ─── API helpers ───────────────────────────────────────────────────────────
  async function apiThreads() {
    const res = await fetch('/api/sales-floor-sms', {credentials: 'same-origin'});
    if (!res.ok) throw new Error(`threads ${res.status}`);
    return res.json();
  }
  async function apiHistory(participantE164) {
    const url = `/api/sales-floor-sms?with=${encodeURIComponent(participantE164)}`;
    const res = await fetch(url, {credentials: 'same-origin'});
    if (!res.ok) throw new Error(`history ${res.status}`);
    return res.json();
  }
  async function apiSend(toE164, body) {
    const res = await fetch('/api/sales-floor-send-sms', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({to: toE164, body}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `send ${res.status}`);
    }
    return data;
  }

  // ─── Format helpers ────────────────────────────────────────────────────────
  function prettyPhone(e164) {
    if (!e164) return '';
    const d = e164.replace(/[^\d]/g, '');
    if (d.length === 11 && d.startsWith('1')) {
      return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return e164;
  }
  function relTime(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!t) return '';
    const diff = Math.max(0, Date.now() - t);
    const m = Math.round(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  }
  function timeStamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(+d)) return '';
    return d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  // Same E.164 normalizer the server uses, mirrored in the browser so we can
  // accept "(929) 725-3511" in the New Text modal and send a clean +1...
  function toE164(raw) {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (/^\+[1-9]\d{1,14}$/.test(trimmed)) return trimmed;
    const digits = trimmed.replace(/[^\d]/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
  }

  // ─── Renderers ─────────────────────────────────────────────────────────────
  function renderThreads() {
    const host = document.getElementById('sms-threads-list');
    if (!host) return;

    if (!S.threads.length) {
      host.innerHTML = `
        <div class="hs-empty-state py-10">
          <div class="hs-empty-state-icon"><i class="fa-solid fa-comment-dots"></i></div>
          No texts yet. Hit <strong>+ New</strong> to start one.
        </div>`;
      return;
    }

    host.innerHTML = S.threads.map(t => {
      const isOpen = S.openWith && t.participant === S.openWith;
      const unread = (t.unreadCount || 0) > 0;
      const cls = ['hs-sms-thread', isOpen ? 'is-open' : '', unread ? 'is-unread' : '']
        .filter(Boolean).join(' ');
      return `
        <button class="${cls}" onclick="SMS.openConversation('${escapeHtml(t.participant)}')">
          <div class="hs-sms-thread-avatar"><i class="fa-solid fa-user"></i></div>
          <div class="hs-sms-thread-body">
            <div class="hs-sms-thread-title-row">
              <span class="hs-sms-thread-title">${escapeHtml(t.participantPretty || prettyPhone(t.participant))}</span>
              <span class="hs-sms-thread-time">${escapeHtml(relTime(t.lastActivityAt))}</span>
            </div>
            <div class="hs-sms-thread-sub">
              ${t.lastActivityType === 'call' ? '<i class="fa-solid fa-phone hs-sms-thread-icon"></i> Last activity: call' : '<i class="fa-solid fa-comment hs-sms-thread-icon"></i> Tap to open'}
              ${unread ? `<span class="hs-sms-thread-unread">${t.unreadCount}</span>` : ''}
            </div>
          </div>
        </button>`;
    }).join('');
  }

  function renderConversation() {
    const empty   = document.getElementById('sms-conv-empty');
    const feed    = document.getElementById('sms-conv-feed');
    const compose = document.getElementById('sms-composer');
    const title   = document.getElementById('sms-conv-title');
    const sub     = document.getElementById('sms-conv-sub');

    if (!S.openWith) {
      if (empty)   empty.classList.remove('hidden');
      if (feed)    feed.classList.add('hidden');
      if (compose) compose.classList.add('hidden');
      if (title)   title.textContent = 'Pick a conversation';
      if (sub)     sub.textContent   = 'or start a new one';
      document.querySelector('.hs-sms-shell')?.classList.remove('is-conv-open');
      return;
    }

    document.querySelector('.hs-sms-shell')?.classList.add('is-conv-open');
    if (empty)   empty.classList.add('hidden');
    if (feed)    feed.classList.remove('hidden');
    if (compose) compose.classList.remove('hidden');
    if (title)   title.textContent = prettyPhone(S.openWith);
    if (sub)     sub.textContent   = `From ${prettyPhone(S.fromE164 || '')}`;

    if (!feed) return;

    // Merge real messages + optimistic outgoing messages, dedupe by id.
    const real = S.messages.slice();
    const optimistic = [];
    for (const [tempId, opt] of S.optimisticById.entries()) {
      // If a real message with same body+to already exists in last 90s, drop the optimistic
      const cutoff = Date.now() - 90_000;
      const matched = real.find(m =>
        m.direction === 'outgoing' &&
        m.text === opt.body &&
        +new Date(m.createdAt) >= cutoff
      );
      if (matched) {
        S.optimisticById.delete(tempId);
        continue;
      }
      optimistic.push({
        id: tempId,
        direction: 'outgoing',
        text: opt.body,
        from: S.fromE164 || '',
        to: opt.to,
        status: opt.status,         // 'sending' | 'failed'
        createdAt: opt.createdAt,
        _optimistic: true,
        _tempId: tempId,
      });
    }
    const all = real.concat(optimistic).sort(
      (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
    );

    if (!all.length) {
      feed.innerHTML = `
        <div class="hs-sms-conv-empty">
          <div class="hs-sms-empty-icon"><i class="fa-solid fa-comment-dots"></i></div>
          No messages yet. Send the first one below.
        </div>`;
      return;
    }

    feed.innerHTML = all.map(m => {
      const inbound = m.direction === 'incoming';
      const cls = ['hs-sms-bubble', inbound ? 'in' : 'out',
                   m.status === 'failed' ? 'is-failed' : '',
                   m.status === 'sending' ? 'is-sending' : ''].filter(Boolean).join(' ');
      const meta = inbound
        ? timeStamp(m.createdAt)
        : `${timeStamp(m.createdAt)} · ${escapeHtml(prettyStatus(m.status))}`;
      const retry = m._optimistic && m.status === 'failed'
        ? `<button class="hs-sms-retry" onclick="SMS.retry('${escapeHtml(m._tempId)}')">Retry</button>`
        : '';
      return `
        <div class="hs-sms-row ${inbound ? 'in' : 'out'}">
          <div class="${cls}">
            <div class="hs-sms-text">${escapeHtml(m.text)}</div>
            <div class="hs-sms-meta">${escapeHtml(meta)} ${retry}</div>
          </div>
        </div>`;
    }).join('');

    // Auto-scroll to bottom
    feed.scrollTop = feed.scrollHeight;
  }

  function prettyStatus(s) {
    if (!s) return '';
    if (s === 'sending')   return 'sending…';
    if (s === 'failed')    return 'failed';
    if (s === 'queued')    return 'queued';
    if (s === 'sent')      return 'sent';
    if (s === 'delivered') return 'delivered';
    return s;
  }

  // ─── Loaders ───────────────────────────────────────────────────────────────
  async function loadThreads() {
    try {
      const data = await apiThreads();
      if (data.rep && data.rep.fromE164) {
        S.fromE164 = data.rep.fromE164;
        const fromEl = document.getElementById('sms-from-pretty');
        if (fromEl) fromEl.textContent = prettyPhone(S.fromE164);
      }
      if (Array.isArray(data.threads)) {
        S.threads = data.threads;
        renderThreads();
      }
      // Bottom-nav badge — total unread across all threads
      const totalUnread = S.threads.reduce((acc, t) => acc + (t.unreadCount || 0), 0);
      const navBadge = document.getElementById('sms-nav-badge');
      const sheetBadge = document.getElementById('sheet-sms-badge');
      [navBadge, sheetBadge].forEach(b => {
        if (!b) return;
        if (totalUnread > 0) {
          b.textContent = String(totalUnread);
          b.classList.remove('hidden');
        } else {
          b.classList.add('hidden');
        }
      });
    } catch (err) {
      console.warn('[SMS] threads load failed', err.message);
    }
  }

  async function loadHistory() {
    if (!S.openWith) return;
    try {
      const data = await apiHistory(S.openWith);
      if (Array.isArray(data.messages)) {
        S.messages = data.messages;
        renderConversation();
      }
    } catch (err) {
      console.warn('[SMS] history load failed', err.message);
    }
  }

  // ─── Polling control ───────────────────────────────────────────────────────
  function startThreadsPoll() {
    stopThreadsPoll();
    S.threadsTimer = setInterval(loadThreads, REFRESH_THREADS_MS);
  }
  function stopThreadsPoll() {
    if (S.threadsTimer) clearInterval(S.threadsTimer);
    S.threadsTimer = null;
  }
  function startHistoryPoll() {
    stopHistoryPoll();
    S.historyTimer = setInterval(loadHistory, REFRESH_HISTORY_MS);
  }
  function stopHistoryPoll() {
    if (S.historyTimer) clearInterval(S.historyTimer);
    S.historyTimer = null;
  }

  // ─── Public actions ────────────────────────────────────────────────────────
  function init() {
    if (!S.booted) {
      S.booted = true;
      // First paint
      loadThreads();
    } else {
      // Re-entering tab: refresh both views immediately
      loadThreads();
      if (S.openWith) loadHistory();
    }
    startThreadsPoll();
    if (S.openWith) startHistoryPoll();
  }
  function pause() {
    stopThreadsPoll();
    stopHistoryPoll();
  }

  function openConversation(participantE164) {
    S.openWith = participantE164;
    S.messages = [];
    renderConversation();
    loadHistory().then(() => {
      // Re-render threads to reflect "is-open" highlight
      renderThreads();
    });
    startHistoryPoll();
    // Focus composer
    setTimeout(() => document.getElementById('sms-input')?.focus(), 50);
  }

  function closeConversation() {
    S.openWith = null;
    S.messages = [];
    stopHistoryPoll();
    renderConversation();
    renderThreads();
  }

  function refreshOpen() {
    const icon = document.getElementById('sms-refresh-icon');
    icon?.classList.add('animate-spin');
    Promise.all([loadThreads(), loadHistory()])
      .finally(() => setTimeout(() => icon?.classList.remove('animate-spin'), 250));
  }

  // ─── Composer (in-thread) ──────────────────────────────────────────────────
  function onComposerInput() {
    const ta = document.getElementById('sms-input');
    const cnt = document.getElementById('sms-counter');
    const btn = document.getElementById('sms-send-btn');
    if (!ta || !btn) return;
    const len = (ta.value || '').length;
    if (cnt) cnt.textContent = String(len);
    btn.disabled = !S.openWith || len === 0 || len > 1600;
  }
  function onComposerKey(e) {
    // Enter sends, Shift+Enter inserts newline (standard chat UX)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
  async function send() {
    const ta = document.getElementById('sms-input');
    if (!ta || !S.openWith) return;
    const text = (ta.value || '').trim();
    if (!text) return;

    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    S.optimisticById.set(tempId, {
      status: 'sending',
      body: text,
      to: S.openWith,
      createdAt: new Date().toISOString(),
    });
    ta.value = '';
    onComposerInput();
    renderConversation();

    try {
      await apiSend(S.openWith, text);
      // The next history poll will pick up the real message; once it does, the
      // optimistic bubble is auto-deduped in renderConversation.
      // Force an immediate refresh for snappier UX.
      loadHistory();
      loadThreads();
      if (typeof toast === 'function') toast('Text sent', 'success');
    } catch (err) {
      console.error('[SMS] send failed', err);
      const opt = S.optimisticById.get(tempId);
      if (opt) {
        opt.status = 'failed';
        S.optimisticById.set(tempId, opt);
      }
      renderConversation();
      if (typeof toast === 'function') toast(`Send failed: ${err.message}`, 'error');
    }
  }

  function retry(tempId) {
    const opt = S.optimisticById.get(tempId);
    if (!opt) return;
    S.optimisticById.delete(tempId);
    // Re-enqueue with current openWith (defensive — should match)
    const ta = document.getElementById('sms-input');
    if (ta) ta.value = opt.body;
    onComposerInput();
    send();
  }

  // ─── New Text modal ────────────────────────────────────────────────────────
  // One-time registration of the SMS contact-search widget. We skip `fill.to`
  // (which ContactSearch auto-fills with email) and route the phone number
  // through `afterPick` instead — keeps the email-fill logic out of here.
  let _smsSearchBound = false;
  function ensureSmsSearchBinding() {
    if (_smsSearchBound) return;
    if (typeof ContactSearch === 'undefined' || !ContactSearch.bind) return;
    if (!document.getElementById('sms-contact-search-input')) return;
    ContactSearch.bind({
      inputId: 'sms-contact-search-input',
      resultsId: 'sms-contact-search-results',
      spinnerId: 'sms-contact-search-spinner',
      // Only fill the name field via standard path; phone goes via afterPick.
      fill: {name: 'sms-new-name'},
      afterPick: (r) => {
        const e = toE164(r?.phone || r?.mobile || '');
        const toEl = document.getElementById('sms-new-to');
        if (toEl) {
          toEl.value = e || (r?.phone || '');
          toEl.dispatchEvent(new Event('input'));
        }
      },
    });
    _smsSearchBound = true;
  }

  function openNew() {
    ensureSmsSearchBinding();
    document.getElementById('sms-new-modal')?.classList.remove('hidden');
    document.body.classList.add('sheet-open');
    // Reset fields
    const inputs = ['sms-new-to', 'sms-new-name', 'sms-new-body', 'sms-contact-search-input'];
    inputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('sms-new-counter').textContent = '0';
    document.getElementById('sms-new-send').disabled = true;
    setTimeout(() => document.getElementById('sms-contact-search-input')?.focus(), 50);
    // Wire counter once
    const body = document.getElementById('sms-new-body');
    if (body && !body._wired) {
      body.addEventListener('input', () => {
        const len = (body.value || '').length;
        document.getElementById('sms-new-counter').textContent = String(len);
        const to = toE164(document.getElementById('sms-new-to').value);
        document.getElementById('sms-new-send').disabled =
          !to || len === 0 || len > 1600;
      });
      body._wired = true;
    }
    const to = document.getElementById('sms-new-to');
    if (to && !to._wired) {
      to.addEventListener('input', () => {
        const len = (document.getElementById('sms-new-body').value || '').length;
        const e = toE164(to.value);
        document.getElementById('sms-new-send').disabled =
          !e || len === 0 || len > 1600;
      });
      to._wired = true;
    }
  }
  function closeNew() {
    document.getElementById('sms-new-modal')?.classList.add('hidden');
    document.body.classList.remove('sheet-open');
  }
  async function sendNew() {
    const toRaw = document.getElementById('sms-new-to')?.value || '';
    const body  = document.getElementById('sms-new-body')?.value || '';
    const to    = toE164(toRaw);
    if (!to) {
      if (typeof toast === 'function') toast('Need a valid mobile (E.164 like +15555550123)', 'error');
      return;
    }
    if (!body.trim()) {
      if (typeof toast === 'function') toast('Type a message first', 'error');
      return;
    }
    const btn = document.getElementById('sms-new-send');
    if (btn) btn.disabled = true;
    try {
      await apiSend(to, body.trim());
      closeNew();
      // Open the new conversation immediately
      openConversation(to);
      loadThreads();
      if (typeof toast === 'function') toast('Text sent', 'success');
    } catch (err) {
      console.error('[SMS] new send failed', err);
      if (typeof toast === 'function') toast(`Send failed: ${err.message}`, 'error');
      if (btn) btn.disabled = false;
    }
  }

  // ─── Hook into ContactSearch — when a contact is picked while the SMS New
  //     modal is open, route the result to the SMS fields instead of the email
  //     compose form. ContactSearch.js calls window.SMS.onContactPicked when
  //     the SMS search input is focused. We keep this opt-in to avoid
  //     touching the email composer's ContactSearch behavior.
  function onContactPicked(contact) {
    // Expected fields (mirrors what ContactSearch returns elsewhere):
    //   { name, email, phone, mobile, accountName, ... }
    const phone = contact?.mobile || contact?.phone || '';
    const e = toE164(phone);
    const toEl = document.getElementById('sms-new-to');
    const nameEl = document.getElementById('sms-new-name');
    if (toEl) toEl.value = e || phone;
    if (nameEl && contact?.name) nameEl.value = contact.name;
    // Trigger send-button enable state
    document.getElementById('sms-new-to')?.dispatchEvent(new Event('input'));
  }

  return {
    init,
    pause,
    openConversation,
    closeConversation,
    refreshOpen,
    onComposerInput,
    onComposerKey,
    send,
    retry,
    openNew,
    closeNew,
    sendNew,
    onContactPicked,
  };
})();
