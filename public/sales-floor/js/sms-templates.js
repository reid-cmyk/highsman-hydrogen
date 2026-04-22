// ─────────────────────────────────────────────────────────────────────────────
// SMS Templates — chip-row UI for the /sales-floor dashboard composer
// ─────────────────────────────────────────────────────────────────────────────
// Renders horizontally-scrollable chips for each SMS template defined in
// templates.js. Tapping a chip resolves {name} + {company} from the active
// thread or the New Text modal inputs, then drops the filled body into the
// target textarea. Voice + copy live in templates.js so iteration only touches
// one file.
//
// Mounts at:
//   #sms-composer-templates  (in-thread composer, data-target="composer")
//   #sms-new-templates       (New Text modal,    data-target="new")
//
// Dependencies: SMS_TEMPLATES + SMS_TEMPLATE_ORDER + fillSmsTemplate() from
// /sales-floor/js/templates.js, plus window.leads / window.accounts populated
// by app.js after the Zoho sync runs.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ─── Render ────────────────────────────────────────────────────────────────
  function renderRow(host) {
    if (!host || !window.SMS_TEMPLATES || !window.SMS_TEMPLATE_ORDER) return;
    const target = host.getAttribute('data-target') || 'composer';
    const html = SMS_TEMPLATE_ORDER.map((key) => {
      const t = SMS_TEMPLATES[key];
      if (!t) return '';
      const label = escapeAttr(t.label);
      const hint = escapeAttr(t.hint || '');
      const icon = escapeAttr(t.icon || 'message');
      return `
        <button
          type="button"
          class="hs-sms-template-chip"
          data-tpl="${escapeAttr(key)}"
          data-target="${escapeAttr(target)}"
          title="${hint}"
          aria-label="${label} — ${hint}"
          onclick="SmsTemplates.insert('${escapeAttr(key)}','${escapeAttr(target)}')"
        >
          <i class="fa-solid fa-${icon}"></i>
          <span>${escapeHtml(t.label)}</span>
        </button>
      `;
    }).join('');
    host.innerHTML = html;
  }

  function renderAll() {
    document.querySelectorAll('.hs-sms-template-row').forEach(renderRow);
  }

  // ─── Resolve {name} + {company} from active context ───────────────────────
  // Composer mode: read SMS module's openWith (E.164), match against
  // window.leads + window.accounts to pull a name + company.
  // New modal:    read #sms-new-to + #sms-new-name; account name is best-effort
  //               (modal doesn't capture it explicitly, so we fall back to
  //               "the shop").
  function resolveContext(target) {
    if (target === 'new') {
      const phone = (document.getElementById('sms-new-to')?.value || '').trim();
      const name = (document.getElementById('sms-new-name')?.value || '').trim();
      const match = phone ? lookupByPhone(phone) : null;
      return {
        name: name || match?.name || '',
        company: match?.company || '',
      };
    }
    // Composer / in-thread
    const phone = window.SMS && SMS.getOpenWith ? SMS.getOpenWith() : (window.__SMS_OPEN_WITH__ || '');
    const match = phone ? lookupByPhone(phone) : null;
    return {
      name: match?.name || '',
      company: match?.company || '',
    };
  }

  // Match an E.164 phone against the cached Leads + Accounts in app.js.
  // We normalize both sides to digits-only since Zoho mixes formats.
  function lookupByPhone(phone) {
    const target = digitsOnly(phone);
    if (!target) return null;
    const leads = Array.isArray(window.leads) ? window.leads : [];
    const accounts = Array.isArray(window.accounts) ? window.accounts : [];

    for (const l of leads) {
      if (matchPhone(l.phone, target) || matchPhone(l.mobile, target)) {
        return {
          name: firstName(l.name || l.fullName),
          company: l.company || l.account || '',
        };
      }
    }
    for (const a of accounts) {
      if (matchPhone(a.phone, target) || matchPhone(a.mobile, target)) {
        return {
          // For accounts, prefer the primary contact's first name if present.
          name: firstName(a.contactName || a.primaryContact || ''),
          company: a.name || a.account || '',
        };
      }
    }
    return null;
  }

  function matchPhone(candidate, targetDigits) {
    if (!candidate) return false;
    const c = digitsOnly(candidate);
    if (!c) return false;
    // Last-10-digits match handles +1 / leading-zero / formatting differences.
    return c.slice(-10) === targetDigits.slice(-10);
  }

  function digitsOnly(s) {
    return String(s || '').replace(/\D+/g, '');
  }

  function firstName(full) {
    return String(full || '').trim().split(/\s+/)[0] || '';
  }

  // ─── Insert a template into the target textarea ───────────────────────────
  function insert(key, target) {
    if (!window.fillSmsTemplate) return;
    const ctx = resolveContext(target);
    const body = fillSmsTemplate(key, ctx);
    if (!body) return;

    const ta = target === 'new'
      ? document.getElementById('sms-new-body')
      : document.getElementById('sms-input');
    if (!ta) return;

    ta.value = body;
    // Fire input event so existing handlers (counter, send-button enable) update.
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    // Drop the cursor at the end so the rep can keep typing.
    try { ta.setSelectionRange(body.length, body.length); } catch (_) {}
    ta.scrollTop = ta.scrollHeight;
  }

  // ─── Helpers (local copies — keep this module self-contained) ─────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, '&#96;');
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }

  // Public API
  window.SmsTemplates = {
    renderAll,
    insert,
  };
})();
