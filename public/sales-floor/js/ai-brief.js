// ─────────────────────────────────────────────────────────────────────────────
// AI Pre-Call Brief — Sales Floor
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/brief with {lead} → {ok, brief, mode, sources}
//
// `brief` shape (server-side Claude-generated, tool_use pinned):
//   {
//     mode: 'cold' | 'warm',
//     lastContact: {channel, when, summary},
//     skysPlay: string,                 // the coaching recommendation
//     talkingPoints: string[],
//     likelyObjections: [{objection, response}],
//     suggestedOpener: string,
//     history: [{channel, when, direction, summary}]   // newest first, max 6
//   }
//
// Rendering has three zones:
//   1. Cold mode → compact "first-contact" brief (Opener + Play + points).
//   2. Warm mode → Last Contact summary on top + Sky's Play + talking points,
//      with an expandable "Conversation history" list at the bottom.
//   3. Fallback → if server returned `_fallback: true`, render a soft warning
//      banner so we know the model didn't run (key missing, timeout, etc.).
// ─────────────────────────────────────────────────────────────────────────────

const AIBrief = (() => {

  // ---- Network ----------------------------------------------------------------

  async function generate(lead) {
    const res = await fetch('/api/brief', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({lead}),
    });
    if (!res.ok) {
      // Try to surface a useful error message, then fall back to a local
      // cold template so the rep isn't staring at a red error in the middle
      // of a call session.
      let msg = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        if (errData?.error) msg = errData.error;
      } catch (_) {}
      return localFallback(lead, msg);
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.ok || !data.brief) {
      return localFallback(lead, data?.error || 'Empty brief response');
    }
    // Attach `sources` at the brief level so renderBrief can show the
    // "pulled from: calls/sms/email" chip row.
    data.brief.__sources = data.sources || {};
    return data.brief;
  }

  // Local fallback — only used when the network call itself fails. This is
  // a UI safety net; the server also has its own fallback for the
  // "ANTHROPIC_API_KEY not set" case (see api.brief.tsx).
  function localFallback(lead, reason) {
    const name = lead._fullName || lead.First_Name || 'this contact';
    return {
      mode: 'cold',
      lastContact: {channel: 'none', when: '', summary: 'Brief service is unavailable right now — working off a template.'},
      skysPlay:
        "Lead with the Hit Stick — it's the easiest first yes. Close on a sample pack + a visit this week.",
      talkingPoints: [
        'Introduce Highsman (Ricky Williams) in one sentence',
        'Ask what flower is moving on their shelf',
        'Lead with the Hit Stick as the entry SKU',
        'Close on a sample pack + visit this week',
      ],
      likelyObjections: [],
      suggestedOpener: `Hey ${lead.First_Name || name}, this is ${(window.__HS_REP__ && window.__HS_REP__.firstName) || 'from Highsman'} — Ricky Williams' brand. I want to get the Hit Stick in your shop this week.`,
      history: [],
      _fallback: true,
      _fallbackReason: reason,
      __sources: {},
    };
  }

  // ---- Formatting helpers -----------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function channelIcon(channel) {
    switch ((channel || '').toLowerCase()) {
      case 'call': return '<i class="fa-solid fa-phone"></i>';
      case 'sms': return '<i class="fa-solid fa-comment-sms"></i>';
      case 'email': return '<i class="fa-solid fa-envelope"></i>';
      default: return '<i class="fa-regular fa-circle"></i>';
    }
  }

  function channelLabel(channel) {
    switch ((channel || '').toLowerCase()) {
      case 'call': return 'Call';
      case 'sms': return 'Text';
      case 'email': return 'Email';
      case 'none': return 'No prior contact';
      default: return 'Interaction';
    }
  }

  function directionLabel(direction) {
    return direction === 'outgoing' ? 'You → them' : 'Them → you';
  }

  function sourceChips(sources) {
    if (!sources) return '';
    const chips = [];
    if (sources.callCount > 0) {
      chips.push(`<span class="brief-chip"><i class="fa-solid fa-phone"></i> ${sources.callCount} call${sources.callCount === 1 ? '' : 's'}</span>`);
    }
    if (sources.smsCount > 0) {
      chips.push(`<span class="brief-chip"><i class="fa-solid fa-comment-sms"></i> ${sources.smsCount} text${sources.smsCount === 1 ? '' : 's'}</span>`);
    }
    if (sources.emailCount > 0) {
      const exact = Number(sources.exactEmailCount || 0);
      const domain = Number(sources.domainEmailCount || 0);
      const domainLabel = esc(sources.domainQueried || 'the same shop');
      // When domain expansion surfaced correspondence with OTHER contacts at
      // the shop, split the chip so the rep sees that part of the history is
      // with someone else (e.g. the previous buyer before this lead took over).
      if (domain > 0 && exact > 0) {
        chips.push(`<span class="brief-chip"><i class="fa-solid fa-envelope"></i> ${exact} with lead</span>`);
        chips.push(`<span class="brief-chip" title="Correspondence with other contacts at ${domainLabel}"><i class="fa-solid fa-building"></i> ${domain} w/ other ${domain === 1 ? 'contact' : 'contacts'} @ shop</span>`);
      } else if (domain > 0) {
        chips.push(`<span class="brief-chip" title="Correspondence with other contacts at ${domainLabel}"><i class="fa-solid fa-building"></i> ${domain} email${domain === 1 ? '' : 's'} w/ other ${domain === 1 ? 'contact' : 'contacts'} @ shop</span>`);
      } else {
        chips.push(`<span class="brief-chip"><i class="fa-solid fa-envelope"></i> ${sources.emailCount} email${sources.emailCount === 1 ? '' : 's'}</span>`);
      }
    }
    if (chips.length === 0) return '';
    return `<div class="brief-chip-row">${chips.join('')}</div>`;
  }

  function fallbackBanner(brief) {
    if (!brief._fallback) return '';
    const reason = esc(brief._fallbackReason || 'AI coach unavailable.');
    return `
      <div class="brief-warn">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <div>
          <strong>Template brief</strong>
          <div class="brief-warn-sub">${reason}</div>
        </div>
      </div>`;
  }

  // ---- Section builders -------------------------------------------------------

  function renderLastContact(lc) {
    if (!lc || lc.channel === 'none' || !lc.summary) return '';
    const iconHtml = channelIcon(lc.channel);
    return `
      <div class="brief-last-contact">
        <div class="brief-last-contact-head">
          <span class="brief-last-icon">${iconHtml}</span>
          <div>
            <div class="brief-last-label">LAST CONTACT · ${esc(channelLabel(lc.channel).toUpperCase())}</div>
            <div class="brief-last-when">${esc(lc.when || '')}</div>
          </div>
        </div>
        <p class="brief-last-summary">${esc(lc.summary)}</p>
      </div>`;
  }

  function renderSkysPlay(play, firstName) {
    if (!play) return '';
    const repName = (window.__HS_REP__ && window.__HS_REP__.firstName) || firstName || 'Sky';
    return `
      <div class="brief-play">
        <div class="brief-play-head">
          <span class="brief-play-star"><i class="fa-solid fa-bolt"></i></span>
          <span class="brief-play-label">${esc(repName)}'S PLAY</span>
        </div>
        <p class="brief-play-body">${esc(play)}</p>
      </div>`;
  }

  function renderTalkingPoints(points) {
    if (!Array.isArray(points) || points.length === 0) return '';
    return `
      <div class="brief-section">
        <h4>Talking Points</h4>
        <ul class="brief-list">
          ${points.map(p => `<li>${esc(p)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function renderObjections(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const rows = items.map(obj => {
      const o = esc(obj.objection || '');
      const r = esc(obj.response || '');
      return `
        <div class="brief-objection">
          <div class="brief-objection-q">“${o}”</div>
          <div class="brief-objection-a"><i class="fa-solid fa-angle-right"></i> ${r}</div>
        </div>`;
    }).join('');
    return `
      <div class="brief-section">
        <h4>Likely Objections</h4>
        ${rows}
      </div>`;
  }

  function renderOpener(opener) {
    if (!opener) return '';
    return `
      <div class="brief-section">
        <h4>Suggested Opener</h4>
        <blockquote class="brief-opener">“${esc(opener)}”</blockquote>
      </div>`;
  }

  function renderHistory(history) {
    if (!Array.isArray(history) || history.length === 0) return '';
    const rows = history.map(h => `
      <div class="brief-timeline-row">
        <div class="brief-timeline-icon">${channelIcon(h.channel)}</div>
        <div class="brief-timeline-body">
          <div class="brief-timeline-meta">
            <span class="brief-timeline-channel">${esc(channelLabel(h.channel))}</span>
            <span class="brief-timeline-dot">·</span>
            <span class="brief-timeline-dir">${esc(directionLabel(h.direction))}</span>
            <span class="brief-timeline-dot">·</span>
            <span class="brief-timeline-when">${esc(h.when || '')}</span>
          </div>
          <p class="brief-timeline-summary">${esc(h.summary || '')}</p>
        </div>
      </div>
    `).join('');
    // Collapsed by default — sales rep doesn't want a wall of text before
    // the call. Click to expand.
    return `
      <details class="brief-history">
        <summary class="brief-history-summary">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>Conversation history</span>
          <span class="brief-history-count">${history.length}</span>
          <i class="fa-solid fa-chevron-down brief-history-chev"></i>
        </summary>
        <div class="brief-timeline">
          ${rows}
        </div>
      </details>`;
  }

  function renderCRMNotes(lead) {
    const notes = lead?.Description;
    if (!notes || !notes.trim() || notes.trim() === 'No notes on record.') return '';
    return `
      <details class="brief-crm-notes">
        <summary class="brief-crm-notes-summary">
          <i class="fa-solid fa-note-sticky"></i>
          <span>CRM notes</span>
          <i class="fa-solid fa-chevron-down brief-history-chev"></i>
        </summary>
        <p class="brief-crm-notes-body">${esc(notes.trim())}</p>
      </details>`;
  }

  // ---- Main render ------------------------------------------------------------

  function renderBrief(brief) {
    const mode = brief.mode || 'cold';
    const sources = brief.__sources || {};
    const lead = (typeof currentBriefLead !== 'undefined' && currentBriefLead) || null;

    return `
      ${fallbackBanner(brief)}
      ${sourceChips(sources)}

      ${mode === 'warm' ? renderLastContact(brief.lastContact) : ''}
      ${renderSkysPlay(brief.skysPlay, (window.__HS_REP__ || {}).firstName)}
      ${renderTalkingPoints(brief.talkingPoints)}
      ${renderObjections(brief.likelyObjections)}
      ${renderOpener(brief.suggestedOpener)}

      ${mode === 'warm' ? renderHistory(brief.history) : ''}
      ${renderCRMNotes(lead)}
    `;
  }

  return {generate, renderBrief};
})();
