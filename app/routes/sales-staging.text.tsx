/**
 * app/routes/sales-staging.text.tsx
 * /sales-staging/text — Two-way SMS via Quo
 *
 * Left panel:  conversation thread list (from Quo)
 * Right panel: selected conversation + chat feed + template chips + composer
 *
 * Ports the production /sales-floor/app SMS tab to staging design language.
 * No Zoho — send-sms endpoint handles Quo only.
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
  {title: 'Text | Sales Floor'},
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

// ─── SMS Templates ────────────────────────────────────────────────────────────
const SMS_TEMPLATES = [
  {key:'tried_reach',      label:'Tried You',   body:`Hey {name}, Sky @ Highsman. Tried you earlier — no luck. Grab me when you've got 2 min, got a quick update for {company}.`},
  {key:'checkin_sales',    label:'Check-In',    body:`Hey {name}, Sky with Highsman checking in. How's Highsman moving at {company}? Let me know if you need anything on my end.`},
  {key:'low_inventory',    label:'Low Inv',     body:`Hey {name}, Sky @ Highsman. Heard {company} was running light — want me to cue up a reorder? I can turn it around fast.`},
  {key:'cold_intro_ricky', label:'Cold Intro',  body:`Hey {name}, Sky reaching out from Highsman by Ricky Williams. Want to get the Triple Infused lineup on your shelf at {company}. 2 min to chat?`},
  {key:'post_meeting_ty',  label:'Thanks',      body:`Appreciate the time today, {name}. Getting everything moving on our end for {company}. Text me whenever — I'm your point person.`},
  {key:'order_confirmed',  label:'Order Lock',  body:`Hey {name}, Sky @ Highsman. Your order's locked — lands this week. Text me if anything shifts on your side.`},
  {key:'merch_drop',       label:'Merch Drop',  body:`Hey {name}, Sky with Highsman. Swinging by {company} to refresh the display + drop fresh merch. 10 min tops — what day works?`},
  {key:'popup_invite',     label:'Pop-Up',      body:`Hey {name}, Sky here. Running Highsman pop-ups in the area — bringing samples + Ricky Williams swag for {company}'s team. Want us on the schedule?`},
];

function fillSms(body: string, name: string, company: string) {
  return body
    .replace(/\{name\}/g, name.split(' ')[0] || 'there')
    .replace(/\{company\}/g, company || 'the shop');
}

function relTime(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

function msgTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');
  return json({sfUser});
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TextPage() {
  const {sfUser} = useLoaderData<typeof loader>() as any;

  // ── Thread list ──────────────────────────────────────────────────────────────
  const [threads,       setThreads]       = useState<any[]>([]);
  const [threadsError,  setThreadsError]  = useState<string|null>(null);
  const [loadingThreads,setLoadingThreads]= useState(true);

  // ── Open conversation ────────────────────────────────────────────────────────
  const [openE164,      setOpenE164]      = useState<string|null>(null);
  const [openName,      setOpenName]      = useState('');  // display name for header
  const [messages,      setMessages]      = useState<any[]>([]);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);

  // ── Compose ──────────────────────────────────────────────────────────────────
  const [draft,         setDraft]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState<string|null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef     = useRef<HTMLDivElement>(null);

  // ── New text modal ───────────────────────────────────────────────────────────
  const [showNewModal,  setShowNewModal]  = useState(false);
  const [newPhone,      setNewPhone]      = useState('');
  const [newName,       setNewName]       = useState('');
  const [newOrgQuery,   setNewOrgQuery]   = useState('');
  const [newOrgResults, setNewOrgResults] = useState<any[]>([]);
  const [newOrgContacts,setNewOrgContacts]= useState<any[]>([]);
  const newDebounceRef  = useRef<any>(null);

  // ── Load thread list ─────────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch('/api/sales-floor-sms');
      const d = await r.json();
      if (d.ok) {
        setThreads(d.threads || []);
        setThreadsError(null);
      } else {
        setThreadsError(d.error || 'Quo not configured');
      }
    } catch {
      setThreadsError('Network error loading threads');
    }
    setLoadingThreads(false);
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // ── Load messages for open thread ────────────────────────────────────────────
  const loadMessages = useCallback(async (e164: string) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/sales-floor-sms?with=${encodeURIComponent(e164)}`);
      const d = await r.json();
      if (d.ok) setMessages(d.messages || []);
    } catch { /* keep existing messages */ }
    setLoadingMsgs(false);
  }, []);

  // Open a conversation
  const openThread = (e164: string, displayName?: string) => {
    setOpenE164(e164);
    setOpenName(displayName || e164);
    setMessages([]);
    setDraft('');
    setSendError(null);
    loadMessages(e164);
  };

  // Auto-refresh open conversation every 15s
  useEffect(() => {
    if (!openE164) return;
    const id = setInterval(() => loadMessages(openE164), 15000);
    return () => clearInterval(id);
  }, [openE164, loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = async () => {
    if (!draft.trim() || !openE164 || sending) return;
    const text = draft.trim();
    setSending(true);
    setSendError(null);
    // Optimistic update
    const optimistic = {id:`opt-${Date.now()}`, direction:'outgoing', text, createdAt:new Date().toISOString(), status:'sending'};
    setMessages(prev => [...prev, optimistic]);
    setDraft('');
    try {
      const r = await fetch('/api/sales-floor-send-sms', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({to: openE164, body: text}),
      });
      const d = await r.json();
      if (d.ok) {
        // Replace optimistic with real message
        setMessages(prev => prev.map(m =>
          m.id === optimistic.id
            ? {...optimistic, id: d.messageId, status: d.status || 'delivered', createdAt: d.createdAt || optimistic.createdAt}
            : m
        ));
        loadThreads(); // refresh thread list
      } else {
        setSendError(d.error || 'Send failed');
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setDraft(text);
      }
    } catch {
      setSendError('Network error — try again');
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setDraft(text);
    }
    setSending(false);
    textareaRef.current?.focus();
  };

  // ── New text modal: account search ───────────────────────────────────────────
  useEffect(() => {
    if (newOrgQuery.length < 2) { setNewOrgResults([]); return; }
    clearTimeout(newDebounceRef.current);
    newDebounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/org-search?q=${encodeURIComponent(newOrgQuery)}`);
        const d = await r.json();
        setNewOrgResults(d.results || []);
      } catch { setNewOrgResults([]); }
    }, 300);
    return () => clearTimeout(newDebounceRef.current);
  }, [newOrgQuery]);

  const selectNewOrg = async (org: any) => {
    setNewOrgQuery(org.name);
    setNewOrgResults([]);
    const r = await fetch(`/api/org-search?orgId=${org.id}`);
    const d = await r.json();
    setNewOrgContacts(d.contacts || []);
  };

  const startNewConvo = (phone: string, name: string) => {
    setShowNewModal(false);
    setNewPhone(''); setNewName(''); setNewOrgQuery(''); setNewOrgContacts([]);
    openThread(phone, name);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <SalesFloorLayout current="Text" sfUser={sfUser}>
      <div style={{display:'flex', flex:1, minHeight:0, overflow:'hidden'}}>

        {/* ── Left: Thread list ──────────────────────────────────────── */}
        <div style={{width:280, flexShrink:0, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', background:T.surface}}>
          {/* Header */}
          <div style={{padding:'16px 16px 12px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0}}>
            <div>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.16em', color:T.text, textTransform:'uppercase'}}>Conversations</div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.10em', marginTop:2}}>Live two-way SMS via Quo</div>
            </div>
            <button onClick={() => setShowNewModal(true)}
              style={{height:30, padding:'0 10px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:'pointer', display:'flex', alignItems:'center', gap:5, flexShrink:0}}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
              NEW
            </button>
          </div>

          {/* Thread items */}
          <div style={{flex:1, overflowY:'auto'}}>
            {loadingThreads && (
              <div style={{padding:'24px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em', textAlign:'center'}}>
                Loading…
              </div>
            )}
            {!loadingThreads && threadsError && (
              <div style={{padding:'16px', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.statusWarn, letterSpacing:'0.08em', lineHeight:1.6}}>
                ⚠ {threadsError === 'Sky has no Quo phoneNumberId' || threadsError?.includes('phoneNumberId')
                  ? 'Quo phone number not configured for this environment.'
                  : threadsError}
              </div>
            )}
            {!loadingThreads && !threadsError && threads.length === 0 && (
              <div style={{padding:'24px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.08em', textAlign:'center', lineHeight:1.8}}>
                No conversations yet.<br/>Hit NEW to start one.
              </div>
            )}
            {threads.map((t: any) => {
              const active = openE164 === t.participant;
              return (
                <button key={t.id} type="button" onClick={() => openThread(t.participant, t.participantPretty)}
                  style={{width:'100%', padding:'12px 16px', background: active ? `rgba(255,213,0,0.06)` : 'transparent', border:'none', borderBottom:`1px solid ${T.border}`, borderLeft:`2px solid ${active ? T.yellow : 'transparent'}`, textAlign:'left', cursor:'pointer'}}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = `rgba(255,255,255,0.02)`; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3}}>
                    <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:12, color: active ? T.yellow : T.text, letterSpacing:'0.04em'}}>
                      {t.participantPretty}
                    </span>
                    {t.unreadCount > 0 && (
                      <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, background:T.yellow, color:'#000', padding:'1px 5px', letterSpacing:'0.08em'}}>
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.04em'}}>
                    {relTime(t.lastActivityAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Conversation pane ───────────────────────────────── */}
        <div style={{flex:1, display:'flex', flexDirection:'column', minHeight:0, background:T.bg}}>

          {/* Empty state */}
          {!openE164 && (
            <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={T.borderStrong} strokeWidth="1.4" strokeLinecap="round"><path d="M2 2h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-4 3V3a1 1 0 0 1 1-1z"/></svg>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.20em', color:T.textFaint, textTransform:'uppercase'}}>
                No conversation open
              </div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.08em'}}>
                Pick a thread on the left, or hit NEW to start one
              </div>
            </div>
          )}

          {/* Open conversation */}
          {openE164 && (
            <>
              {/* Header */}
              <div style={{padding:'14px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:T.surface}}>
                <div>
                  <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:14, color:T.text, letterSpacing:'0.04em'}}>{openName}</div>
                  <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.08em', marginTop:2}}>
                    {messages.length > 0 ? `${messages.length} messages` : 'Loading…'}
                  </div>
                </div>
                <button onClick={() => loadMessages(openE164)}
                  style={{background:'none', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', padding:'4px 10px', cursor:'pointer'}}>
                  ↻ REFRESH
                </button>
              </div>

              {/* Message feed */}
              <div ref={feedRef} style={{flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10}}>
                {loadingMsgs && messages.length === 0 && (
                  <div style={{textAlign:'center', padding:'24px', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em'}}>
                    Loading messages…
                  </div>
                )}
                {messages.map((m: any) => {
                  const out = m.direction === 'outgoing';
                  return (
                    <div key={m.id} style={{display:'flex', flexDirection:'column', alignItems: out ? 'flex-end' : 'flex-start', gap:3}}>
                      <div style={{
                        maxWidth:'72%', padding:'10px 14px',
                        background: out ? T.yellow : T.surfaceElev,
                        color: out ? '#000' : T.text,
                        fontFamily:'Inter,sans-serif', fontSize:13, lineHeight:1.55,
                        wordBreak:'break-word',
                      }}>
                        {m.text}
                      </div>
                      <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.04em', display:'flex', gap:6, alignItems:'center'}}>
                        {msgTime(m.createdAt)}
                        {m.status === 'sending' && <span style={{color:T.statusWarn}}>sending…</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composer */}
              <div style={{borderTop:`1px solid ${T.border}`, background:T.surface, flexShrink:0}}>
                {/* Template chips */}
                <div style={{padding:'10px 14px 6px', display:'flex', gap:6, flexWrap:'wrap', borderBottom:`1px solid ${T.border}`}}>
                  {SMS_TEMPLATES.map(tpl => (
                    <button key={tpl.key} type="button"
                      onClick={() => setDraft(fillSms(tpl.body, openName, ''))}
                      style={{height:24, padding:'0 9px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer', flexShrink:0}}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.yellow; e.currentTarget.style.color = T.yellow; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderStrong; e.currentTarget.style.color = T.textSubtle; }}>
                      {tpl.label}
                    </button>
                  ))}
                </div>

                {/* Error */}
                {sendError && (
                  <div style={{padding:'6px 14px', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems, letterSpacing:'0.08em', background:`${T.redSystems}08`, borderBottom:`1px solid ${T.border}`}}>
                    ⚠ {sendError}
                  </div>
                )}

                {/* Input row */}
                <div style={{padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-end'}}>
                  <div style={{flex:1, position:'relative'}}>
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={e => { setDraft(e.target.value); setSendError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder="Type a text… (Enter to send · Shift+Enter = new line)"
                      maxLength={1600}
                      rows={2}
                      style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, resize:'none', outline:'none', lineHeight:1.55, boxSizing:'border-box'}}
                    />
                    <div style={{position:'absolute', bottom:6, right:10, fontFamily:'JetBrains Mono,monospace', fontSize:8.5, color:T.textFaint, letterSpacing:'0.04em', pointerEvents:'none'}}>
                      {draft.length}/1600
                    </div>
                  </div>
                  <button type="button" onClick={send} disabled={!draft.trim() || sending}
                    style={{height:42, padding:'0 18px', background:draft.trim()&&!sending?T.yellow:'#2a2a2a', border:'none', color:draft.trim()&&!sending?'#000':T.textFaint, fontFamily:'Teko,sans-serif', fontSize:13, fontWeight:600, letterSpacing:'0.18em', cursor:draft.trim()&&!sending?'pointer':'not-allowed', flexShrink:0}}>
                    {sending ? '…' : 'SEND'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── New Text Modal ─────────────────────────────────────────────── */}
      {showNewModal && (
        <div onClick={() => setShowNewModal(false)}
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:T.surface, border:`1px solid ${T.borderStrong}`, width:'100%', maxWidth:480, maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden'}}>

            {/* Header */}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:20, letterSpacing:'0.16em', color:T.text, textTransform:'uppercase'}}>New Text</div>
              <button onClick={() => setShowNewModal(false)} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontSize:20, lineHeight:1, padding:'2px 6px'}}>×</button>
            </div>

            <div style={{overflowY:'auto', flex:1, padding:20, display:'flex', flexDirection:'column', gap:16}}>

              {/* Direct phone entry */}
              <div>
                <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.24em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:6}}>
                  Phone Number
                </label>
                <div style={{display:'flex', gap:8}}>
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                    placeholder="+1 (555) 555-5555"
                    style={{flex:1, padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'JetBrains Mono,monospace', fontSize:13, outline:'none'}}
                    onKeyDown={e => { if (e.key === 'Enter' && newPhone.trim()) startNewConvo(newPhone.trim(), newName || newPhone.trim()); }}
                  />
                  <button type="button" onClick={() => newPhone.trim() && startNewConvo(newPhone.trim(), newName || newPhone.trim())}
                    disabled={!newPhone.trim()}
                    style={{height:38, padding:'0 14px', background:newPhone.trim()?T.yellow:'#2a2a2a', border:'none', color:newPhone.trim()?'#000':T.textFaint, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', cursor:newPhone.trim()?'pointer':'not-allowed'}}>
                    START
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div style={{flex:1, height:1, background:T.border}}/>
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.14em', textTransform:'uppercase'}}>or search account</span>
                <div style={{flex:1, height:1, background:T.border}}/>
              </div>

              {/* Account search */}
              <div>
                <label style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.24em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:6}}>
                  Search Account
                </label>
                <div style={{position:'relative'}}>
                  <input value={newOrgQuery} onChange={e => { setNewOrgQuery(e.target.value); setNewOrgContacts([]); }}
                    placeholder="Dispensary name…"
                    style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', boxSizing:'border-box'}}
                  />
                  {newOrgResults.length > 0 && (
                    <div style={{position:'absolute', top:'100%', left:0, right:0, background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                      {newOrgResults.map((r: any) => (
                        <button key={r.id} type="button" onClick={() => selectNewOrg(r)}
                          style={{display:'block', width:'100%', padding:'10px 14px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', color:T.text}}
                          onMouseEnter={e => (e.currentTarget.style.background = T.bg)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.06em', textTransform:'uppercase'}}>{r.name}</div>
                          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.04em', marginTop:1}}>{[r.market_state, r.city].filter(Boolean).join(' · ')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Account contacts with phones */}
              {newOrgContacts.length > 0 && (
                <div>
                  <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.24em', color:T.textFaint, textTransform:'uppercase', marginBottom:8}}>
                    Select Contact
                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:6}}>
                    {newOrgContacts.map((c: any) => {
                      const phone = c.phone || c.mobile;
                      const name = c.full_name || `${c.first_name||''} ${c.last_name||''}`.trim() || 'Unknown';
                      const jobTitle = c.job_title || (c.roles?.length ? c.roles.map((r: string) => ({purchasing:'Purchasing',marketing:'Marketing',management:'Management',budtender:'Budtender',billing:'Billing',owner:'Owner'})[r]||r).join(' · ') : null);
                      return (
                        <button key={c.id} type="button"
                          disabled={!phone}
                          onClick={() => phone && startNewConvo(phone, name)}
                          style={{padding:'10px 14px', background:T.bg, border:`1px solid ${T.borderStrong}`, textAlign:'left', cursor:phone?'pointer':'not-allowed', opacity:phone?1:0.4}}
                          onMouseEnter={e => { if (phone) e.currentTarget.style.borderColor = T.yellow; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T.borderStrong; }}>
                          <div style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.08em', color:T.text, textTransform:'uppercase', marginBottom:2}}>{name}</div>
                          {jobTitle && <div style={{fontFamily:'Inter,sans-serif', fontSize:11, color:T.textSubtle, marginBottom:3}}>{jobTitle}</div>}
                          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:phone?T.cyan:T.textFaint, letterSpacing:'0.04em'}}>
                            {phone || 'no phone on file'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </SalesFloorLayout>
  );
}
