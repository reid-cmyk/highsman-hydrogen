// Zoho-backed contact autocomplete for the Email Templates tab.
// Hits /api/sales-floor-contact-search?q=... — searches Contacts + Accounts,
// pops a dropdown, and fills the To / Contact Name / Company inputs on click.

const ContactSearch = (() => {
  const ENDPOINT = '/api/sales-floor-contact-search';
  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 220;

  let debounceTimer = null;
  let lastQuery = '';
  let results = [];
  let highlightIdx = -1;
  let abortController = null;

  function $(id) { return document.getElementById(id); }

  function onFocus() {
    const q = $('contact-search-input').value.trim();
    if (q.length >= MIN_CHARS && results.length) showResults();
  }

  function onBlur() {
    // Slight delay so click on a result registers before close.
    setTimeout(hideResults, 180);
  }

  function onInput(e) {
    const q = e.target.value.trim();
    if (q.length < MIN_CHARS) {
      results = [];
      hideResults();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  }

  function onKeydown(e) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, results.length - 1);
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      renderResults();
    } else if (e.key === 'Enter') {
      if (highlightIdx >= 0 && results[highlightIdx]) {
        e.preventDefault();
        pick(results[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      hideResults();
    }
  }

  async function runSearch(q) {
    if (q === lastQuery) return;
    lastQuery = q;

    if (abortController) abortController.abort();
    abortController = new AbortController();

    const spinner = $('contact-search-spinner');
    spinner?.classList.remove('hidden');

    try {
      const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}`, {
        credentials: 'same-origin',
        signal: abortController.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      results = Array.isArray(data.results) ? data.results : [];
      highlightIdx = results.length ? 0 : -1;

      if (!results.length) {
        renderEmpty(data.ok === false ? (data.error || 'Search unavailable') : 'No matches');
      } else {
        renderResults();
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[contact-search]', err);
      renderEmpty('Search unavailable');
    } finally {
      spinner?.classList.add('hidden');
    }
  }

  function renderResults() {
    const box = $('contact-search-results');
    if (!box) return;
    box.innerHTML = results.map((r, i) => rowHtml(r, i)).join('');
    Array.from(box.querySelectorAll('[data-idx]')).forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = Number(el.getAttribute('data-idx'));
        pick(results[idx]);
      });
      el.addEventListener('mouseenter', () => {
        highlightIdx = Number(el.getAttribute('data-idx'));
        updateHighlight();
      });
    });
    showResults();
  }

  function renderEmpty(msg) {
    const box = $('contact-search-results');
    if (!box) return;
    box.innerHTML = `<div class="hs-contact-search-empty">${escapeHtml(msg)}</div>`;
    showResults();
  }

  function updateHighlight() {
    const box = $('contact-search-results');
    if (!box) return;
    Array.from(box.querySelectorAll('[data-idx]')).forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'));
      el.classList.toggle('is-active', idx === highlightIdx);
    });
  }

  function showResults() {
    $('contact-search-results')?.classList.remove('hidden');
  }

  function hideResults() {
    $('contact-search-results')?.classList.add('hidden');
  }

  function pick(r) {
    if (!r) return;
    // Fill the email form.
    const toEl = $('email-to');
    const nameEl = $('email-name');
    const companyEl = $('email-company');
    if (toEl) toEl.value = r.email || '';
    if (nameEl) nameEl.value = (r.name || '').split(' ')[0] || r.name || '';
    if (companyEl) companyEl.value = r.accountName || '';

    // Reflect selection in the search input.
    const input = $('contact-search-input');
    if (input) input.value = r.name + (r.accountName ? ` · ${r.accountName}` : '');

    // Nudge the hint so the rep knows it worked.
    const hint = $('contact-search-hint');
    if (hint) {
      if (!r.email) {
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#F5E400"></i> No email on this contact in Zoho — add one before sending.`;
      } else {
        hint.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981"></i> Loaded ${escapeHtml(r.name)}${r.accountName ? ` at ${escapeHtml(r.accountName)}` : ''}.`;
      }
    }

    hideResults();
  }

  function rowHtml(r, idx) {
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

  return {onInput, onFocus, onBlur, onKeydown};
})();
