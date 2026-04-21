// AI Pre-Call Brief generator
// Calls a backend proxy endpoint to avoid exposing API keys client-side.
// For local dev, falls back to a structured mock if no backend is available.

const AIBrief = (() => {

  async function generate(lead) {
    // Try backend proxy first (set up server.js for production)
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead }),
      });
      if (res.ok) return res.json();
    } catch (_) {
      // backend not running — use mock
    }
    return generateMock(lead);
  }

  // Structured mock brief — good for demos and offline dev
  function generateMock(lead) {
    const name = lead._fullName || lead.First_Name || 'this contact';
    const company = lead.Company || 'their company';
    const status = lead._status || 'new';
    const source = lead.Lead_Source || 'unknown';

    const openers = {
      hot: `${name} is a qualified lead — they've engaged and are likely evaluating options now. Move with urgency.`,
      warm: `${name} has shown interest and been contacted before. Keep it conversational and find their key concern.`,
      new: `First contact with ${name}. Lead source: ${source}. Keep it short — your goal is to earn a second conversation.`,
      cold: `${name} went quiet. Re-engage with a light touch — ask a question, don't pitch.`,
    };

    const talkingPoints = {
      hot: ['Confirm their timeline and budget', 'Address any remaining objections', 'Propose next steps / close'],
      warm: ['Remind them of the value you discussed', 'Ask: "What would make this a clear yes for you?"', 'Offer a trial, demo, or proposal'],
      new: ['Introduce yourself in one sentence', 'Ask an open question about their current situation', 'Aim for a 15-min follow-up call'],
      cold: ['Reference your last interaction briefly', 'Lead with a new insight or offer', 'Keep it under 2 minutes'],
    };

    const objections = [
      'Price — be ready to anchor on ROI, not cost',
      'Timing — ask: "What would need to change for timing to work?"',
      'Need to check with others — offer to run a brief group demo',
    ];

    return {
      summary: openers[status] || openers.new,
      company,
      leadStatus: status,
      source,
      talkingPoints: talkingPoints[status] || talkingPoints.new,
      likelyObjections: objections,
      suggestedOpener: `"Hi ${lead.First_Name || name}, this is ${CONFIG.salesperson.name || 'calling'} from ${CONFIG.salesperson.company || 'our team'}. I just wanted to follow up — do you have two minutes?"`,
      notes: lead.Description || 'No notes on record.',
    };
  }

  function renderBrief(brief) {
    return `
      <div class="brief-section">
        <h4>Situation</h4>
        <p>${brief.summary}</p>
      </div>

      <div class="brief-section">
        <h4>Talking Points</h4>
        <ul>${brief.talkingPoints.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>

      <div class="brief-section">
        <h4>Likely Objections</h4>
        <ul>${brief.likelyObjections.map(o => `<li>${o}</li>`).join('')}</ul>
      </div>

      <div class="brief-section">
        <h4>Suggested Opener</h4>
        <p class="italic text-gray-500">${brief.suggestedOpener}</p>
      </div>

      ${brief.notes && brief.notes !== 'No notes on record.' ? `
      <div class="brief-section">
        <h4>CRM Notes</h4>
        <p>${brief.notes}</p>
      </div>` : ''}

      <div class="flex gap-3 mt-1 text-xs text-gray-400">
        <span>Source: ${brief.source}</span>
        <span>•</span>
        <span>Status: <span class="font-semibold capitalize">${brief.leadStatus}</span></span>
      </div>
    `;
  }

  return { generate, renderBrief };
})();
