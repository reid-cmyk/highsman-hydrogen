/**
 * app/components/SalesFloorEmailModal.tsx
 *
 * Email compose modal for Sales Floor staging — triggered from any feed card's
 * EMAIL button. Pre-populated with the org/contact data from the card.
 *
 * Features:
 *   - 6 template cards (Intro, Follow-Up, Proposal, Check-In, Reorder, Thank You)
 *   - To / Contact Name / Company pre-filled from card data
 *   - Subject + Body editable after template selection
 *   - Sends via /api/sales-floor-send-email (Gmail Service Account → rep's mailbox)
 *   - Success / error toast inline
 *
 * Templates ported from public/sales-floor/js/templates.js (Highsman voice).
 */

import {useState, useEffect} from 'react';
import {useFetcher} from '@remix-run/react';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:           '#0A0A0A',
  surface:      '#141414',
  surfaceElev:  '#1A1A1A',
  border:       '#1F1F1F',
  borderStrong: '#2F2F2F',
  text:         '#F5F5F5',
  textMuted:    '#C8C8C8',
  textSubtle:   '#9C9C9C',
  textFaint:    '#6A6A6A',
  yellow:       '#FFD500',
  cyan:         '#00D4FF',
  green:        '#00E676',
  redSystems:   '#FF3355',
};

// ─── Templates ────────────────────────────────────────────────────────────────

type Template = {key: string; label: string; sub: string; subject: string; body: string};

const TEMPLATES: Template[] = [
  {
    key: 'intro',
    label: 'Intro',
    sub: 'First touch — start the relationship',
    subject: 'Quick intro from Sky — {company}',
    body: `Hi {name},

I wanted to reach out because I think we might be a great fit for {company}.

We're Highsman — Ricky Williams' cannabis brand. Our Triple Infused Pre-Rolls, Hit Sticks, and Ground Game have been moving fast across NJ, and I'd love to get them on your shelf.

Would you be open to a quick call this week?

Sky Lima
Highsman`,
  },
  {
    key: 'followup',
    label: 'Follow-Up',
    sub: 'After a call — keep it moving',
    subject: 'Following up — {company}',
    body: `Hi {name},

Just following up on our conversation. Wanted to make it easy to reconnect.

Happy to answer any questions or get an order started — just say the word.

Talk soon,
Sky Lima
Highsman`,
  },
  {
    key: 'proposal',
    label: 'Proposal',
    sub: 'Send the offer — ask for the deal',
    subject: 'Your wholesale proposal — {company}',
    body: `Hi {name},

As discussed, here's the wholesale pricing for {company}:

• Hit Sticks (0.5g disposable) — [price]
• Triple Infused Pre-Rolls (1.2g) — [price]
• Ground Game (7g shake) — [price]

I can have this fulfilled quickly. Let me know and I'll get it going.

Best,
Sky Lima
Highsman`,
  },
  {
    key: 'checkin',
    label: 'Check-In',
    sub: 'Active account — keep them happy',
    subject: 'Checking in — {company}',
    body: `Hi {name},

Just checking in on how Highsman is moving at {company}. Running low on anything? Need display materials refreshed?

Always here if you need anything.

Sky Lima
Highsman`,
  },
  {
    key: 'reorder',
    label: 'Reorder',
    sub: 'Time to restock — make it easy',
    subject: 'Time to reorder? — {company}',
    body: `Hi {name},

Based on your last order, wanted to check if {company} is running low and ready for a reorder.

I can turn this around quickly — just let me know quantities and I'll get it moving.

Sky Lima
Highsman`,
  },
  {
    key: 'thankyou',
    label: 'Thank You',
    sub: 'Won deal — lock in the partnership',
    subject: 'Thank you — {company}',
    body: `Hi {name},

Thank you for the order — we're excited to work with {company}.

I'll be your go-to person for anything you need. Don't hesitate to reach out anytime.

Grateful for the partnership,
Sky Lima
Highsman`,
  },
];

function fillTemplate(tpl: Template, name: string, company: string): {subject: string; body: string} {
  const fill = (s: string) =>
    s.replace(/\{name\}/g, name || 'there')
     .replace(/\{company\}/g, company || 'your store');
  return {subject: fill(tpl.subject), body: fill(tpl.body)};
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  intro:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  followup: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>,
  proposal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  checkin:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  reorder:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  thankyou: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

// ─── Modal ────────────────────────────────────────────────────────────────────

type ContactOption = {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_role?: string | null;
};

export function SalesFloorEmailModal({
  orgName,
  contacts,
  onClose,
}: {
  orgName: string;
  contacts?: ContactOption[];
  onClose: () => void;
}) {
  const fetcher = useFetcher();

  // Derive primary contact for default pre-fill
  const primaryContact = contacts?.find(c => (c as any).is_primary_buyer) || contacts?.[0];
  const defaultEmail = primaryContact?.email || '';
  const defaultFirst = primaryContact?.first_name || (primaryContact?.full_name?.split(' ')[0]) || '';

  const [selectedContactId, setSelectedContactId] = useState<string | null>(primaryContact?.id || null);
  const [to,       setTo]      = useState(defaultEmail);
  const [name,     setName]    = useState(defaultFirst);
  const [company,  setCompany] = useState(orgName);

  // When contact selector changes, auto-fill to/name
  const onSelectContact = (id: string) => {
    setSelectedContactId(id);
    const c = contacts?.find(x => x.id === id);
    if (c) {
      setTo(c.email || '');
      setName(c.first_name || (c.full_name?.split(' ')[0]) || '');
      // re-fill template if one is selected
      if (selected) {
        const filled = fillTemplate(selected, c.first_name || c.full_name?.split(' ')[0] || '', orgName);
        setSubject(filled.subject);
        setBody(filled.body);
      }
    }
  };
  const [selected, setSelected] = useState<Template | null>(null);
  const [subject,  setSubject] = useState('');
  const [body,     setBody]    = useState('');
  const [status,   setStatus]  = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Watch fetcher response
  useEffect(() => {
    const d = fetcher.data as any;
    if (fetcher.state === 'idle' && d) {
      if (d.ok) {
        setStatus('sent');
      } else {
        setStatus('error');
        setErrorMsg(d.error || 'Send failed — check Gmail SA configuration.');
      }
    }
  }, [fetcher.state, fetcher.data]);

  const pickTemplate = (tpl: Template) => {
    setSelected(tpl);
    const filled = fillTemplate(tpl, name, company);
    setSubject(filled.subject);
    setBody(filled.body);
  };

  // Re-fill when name/company change after template selected
  useEffect(() => {
    if (selected) {
      const filled = fillTemplate(selected, name, company);
      setSubject(filled.subject);
      setBody(filled.body);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, company]);

  const send = () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setStatus('sending');
    const fd = new FormData();
    fd.set('to', to.trim());
    fd.set('subject', subject.trim());
    fd.set('body', body.trim());
    fetcher.submit(fd, {method: 'post', action: '/api/sales-floor-send-email'});
  };

  const canSend = to.trim() && subject.trim() && body.trim() && status !== 'sending' && status !== 'sent';

  return (
    <div
      onClick={onClose}
      style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16}}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface, border:`1px solid ${T.borderStrong}`,
          width:'100%', maxWidth:600, maxHeight:'90vh',
          display:'flex', flexDirection:'column',
          overflow:'hidden',
        }}
      >
        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0}}>
          <div>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:22, letterSpacing:'0.14em', color:T.text, textTransform:'uppercase', lineHeight:1}}>
              Email
            </div>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.12em', marginTop:3}}>
              {orgName}
            </div>
          </div>
          <button onClick={onClose}
            style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontSize:20, padding:'4px 8px', lineHeight:1}}>
            ×
          </button>
        </div>

        <div style={{overflowY:'auto', flex:1, padding:'20px'}}>

          {/* Sent state */}
          {status === 'sent' && (
            <div style={{textAlign:'center', padding:'40px 20px'}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:28, color:T.green, letterSpacing:'0.14em', marginBottom:8}}>EMAIL SENT</div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, letterSpacing:'0.08em', marginBottom:24}}>
                Sent to {to} from sky@highsman.com
              </div>
              <button onClick={onClose}
                style={{height:34, padding:'0 20px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', cursor:'pointer'}}>
                CLOSE
              </button>
            </div>
          )}

          {status !== 'sent' && (
            <>
              {/* Contact picker — only shown when multiple contacts exist */}
              {contacts && contacts.length > 1 && (
                <div style={{marginBottom:16, paddingBottom:16, borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', marginBottom:8}}>
                    Send to
                  </div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                    {contacts.map(c => {
                      const displayName = (c as any).full_name || `${(c as any).first_name||''} ${(c as any).last_name||''}`.trim() || 'Unknown';
                      const active = selectedContactId === c.id;
                      // Show job_title (new) OR roles array OR job_role (legacy)
                      const jobTitle = (c as any).job_title;
                      const roles: string[] = (c as any).roles || [];
                      const legacyRole = (c as any).job_role;
                      const roleDisplay = jobTitle || (roles.length ? roles.join(', ') : null) || legacyRole || null;
                      return (
                        <button key={c.id} onClick={() => onSelectContact(c.id)}
                          style={{
                            padding:'8px 12px',
                            border:`1px solid ${active ? T.yellow : T.borderStrong}`,
                            background: active ? `${T.yellow}12` : 'transparent',
                            color: active ? T.yellow : T.textSubtle,
                            cursor: 'pointer',
                            textAlign: 'left',
                            minWidth: 140,
                          }}>
                          <div style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.10em', textTransform:'uppercase', lineHeight:1.2}}>{displayName}</div>
                          {roleDisplay && (
                            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:8.5, color:active?`${T.yellow}99`:T.textFaint, letterSpacing:'0.08em', marginTop:3, textTransform:'uppercase'}}>
                              {roleDisplay}
                            </div>
                          )}
                          {(c as any).email && (
                            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:active?`${T.yellow}88`:T.textFaint, letterSpacing:'0.04em', marginTop:2}}>
                              {(c as any).email}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Template gallery */}
              {!selected && (
                <div>
                  <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:12}}>
                    Choose a template
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
                    {TEMPLATES.map(tpl => (
                      <button key={tpl.key} onClick={() => pickTemplate(tpl)}
                        style={{
                          background: T.surfaceElev, border:`1px solid ${T.borderStrong}`,
                          padding:'14px 12px', textAlign:'left', cursor:'pointer',
                          display:'flex', flexDirection:'column', gap:6,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = T.yellow + '66')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = T.borderStrong)}
                      >
                        <span style={{color:T.textSubtle}}>{TEMPLATE_ICONS[tpl.key]}</span>
                        <span style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.12em', color:T.text, textTransform:'uppercase'}}>{tpl.label}</span>
                        <span style={{fontFamily:'Inter,sans-serif', fontSize:10.5, color:T.textFaint, lineHeight:1.4}}>{tpl.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compose form */}
              {selected && (
                <div>
                  {/* Selected template chip + change */}
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.10em', textTransform:'uppercase'}}>Template:</span>
                      <span style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', color:T.yellow, padding:'2px 8px', border:`1px solid ${T.yellow}44`, background:`${T.yellow}10`}}>
                        {selected.label.toUpperCase()}
                      </span>
                    </div>
                    <button onClick={() => setSelected(null)}
                      style={{background:'none', border:'none', color:T.textSubtle, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em', cursor:'pointer', textDecoration:'underline'}}>
                      change
                    </button>
                  </div>

                  {/* Fields */}
                  <div style={{display:'flex', flexDirection:'column', gap:12}}>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                      <div>
                        <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>To</label>
                        <input value={to} onChange={e=>setTo(e.target.value)} type="email" placeholder="name@company.com"
                          style={{width:'100%', padding:'8px 10px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}/>
                      </div>
                      <div>
                        <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>Contact Name</label>
                        <input value={name} onChange={e=>setName(e.target.value)} placeholder="First name"
                          style={{width:'100%', padding:'8px 10px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}/>
                      </div>
                    </div>
                    <div>
                      <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>Subject</label>
                      <input value={subject} onChange={e=>setSubject(e.target.value)}
                        style={{width:'100%', padding:'8px 10px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}/>
                    </div>
                    <div>
                      <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>
                        Message <span style={{color:T.textFaint, fontWeight:400}}>— edit before sending</span>
                      </label>
                      <textarea value={body} onChange={e=>setBody(e.target.value)} rows={10}
                        style={{width:'100%', padding:'8px 10px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.6}}/>
                    </div>

                    {/* Error */}
                    {status === 'error' && (
                      <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.redSystems, letterSpacing:'0.08em', padding:'8px 10px', border:`1px solid ${T.redSystems}44`, background:`${T.redSystems}08`}}>
                        ⚠ {errorMsg.includes('not configured') || errorMsg.includes('GOOGLE_SA')
                          ? 'Gmail not available on preview URLs — use the production staging site to send real emails.'
                          : errorMsg}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:4}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.08em'}}>
                        Sends from sky@highsman.com via Gmail
                      </div>
                      <div style={{display:'flex', gap:8}}>
                        <button onClick={onClose}
                          style={{height:34, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.16em', cursor:'pointer'}}>
                          CANCEL
                        </button>
                        <button onClick={send} disabled={!canSend}
                          style={{height:34, padding:'0 18px', background:canSend?T.yellow:'#2a2a2a', border:'none', color:canSend?'#000':T.textFaint, fontFamily:'Teko,sans-serif', fontSize:13, fontWeight:600, letterSpacing:'0.18em', cursor:canSend?'pointer':'not-allowed'}}>
                          {status === 'sending' ? 'SENDING…' : 'SEND'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
