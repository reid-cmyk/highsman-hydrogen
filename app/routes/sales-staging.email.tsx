/**
 * app/routes/sales-staging.email.tsx
 * /sales-staging/email — Full-page email compose
 *
 * Account search → contact multi-select → template picker → compose → send
 * Accepts ?orgId=<uuid> to pre-load an account (e.g. from the account detail
 * page's EMAIL button, if we want to deep-link here in the future).
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData} from '@remix-run/react';
import {useState, useEffect, useRef, useCallback} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'Email | Sales Floor'},
  {name: 'robots', content: 'noindex'},
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: '#0A0A0A', surface: '#141414', surfaceElev: '#1A1A1A',
  border: '#1F1F1F', borderStrong: '#2F2F2F',
  text: '#F5F5F5', textMuted: '#C8C8C8', textSubtle: '#9C9C9C', textFaint: '#6A6A6A',
  yellow: '#FFD500', cyan: '#00D4FF', green: '#00E676',
  magenta: '#FF3B7F', redSystems: '#FF3355', statusWarn: '#FFB300',
};

const ROLE_LABELS: Record<string, string> = {
  purchasing: 'Purchasing', marketing: 'Marketing', management: 'Management',
  budtender: 'Budtender', billing: 'Billing', owner: 'Owner',
};

// ─── Email templates ──────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    key: 'intro', label: 'Intro', sub: 'First touch',
    subject: 'Quick intro from Sky — {company}',
    body: `Hi {name},\n\nI wanted to reach out because I think we might be a great fit for {company}.\n\nWe're Highsman — Ricky Williams' cannabis brand. Our Triple Infused Pre-Rolls, Hit Sticks, and Ground Game have been moving fast across NJ, and I'd love to get them on your shelf.\n\nWould you be open to a quick call this week?\n\nSky Lima\nHighsman`,
  },
  {
    key: 'followup', label: 'Follow-Up', sub: 'Keep it moving',
    subject: 'Following up — {company}',
    body: `Hi {name},\n\nJust following up on our conversation. Wanted to make it easy to reconnect.\n\nHappy to answer any questions or get an order started — just say the word.\n\nTalk soon,\nSky Lima\nHighsman`,
  },
  {
    key: 'proposal', label: 'Proposal', sub: 'Send the offer',
    subject: 'Your wholesale proposal — {company}',
    body: `Hi {name},\n\nAs discussed, here's the wholesale pricing for {company}:\n\n• Hit Sticks (0.5g disposable) — [price]\n• Triple Infused Pre-Rolls (1.2g) — [price]\n• Ground Game (7g shake) — [price]\n\nI can have this fulfilled quickly. Let me know and I'll get it going.\n\nBest,\nSky Lima\nHighsman`,
  },
  {
    key: 'checkin', label: 'Check-In', sub: 'Active account',
    subject: 'Checking in — {company}',
    body: `Hi {name},\n\nJust checking in on how Highsman is moving at {company}. Running low on anything? Need display materials refreshed?\n\nAlways here if you need anything.\n\nSky Lima\nHighsman`,
  },
  {
    key: 'reorder', label: 'Reorder', sub: 'Time to restock',
    subject: 'Time to reorder? — {company}',
    body: `Hi {name},\n\nBased on your last order, wanted to check if {company} is running low and ready for a reorder.\n\nI can turn this around quickly — just let me know quantities and I'll get it moving.\n\nSky Lima\nHighsman`,
  },
  {
    key: 'thankyou', label: 'Thank You', sub: 'Won deal',
    subject: 'Thank you — {company}',
    body: `Hi {name},\n\nThank you for the order — we're excited to work with {company}.\n\nI'll be your go-to person for anything you need. Don't hesitate to reach out anytime.\n\nGrateful for the partnership,\nSky Lima\nHighsman`,
  },
];

function fill(str: string, name: string, company: string) {
  return str
    .replace(/\{name\}/g, name || 'there')
    .replace(/\{company\}/g, company || 'your store');
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');

  // Optional: pre-load org from ?orgId=
  const url = new URL(request.url);
  const orgId = url.searchParams.get('orgId') || null;
  let preloadedOrg: any = null;

  if (orgId) {
    try {
      const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=id,name,market_state,city,website,contacts(id,first_name,last_name,full_name,email,phone,mobile,is_primary_buyer,job_title,roles)&limit=1`,
        {headers: h},
      );
      const rows = await res.json().catch(() => []);
      preloadedOrg = Array.isArray(rows) ? rows[0] || null : null;
    } catch { /* ignore */ }
  }

  return json({sfUser, preloadedOrg});
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EmailPage() {
  const {sfUser, preloadedOrg} = useLoaderData<typeof loader>() as any;

  // ── Step: 'search' | 'compose' ───────────────────────────────────────────────
  const [step,          setStep]          = useState<'search'|'compose'>(preloadedOrg ? 'compose' : 'search');
  const [selectedOrg,   setSelectedOrg]   = useState<any>(preloadedOrg);
  const [contacts,      setContacts]      = useState<any[]>(preloadedOrg?.contacts || []);

  // ── Search state ─────────────────────────────────────────────────────────────
  const [query,         setQuery]         = useState('');
  const [results,       setResults]       = useState<any[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [loadingOrg,    setLoadingOrg]    = useState(false);
  const debounceRef = useRef<any>(null);
  const searchRef   = useRef<HTMLInputElement>(null);

  // ── Contact selection (multi) ────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (!preloadedOrg?.contacts?.length) return [];
    const primary = preloadedOrg.contacts.find((c: any) => c.is_primary_buyer);
    const first = preloadedOrg.contacts.find((c: any) => c.email);
    const pick = primary || first;
    return pick ? [pick.id] : [];
  });

  // ── Compose fields ───────────────────────────────────────────────────────────
  const [template,  setTemplate]  = useState<typeof TEMPLATES[0] | null>(null);
  const [to,        setTo]        = useState('');
  const [cc,        setCc]        = useState('');
  const [toName,    setToName]    = useState('');
  const [subject,   setSubject]   = useState('');
  const [body,      setBody]      = useState('');
  const [status,    setStatus]    = useState<'idle'|'sending'|'sent'|'error'>('idle');
  const [errorMsg,  setErrorMsg]  = useState('');

  // Sync To/CC from selectedIds
  const syncToCC = useCallback((ids: string[], ctacts: any[]) => {
    const [firstId, ...restIds] = ids;
    const firstC  = ctacts.find(c => c.id === firstId);
    setTo(firstC?.email || '');
    setToName(firstC?.first_name || firstC?.full_name?.split(' ')[0] || '');
    setCc(restIds.map(id => ctacts.find(c => c.id === id)?.email).filter(Boolean).join(', '));
  }, []);

  const toggleContact = (id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      syncToCC(next, contacts);
      // re-fill template with new primary name
      if (template) {
        const firstC = contacts.find(c => c.id === (next[0] || id));
        const nm = firstC?.first_name || firstC?.full_name?.split(' ')[0] || '';
        setToName(nm);
        setSubject(fill(template.subject, nm, selectedOrg?.name || ''));
        setBody(fill(template.body, nm, selectedOrg?.name || ''));
      }
      return next;
    });
  };

  const pickTemplate = (tpl: typeof TEMPLATES[0]) => {
    setTemplate(tpl);
    const nm = toName || contacts.find(c => selectedIds[0] === c.id)?.first_name || '';
    const company = selectedOrg?.name || '';
    setSubject(fill(tpl.subject, nm, company));
    setBody(fill(tpl.body, nm, company));
  };

  // Re-fill when toName changes
  useEffect(() => {
    if (template) {
      setSubject(fill(template.subject, toName, selectedOrg?.name || ''));
      setBody(fill(template.body, toName, selectedOrg?.name || ''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toName]);

  // ── Account search ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (query.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/org-search?q=${encodeURIComponent(query)}`);
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results : []);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const selectOrg = async (org: {id:string; name:string; market_state:string|null; city:string|null}) => {
    setLoadingOrg(true);
    setResults([]);
    setQuery('');
    try {
      // Fetch the org's contacts
      const r = await fetch(`/api/org-search?orgId=${org.id}`);
      const d = await r.json().catch(() => ({}));
      const cts: any[] = Array.isArray(d.contacts) ? d.contacts : [];
      setSelectedOrg(org);
      setContacts(cts);
      const firstWithEmail = cts.find((c: any) => c.email);
      const ids = firstWithEmail ? [firstWithEmail.id] : [];
      setSelectedIds(ids);
      syncToCC(ids, cts);
    } catch {
      setSelectedOrg(org);
      setContacts([]);
      setSelectedIds([]);
    }
    setStep('compose');
    setLoadingOrg(false);
  };

  const resetSearch = () => {
    setStep('search');
    setSelectedOrg(null);
    setContacts([]);
    setSelectedIds([]);
    setTemplate(null);
    setTo(''); setCc(''); setToName('');
    setSubject(''); setBody('');
    setStatus('idle');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ── Send ──────────────────────────────────────────────────────────────────────
  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setStatus('sending');
    try {
      const fd = new FormData();
      fd.set('to', to.trim());
      if (cc.trim()) fd.set('cc', cc.trim());
      fd.set('subject', subject.trim());
      fd.set('body', body.trim());
      const r = await fetch('/api/sales-floor-send-email', {method: 'POST', body: fd});
      const d = await r.json();
      if (d.ok) {
        setStatus('sent');
      } else {
        setStatus('error');
        setErrorMsg(d.error?.includes('not configured') || d.error?.includes('GOOGLE_SA')
          ? 'Gmail not available on preview URLs — use the production staging site to send real emails.'
          : d.error || 'Send failed');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Network error — check connection');
    }
  };

  const canSend = to.trim() && subject.trim() && body.trim() && status !== 'sending' && status !== 'sent';

  // ── Layout ────────────────────────────────────────────────────────────────────
  return (
    <SalesFloorLayout current="Email" sfUser={sfUser}>
      <div className="hs-sweep" style={{padding:'20px 28px 0', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
          <div>
            <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', lineHeight:1}}>Email</h1>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, marginTop:4, letterSpacing:'0.12em'}}>
              {step === 'search' ? 'Search for an account to start' : selectedOrg ? `${selectedOrg.name} · ${[selectedOrg.city, selectedOrg.market_state].filter(Boolean).join(', ')}` : ''}
            </div>
          </div>
          {step === 'compose' && status !== 'sent' && (
            <button onClick={resetSearch}
              style={{height:34, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
              ← CHANGE ACCOUNT
            </button>
          )}
        </div>
      </div>

      <div style={{flex:1, padding:'24px 28px', maxWidth:760}}>

        {/* ── STEP 1: ACCOUNT SEARCH ─────────────────────────────────────── */}
        {step === 'search' && (
          <div>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', marginBottom:10}}>
              Search Account
            </div>
            <div style={{position:'relative', maxWidth:480}}>
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type dispensary name or city…"
                style={{width:'100%', padding:'11px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:13, outline:'none', boxSizing:'border-box'}}
              />
              {searching && (
                <span style={{position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em'}}>
                  searching…
                </span>
              )}
              {loadingOrg && (
                <span style={{position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.yellow, letterSpacing:'0.10em'}}>
                  loading…
                </span>
              )}

              {/* Results dropdown */}
              {results.length > 0 && (
                <div style={{position:'absolute', top:'100%', left:0, right:0, background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                  {results.map(r => (
                    <button key={r.id} type="button" onClick={() => selectOrg(r)}
                      style={{display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'12px 16px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer'}}
                      onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div>
                        <div style={{fontFamily:'Teko,sans-serif', fontSize:16, letterSpacing:'0.06em', color:T.text, textTransform:'uppercase'}}>{r.name}</div>
                        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.04em', marginTop:2}}>
                          {[r.market_state, r.city].filter(Boolean).join(' · ')}
                          {r.lifecycle_stage && r.lifecycle_stage !== 'active' && (
                            <span style={{marginLeft:8, color:T.textSubtle}}>{r.lifecycle_stage.toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                      <span style={{fontFamily:'Teko,sans-serif', fontSize:11, color:T.yellow, letterSpacing:'0.12em'}}>SELECT →</span>
                    </button>
                  ))}
                </div>
              )}

              {query.length >= 2 && !searching && results.length === 0 && (
                <div style={{position:'absolute', top:'100%', left:0, right:0, background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, padding:'12px 16px'}}>
                  <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.08em'}}>No accounts found for "{query}"</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: COMPOSE ────────────────────────────────────────────── */}
        {step === 'compose' && status === 'sent' && (
          <div style={{textAlign:'center', padding:'60px 20px'}}>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:32, letterSpacing:'0.14em', color:T.green, marginBottom:10}}>EMAIL SENT</div>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, letterSpacing:'0.08em', marginBottom:28}}>Sent to {to}{cc ? ` (CC: ${cc})` : ''} from sky@highsman.com</div>
            <div style={{display:'flex', gap:10, justifyContent:'center'}}>
              <button onClick={resetSearch}
                style={{height:36, padding:'0 20px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', cursor:'pointer'}}>
                COMPOSE ANOTHER
              </button>
            </div>
          </div>
        )}

        {step === 'compose' && status !== 'sent' && (
          <div style={{display:'flex', flexDirection:'column', gap:24}}>

            {/* ── Contact selector ─────────────────────────────────────── */}
            <div>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', marginBottom:10}}>
                Send To <span style={{color:T.textFaint, fontWeight:400, fontSize:9, letterSpacing:'0.12em'}}>(select one or more)</span>
              </div>
              {contacts.length === 0 ? (
                <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.08em', padding:'12px 0'}}>
                  No contacts found for this account — enter an email address manually below.
                </div>
              ) : (
                <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                  {contacts.map((c: any) => {
                    const displayName = c.full_name || `${c.first_name||''} ${c.last_name||''}`.trim() || 'Unknown';
                    const selIdx = selectedIds.indexOf(c.id);
                    const active = selIdx !== -1;
                    const selLabel = selIdx === 0 ? 'TO' : selIdx > 0 ? 'CC' : null;
                    const jobTitle: string|null = c.job_title || null;
                    const roles: string[] = c.roles || [];
                    const roleLabel = jobTitle || (roles.length ? roles.map((r: string) => ROLE_LABELS[r]||r).join(' · ') : null);
                    const hasEmail = !!c.email;
                    return (
                      <button key={c.id} type="button"
                        onClick={() => hasEmail && toggleContact(c.id)}
                        style={{
                          padding:'10px 14px', textAlign:'left', cursor: hasEmail ? 'pointer' : 'default',
                          border:`1px solid ${active ? T.yellow : T.borderStrong}`,
                          background: active ? `${T.yellow}10` : T.surface,
                          opacity: hasEmail ? 1 : 0.4, minWidth:160,
                        }}>
                        {/* Name + badge */}
                        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                          <span style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.10em', color: active ? T.yellow : T.text, textTransform:'uppercase', lineHeight:1.2}}>
                            {displayName}
                          </span>
                          {selLabel && (
                            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:8, letterSpacing:'0.16em', padding:'1px 5px', background: selIdx === 0 ? T.yellow : T.borderStrong, color: selIdx === 0 ? '#000' : T.textSubtle, flexShrink:0}}>
                              {selLabel}
                            </span>
                          )}
                        </div>
                        {roleLabel && (
                          <div style={{fontFamily:'Inter,sans-serif', fontSize:11, color: active ? `${T.yellow}cc` : T.textMuted, marginBottom:2}}>{roleLabel}</div>
                        )}
                        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color: active ? `${T.yellow}88` : (hasEmail ? T.textFaint : T.borderStrong), letterSpacing:'0.04em'}}>
                          {c.email || 'no email'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Template picker ──────────────────────────────────────── */}
            {!template ? (
              <div>
                <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', marginBottom:10}}>
                  Choose a Template
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
                  {TEMPLATES.map(tpl => (
                    <button key={tpl.key} type="button" onClick={() => pickTemplate(tpl)}
                      style={{background:T.surface, border:`1px solid ${T.borderStrong}`, padding:'14px 12px', textAlign:'left', cursor:'pointer'}}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = `${T.yellow}66`)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = T.borderStrong)}>
                      <div style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.12em', color:T.text, textTransform:'uppercase', marginBottom:3}}>{tpl.label}</div>
                      <div style={{fontFamily:'Inter,sans-serif', fontSize:10.5, color:T.textFaint, lineHeight:1.4}}>{tpl.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {/* Template chip + change */}
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:16}}>
                  <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.10em', textTransform:'uppercase'}}>Template:</span>
                  <span style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', color:T.yellow, padding:'2px 8px', border:`1px solid ${T.yellow}44`, background:`${T.yellow}10`}}>
                    {template.label.toUpperCase()}
                  </span>
                  <button type="button" onClick={() => { setTemplate(null); setSubject(''); setBody(''); }}
                    style={{background:'none', border:'none', color:T.textSubtle, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em', cursor:'pointer', textDecoration:'underline'}}>
                    change
                  </button>
                </div>

                {/* Compose fields */}
                <div style={{display:'flex', flexDirection:'column', gap:12}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    <div>
                      <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>To</label>
                      <input value={to} onChange={e=>setTo(e.target.value)} type="email" placeholder="name@company.com"
                        style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}/>
                    </div>
                    <div>
                      <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>Contact Name</label>
                      <input value={toName} onChange={e=>setToName(e.target.value)} placeholder="First name"
                        style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}/>
                    </div>
                  </div>

                  {cc && (
                    <div>
                      <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>CC</label>
                      <input value={cc} onChange={e=>setCc(e.target.value)}
                        style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.textMuted, fontFamily:'Inter,sans-serif', fontSize:11, outline:'none', boxSizing:'border-box'}}/>
                    </div>
                  )}

                  <div>
                    <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>Subject</label>
                    <input value={subject} onChange={e=>setSubject(e.target.value)}
                      style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}/>
                  </div>

                  <div>
                    <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:4}}>
                      Message <span style={{color:T.textFaint, fontWeight:400}}>— edit before sending</span>
                    </label>
                    <textarea value={body} onChange={e=>setBody(e.target.value)} rows={12}
                      style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', lineHeight:1.65}}/>
                  </div>

                  {status === 'error' && (
                    <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.redSystems, letterSpacing:'0.08em', padding:'8px 12px', border:`1px solid ${T.redSystems}44`, background:`${T.redSystems}08`}}>
                      ⚠ {errorMsg}
                    </div>
                  )}

                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:4}}>
                    <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.08em'}}>
                      Sends from sky@highsman.com via Gmail
                    </div>
                    <button type="button" onClick={send} disabled={!canSend}
                      style={{height:38, padding:'0 28px', background:canSend?T.yellow:'#2a2a2a', border:'none', color:canSend?'#000':T.textFaint, fontFamily:'Teko,sans-serif', fontSize:14, fontWeight:600, letterSpacing:'0.20em', cursor:canSend?'pointer':'not-allowed'}}>
                      {status === 'sending' ? 'SENDING…' : 'SEND EMAIL'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </SalesFloorLayout>
  );
}
