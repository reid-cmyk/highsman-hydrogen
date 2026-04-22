// Email templates — personalized with {name}, {company}, {sender}

const EMAIL_TEMPLATES = {
  intro: {
    subject: 'Quick intro from {sender} — {company}',
    body: `Hi {name},

I wanted to reach out because I think we might be able to help {company}.

We work with businesses like yours to [brief value prop here]. I'd love to learn more about what you're working on and see if there's a fit.

Would you be open to a quick 15-minute call this week?

Looking forward to connecting,
{sender}`,
  },

  followup: {
    subject: 'Following up — {company}',
    body: `Hi {name},

Just following up on our conversation. I know things get busy, so I wanted to make it easy to reconnect.

Happy to answer any questions or send over more info — just say the word.

Talk soon,
{sender}`,
  },

  proposal: {
    subject: 'Your proposal from {sender}',
    body: `Hi {name},

As promised, I've put together a proposal tailored to {company}'s needs.

[Attach or link proposal here]

Key highlights:
• [Point 1]
• [Point 2]
• [Point 3]

I'm available this week to walk through it together — let me know what works for you.

Best,
{sender}`,
  },

  checkin: {
    subject: 'Checking in — {company}',
    body: `Hi {name},

Just checking in to see how things are going at {company}.

Is everything working well on your end? Anything I can help with?

Always here if you need anything.

Best,
{sender}`,
  },

  reorder: {
    subject: 'Time to reorder? — {company}',
    body: `Hi {name},

Based on your last order, I wanted to check in to see if {company} is running low and ready for a reorder.

I can turn this around quickly for you — just let me know quantities and I'll get it going.

{sender}`,
  },

  thankyou: {
    subject: 'Thank you — {company}',
    body: `Hi {name},

I just wanted to say thank you for choosing us. We're excited to work with {company} and will do everything we can to make this a great experience.

Don't hesitate to reach out anytime — I'm your go-to person for anything you need.

Grateful for the partnership,
{sender}`,
  },
};

function fillTemplate(templateKey, { name = '', company = '', sender = '' }) {
  const t = EMAIL_TEMPLATES[templateKey];
  if (!t) return null;
  const replace = (str) =>
    str.replace(/\{name\}/g, name || 'there')
       .replace(/\{company\}/g, company || 'your company')
       .replace(/\{sender\}/g, sender || CONFIG.salesperson.name || 'the team');
  return {
    subject: replace(t.subject),
    body: replace(t.body),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS templates — canned Highsman-voice texts for the /sales-floor dashboard
// ─────────────────────────────────────────────────────────────────────────────
// Short, polite, direct, signed from Sky. Designed to fit in one or two SMS
// segments (under ~250 chars) so carriers don't fragment them. Voice follows
// the Highsman brand voice skill — Floor register, benefit-first, no hedging,
// no permission-seeking, no medical framing. Assumptive closes where it fits.
//
// Variables:
//   {name}     → contact first name (falls back to "there" if unknown)
//   {company}  → account name       (falls back to "the shop")
//
// The `label` is what shows on the chip row in the composer UI.
// The `icon`  is a Font Awesome glyph name (e.g. "phone-slash", "rotate").
// The `hint`  is the one-line description shown on hover / long-press.
// ─────────────────────────────────────────────────────────────────────────────

const SMS_TEMPLATES = {
  tried_reach: {
    label: 'Tried You',
    icon: 'phone-slash',
    hint: "Can't reach them by phone — pivot to text",
    body: `Hey {name}, Sky @ Highsman. Tried you earlier — no luck. Grab me when you've got 2 min, got a quick update for {company}.`,
  },

  checkin_sales: {
    label: 'Check-In',
    icon: 'hand',
    hint: 'How is Highsman moving at their shop',
    body: `Hey {name}, Sky with Highsman checking in. How's Highsman moving at {company}? Let me know if you need anything on my end.`,
  },

  low_inventory: {
    label: 'Low Inv',
    icon: 'box-open',
    hint: 'Heard they are running light — prompt a reorder',
    body: `Hey {name}, Sky @ Highsman. Heard {company} was running light — want me to cue up a reorder? I can turn it around fast.`,
  },

  cold_intro_ricky: {
    label: 'Cold Intro',
    icon: 'star',
    hint: 'First-touch — Highsman by Ricky Williams',
    body: `Hey {name}, Sky reaching out from Highsman by Ricky Williams. Want to get the Triple Infused lineup on your shelf at {company}. 2 min to chat?`,
  },

  post_meeting_ty: {
    label: 'Thanks',
    icon: 'handshake',
    hint: 'Post-meeting thank-you',
    body: `Appreciate the time today, {name}. Getting everything moving on our end for {company}. Text me whenever — I'm your point person.`,
  },

  order_confirmed: {
    label: 'Order Lock',
    icon: 'circle-check',
    hint: 'Confirm order placed — delivery this week',
    body: `Hey {name}, Sky @ Highsman. Your order's locked — lands this week. Text me if anything shifts on your side.`,
  },

  merch_drop: {
    label: 'Merch Drop',
    icon: 'shirt',
    hint: 'Swing by to refresh display + drop merch',
    body: `Hey {name}, Sky with Highsman. Swinging by {company} to refresh the display + drop fresh merch. 10 min tops — what day works?`,
  },

  popup_invite: {
    label: 'Pop-Up',
    icon: 'calendar-day',
    hint: 'Offer a Highsman pop-up / sampling event',
    body: `Hey {name}, Sky here. Running Highsman pop-ups in the area — bringing samples + Ricky Williams swag for {company}'s team. Want us on the schedule?`,
  },
};

// Fill a SMS template with contact context. Defaults are Highsman-friendly:
// missing name → "there" (still polite); missing company → "the shop" (keeps
// it conversational if the rep is texting from a cold lead with no account).
function fillSmsTemplate(key, { name = '', company = '' } = {}) {
  const t = SMS_TEMPLATES[key];
  if (!t) return null;
  // Prefer first name — the templates read more naturally that way.
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return t.body
    .replace(/\{name\}/g, first || 'there')
    .replace(/\{company\}/g, company || 'the shop');
}

// Ordered list for rendering the chip row in template order (vs. object-key
// order which is technically undefined in older engines).
const SMS_TEMPLATE_ORDER = [
  'tried_reach',
  'checkin_sales',
  'low_inventory',
  'cold_intro_ricky',
  'post_meeting_ty',
  'order_confirmed',
  'merch_drop',
  'popup_invite',
];
