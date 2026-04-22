// Zoho-backed contact autocomplete for the sales-floor dashboard.
// Hits /api/sales-floor-contact-search?q=... — searches Contacts + Accounts,
// pops a dropdown, and fills the form fields for whichever widget is bound.
//
// Used in two places:
//   1. Compose & Send tab  → fills email-to / email-name / email-company
//   2. Quick Email panel   → fills quick-to / quick-name
//
// Each widget registers itself via ContactSearch.bind(cfg). The exposed
// event handlers (onInput/onFocus/onBlur/onKeydown) route to the correct
// instance based on the event target's id, so legacy inline handlers
// like oninput="ContactSearch.onInput(event)" still work.

const ContactSearch = (() => {
  const ENDPOINT = '/api/sales-floor-contact-search';
  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 220;

  // Per-instance state keyed by the search input's id.
  const instances = new Map();

  function $(id) { return document.getElementById(id); }

  function bind(cfg) {
    if (!cfg || !cfg.inputId || !cfg.resultsId) return;
    instances.set(cfg.inputId, {
      cfg,
      debounceTimer: null,
      lastQuery: '',
      results: [],
      highlightIdx: -1,
      abortController: null,
    });
  }

  function forEvent(e) {
    const id = e && e.target && e.target.id;
    return id ? instances.get(id) : null;
  }

  function onFocus(e) {
    const inst = forEvent(e);
    if (!inst) return;
    const q = $(inst.cfg.inputId)?.value.trim() || '';
    if (q.length >= MIN_CHARS && inst.results.length) showResults(inst);
  }

  function onBlur(e) {
    const inst = forEvent(e);
    if (!inst) return;
    // Slight delay so a click on a result registers before we hide.
    setTimeout(() => hideResults(inst), 180);
  }

  function onInput(e) {
    const inst = forEvent(e);
    if (!inst) return;
    const q = e.target.value.trim();
    if (q.length < MIN_CHARS) {
      inst.results = [];
      hideResults(inst);
      return;
    }
    clearTimeout(inst.debounceTimer);
    inst.debounceTimer = setTimeout(() => runSearch(inst, q), DEBOUNCE_MS);
  }

  function onKeydown(e) {
    const inst = forEvent(e);
    if (!inst || !inst.results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      inst.highlightIdx = Math.min(inst.highlightIdx + 1, inst.results.length - 1);
      renderResults(inst);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inst.highlightIdx = Math.max(inst.highlightIdx - 1, 0);
      renderResults(inst);
    } else if (e.key === 'Enter') {
      if (inst.highlightIdx >= 0 && inst.results[inst.highlightIdx]) {
        e.preventDefault();
        pick(inst, inst.results[inst.highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      hideResults(inst);
    }
  }

  async function runSearch(inst, q) {
    if (q === inst.lastQuery) return;
    inst.lastQuery = q;

    if (inst.abortController) inst.abortController.abort();
    inst.abortController = new AbortController();

    const spinner = inst.cfg.spinnerId ? $(inst.cfg.spinnerId) : null;
    spinner?.classList.remove('hidden');

    try {
      const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}`, {
        credentials: 'same-origin',
        signal: inst.abortController.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      inst.results = Array.isArray(data.results) ? data.results : [];
      inst.highlightIdx = inst.results.length ? 0 : -1;

      if (!inst.results.length) {
        renderEmpty(inst, data.ok === false ? (data.error || 'Search unavailable') : 'No matches');
      } else {
        renderResults(inst);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[contact-search]', err);
      renderEmpty(inst, 'Search unavailable');
    } finally {
      spinner?.classList.add('hidden');
    }
  }

  function renderResults(inst) {
    const box = $(inst.cfg.resultsId);
    if (!box) return;
    box.innerHTML = inst.results.map((r, i) => rowHtml(r, i, inst.highlightIdx)).join('');
    Array.from(box.querySelectorAll('[data-idx]')).forEach((el) => {
      el.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const idx = Number(el.getAttribute('data-idx'));
        pick(inst, inst.results[idx]);
      });
      el.addEventListener('mouseenter', () => {
        inst.highlightIdx = Number(el.getAttribute('data-idx'));
        updateHighlight(inst);
      });
    });
    showResults(inst);
  }

  function renderEmpty(inst, msg) {
    const box = $(inst.cfg.resultsId);
    if (!box) return;
    box.innerHTML = `<div class="hs-contact-search-empty">${escapeHtml(msg)}</div>`;
    showResults(inst);
  }

  function updateHighlight(inst) {
    const box = $(inst.cfg.resultsId);
    if (!box) return;
    Array.from(box.querySelectorAll('[data-idx]')).forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'));
      el.classList.toggle('is-active', idx === inst.highlightIdx);
    });
  }

  function showResults(inst) { $(inst.cfg.resultsId)?.classList.remove('hidden'); }
  function hideResults(inst) { $(inst.cfg.resultsId)?.classList.add('hidden'); }

  function pick(inst, r) {
    if (!r) return;
    const fill = inst.cfg.fill || {};

    if (fill.to) {
      const el = $(fill.to);
      if (el) el.value = r.email || '';
    }
    if (fill.name) {
      const el = $(fill.name);
      if (el) el.value = (r.name || '').split(' ')[0] || r.name || '';
    }
    if (fill.company) {
      const el = $(fill.company);
      if (el) el.value = r.accountName || '';
    }

    // Reflect selection in the search input.
    const input = $(inst.cfg.inputId);
    if (input) input.value = r.name + (r.accountName ? ` · ${r.accountName}` : '');

    // Update the hint if the widget exposes one.
    const hint = inst.cfg.hintId ? $(inst.cfg.hintId) : null;
    if (hint) {
      if (!r.email) {
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#F5E400"></i> No email on this contact in Zoho — add one before sending.`;
      } else {
        hint.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981"></i> Loaded ${escapeHtml(r.name)}${r.accountName ? ` at ${escapeHtml(r.accountName)}` : ''}.`;
      }
    }

    // Auto-select a template on the Quick Email widget when the caller
    // asked for it — leaves the template dropdown on whatever the rep
    // had already picked if they chose one before searching.
    if (inst.cfg.afterPick && typeof inst.cfg.afterPick === 'function') {
      try { inst.cfg.afterPick(r); } catch (err) { console.error('[contact-search] afterPick', err); }
    }

    hideResults(inst);
  }

  function rowHtml(r, idx, highlightIdx) {
    const active = idx === highlightIdx ? ' is-active' : '';
    const buyer = r.isBuyer
      ? '<span class="hs-contact-pill hs-contact-pill-buyer">Buyer</span>'
      : '';
    const subParts = [];
    if (r.title) subParts.push(escapeHtml(r.title));
    if (r.accountName) subParts.push(escapeHtml(r.accountName));
    const locParts = [r.city, r.state].filter(Boolean);
    if (locParts.length) subParts.push(escapeHtml(locParts.join(', ')));

    return `
      <div class="hs-contact-search-row${active}" data-idx="${idx}" role="option">
        <div class="hs-contact-search-row-top">
          <span class="hs-contact-search-name">${escapeHtml(r.name)}</span>
          ${buyer}
        </div>
        <div class="hs-contact-search-row-sub">${subParts.join(' · ')}</div>
        ${r.email ? `<div class="hs-contact-search-row-email">${escapeHtml(r.email)}</div>` : '<div class="hs-contact-search-row-email hs-contact-search-row-email-missing">no email on file</div>'}
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Auto-register both known widgets on DOM ready. Keeps HTML inline
  // handlers working with zero extra boilerplate in app.js.
  function autoBind() {
    if (document.getElementById('contact-search-input') && !instances.has('contact-search-input')) {
      bind({
        inputId: 'contact-search-input',
        resultsId: 'contact-search-results',
        spinnerId: 'contact-search-spinner',
        hintId: 'contact-search-hint',
        fill: {to: 'email-to', name: 'email-name', company: 'email-company'},
      });
    }
    if (document.getElementById('quick-contact-search-input') && !instances.has('quick-contact-search-input')) {
      bind({
        inputId: 'quick-contact-search-input',
        resultsId: 'quick-contact-search-results',
        spinnerId: 'quick-contact-search-spinner',
        hintId: 'quick-contact-search-hint',
        fill: {to: 'quick-to', name: 'quick-name'},
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBind);
  } else {
    autoBind();
  }

  return {bind, onInput, onFocus, onBlur, onKeydown};
})();
