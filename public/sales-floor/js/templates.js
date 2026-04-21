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
