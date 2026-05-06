/**
 * app/routes/sales-staging.issues.tsx
 * /sales-staging/issues — Customer Issue Tracker
 *
 * Top: REPORT CUSTOMER ISSUE form (account search, type, severity, description)
 * Bottom: ISSUE LOG with ALL / OPEN / RESOLVED filter tabs + resolve button
 *
 * Data stored in Supabase `customer_issues` table via /api/sf-issues.
 * No Zoho — production wrote a best-effort Zoho note; staging drops that.
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher} from '@remix-run/react';
import {useState, useEffect, useRef} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'Issues | Sales Floor'},
  {name: 'robots', content: 'noindex'},
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:'#0A0A0A', surface:'#141414', surfaceElev:'#1A1A1A',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F5F5F5', textMuted:'#C8C8C8', textSubtle:'#9C9C9C', textFaint:'#6A6A6A',
  yellow:'#FFD500', cyan:'#00D4FF', green:'#00E676',
  redSystems:'#FF3355', statusWarn:'#FFB300', magenta:'#FF3B7F',
};

const ISSUE_TYPES = [
  'Product Quality', 'Delivery Problem', 'Wrong Order',
  'Pricing Dispute', 'Out of Stock', 'Account Relationship', 'Other',
];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const SEV_COLOR: Record<string,string> = {
  Critical: T.redSystems, High: T.statusWarn, Medium: T.cyan, Low: T.green,
};
const STATUS_COLOR: Record<string,string> = {
  Open: T.statusWarn, Resolved: T.green,
};

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/customer_issues?order=created_at.desc&limit=200`,
    {headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`}},
  );
  const issues = res.ok ? await res.json().catch(() => []) : [];

  return json({sfUser, issues: Array.isArray(issues) ? issues : []});
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function IssuesPage() {
  const {sfUser, issues: initialIssues} = useLoaderData<typeof loader>() as any;

  const [issues, setIssues] = useState<any[]>(initialIssues || []);
  const [statusFilter, setStatusFilter] = useState<'all'|'open'|'resolved'>('all');

  const createFetcher  = useFetcher();
  const resolveFetcher = useFetcher();

  // Form state
  const [orgQuery,    setOrgQuery]    = useState('');
  const [orgResults,  setOrgResults]  = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<{id:string;name:string}|null>(null);
  const [contact,     setContact]     = useState('');
  const [issueType,   setIssueType]   = useState('');
  const [severity,    setSeverity]    = useState('Medium');
  const [description, setDescription] = useState('');
  const [dateOfIssue, setDateOfIssue] = useState(new Date().toISOString().split('T')[0]);
  const [submitted,   setSubmitted]   = useState(false);
  const searchDebounce = useRef<any>(null);

  const reporter = sfUser?.permissions?.display_name || 'Sky Lima';

  // Debounced account search
  useEffect(() => {
    if (orgQuery.length < 2) { setOrgResults([]); return; }
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      const r = await fetch(`/api/org-search?q=${encodeURIComponent(orgQuery)}`);
      const d = await r.json();
      setOrgResults(d.results || []);
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [orgQuery]);

  // On successful create
  useEffect(() => {
    const d = createFetcher.data as any;
    if (d?.ok && d?.issue) {
      setIssues(prev => [d.issue, ...prev]);
      // Reset form
      setSelectedOrg(null); setOrgQuery(''); setContact('');
      setIssueType(''); setSeverity('Medium'); setDescription('');
      setDateOfIssue(new Date().toISOString().split('T')[0]);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    }
  }, [createFetcher.data]);

  // On successful resolve
  useEffect(() => {
    const d = resolveFetcher.data as any;
    if (d?.ok) {
      // Optimistically update the issue in state
      const resolvedId = (resolveFetcher.formData as any)?.get('id');
      setIssues(prev => prev.map(i =>
        i.id === resolvedId
          ? {...i, status:'Resolved', resolved_at: new Date().toISOString()}
          : i
      ));
    }
  }, [resolveFetcher.data]);

  const canSubmit = selectedOrg && issueType && description.trim() && dateOfIssue;
  const saving = createFetcher.state !== 'idle';

  const filtered = issues.filter(i => {
    if (statusFilter === 'open') return i.status !== 'Resolved';
    if (statusFilter === 'resolved') return i.status === 'Resolved';
    return true;
  });

  const openCount = issues.filter(i => i.status !== 'Resolved').length;

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'9px 12px', background:T.bg,
    border:`1px solid ${T.borderStrong}`, color:T.text,
    fontFamily:'Inter,sans-serif', fontSize:12, outline:'none',
    boxSizing:'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.24em',
    color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:5,
  };

  return (
    <SalesFloorLayout current="Issues" sfUser={sfUser}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="hs-sweep" style={{padding:'20px 28px 0', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:16}}>
          <div>
            <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', lineHeight:1}}>Issues</h1>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, marginTop:4, letterSpacing:'0.12em'}}>
              Log it, solve it, keep it moving.
            </div>
          </div>
          {openCount > 0 && (
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.statusWarn, letterSpacing:'0.12em', paddingBottom:16}}>
              {openCount} open
            </div>
          )}
        </div>
      </div>

      <div style={{padding:'24px 28px', display:'flex', flexDirection:'column', gap:28, maxWidth:960}}>

        {/* ── REPORT FORM ───────────────────────────────────────────── */}
        <div style={{background:T.surface, border:`1px solid ${T.borderStrong}`}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.22em', color:T.text, textTransform:'uppercase'}}>
              Report Customer Issue
            </div>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.10em'}}>
              Under 60 seconds — log it, move on.
            </div>
          </div>

          <div style={{padding:'20px'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>

              {/* Account Name */}
              <div>
                <label style={labelStyle}>Account Name</label>
                <div style={{position:'relative'}}>
                  <input
                    value={selectedOrg ? selectedOrg.name : orgQuery}
                    onChange={e => {
                      if (selectedOrg) { setSelectedOrg(null); setOrgQuery(e.target.value); }
                      else setOrgQuery(e.target.value);
                    }}
                    placeholder="— Select account —"
                    style={inputStyle}
                  />
                  {orgResults.length > 0 && !selectedOrg && (
                    <div style={{position:'absolute', top:'100%', left:0, right:0, background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                      {orgResults.map((r:any) => (
                        <button key={r.id} type="button"
                          onClick={() => { setSelectedOrg({id:r.id, name:r.name}); setOrgQuery(''); setOrgResults([]); }}
                          style={{display:'block', width:'100%', padding:'10px 14px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', color:T.text}}
                          onMouseEnter={e=>(e.currentTarget.style.background=T.bg)}
                          onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          <div style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.06em', textTransform:'uppercase'}}>{r.name}</div>
                          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.04em', marginTop:1}}>
                            {[r.market_state, r.city].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Name */}
              <div>
                <label style={labelStyle}>Contact Name at Account</label>
                <input value={contact} onChange={e=>setContact(e.target.value)}
                  placeholder="e.g. Jane Smith" style={inputStyle}/>
              </div>

              {/* Reported By */}
              <div>
                <label style={labelStyle}>Reported By</label>
                <input value={reporter} readOnly
                  style={{...inputStyle, color:T.textSubtle, cursor:'default'}}/>
              </div>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>

              {/* Issue Type */}
              <div>
                <label style={labelStyle}>Issue Type</label>
                <select value={issueType} onChange={e=>setIssueType(e.target.value)}
                  style={{...inputStyle, cursor:'pointer'}}>
                  <option value="">— Select type —</option>
                  {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Severity */}
              <div>
                <label style={labelStyle}>Severity</label>
                <select value={severity} onChange={e=>setSeverity(e.target.value)}
                  style={{...inputStyle, cursor:'pointer', color: SEV_COLOR[severity] || T.text}}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date of Issue</label>
                <input type="date" value={dateOfIssue} onChange={e=>setDateOfIssue(e.target.value)}
                  style={{...inputStyle, colorScheme:'dark'}}/>
              </div>
            </div>

            {/* Description */}
            <div style={{marginBottom:16}}>
              <label style={labelStyle}>
                Issue Description{' '}
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.06em', textTransform:'none'}}>
                  — 3–4 sentences max
                </span>
              </label>
              <textarea value={description} onChange={e=>setDescription(e.target.value)}
                rows={4} maxLength={600}
                placeholder="What happened? When did it occur? What's the customer impact?"
                style={{...inputStyle, resize:'vertical', lineHeight:1.6}}/>
            </div>

            {/* Submit */}
            {submitted ? (
              <div style={{height:46, display:'flex', alignItems:'center', justifyContent:'center', background:`${T.green}18`, border:`1px solid ${T.green}`, fontFamily:'Teko,sans-serif', fontSize:16, letterSpacing:'0.20em', color:T.green}}>
                ✓ ISSUE LOGGED
              </div>
            ) : (
              <createFetcher.Form method="post" action="/api/sf-issues" onSubmit={e => {
                if (!canSubmit) { e.preventDefault(); return; }
              }}>
                <input type="hidden" name="intent" value="create"/>
                <input type="hidden" name="org_id" value={selectedOrg?.id || ''}/>
                <input type="hidden" name="org_name" value={selectedOrg?.name || ''}/>
                <input type="hidden" name="contact_name" value={contact}/>
                <input type="hidden" name="issue_type" value={issueType}/>
                <input type="hidden" name="severity" value={severity}/>
                <input type="hidden" name="description" value={description}/>
                <input type="hidden" name="date_of_issue" value={dateOfIssue}/>
                <input type="hidden" name="reporter" value={reporter}/>
                <button type="submit" disabled={!canSubmit || saving}
                  style={{width:'100%', height:46, background:canSubmit&&!saving?T.yellow:'#2a2a2a', border:'none', color:canSubmit&&!saving?'#000':T.textFaint, fontFamily:'Teko,sans-serif', fontSize:16, fontWeight:600, letterSpacing:'0.22em', textTransform:'uppercase', cursor:canSubmit&&!saving?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', gap:10}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3v18M5 4h12l-2 4 2 4H5"/></svg>
                  {saving ? 'LOGGING…' : 'LOG ISSUE'}
                </button>
              </createFetcher.Form>
            )}
            {(createFetcher.data as any)?.error && (
              <div style={{marginTop:8, fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.redSystems, letterSpacing:'0.08em'}}>
                ⚠ {(createFetcher.data as any).error}
              </div>
            )}
          </div>
        </div>

        {/* ── ISSUE LOG ─────────────────────────────────────────────── */}
        <div style={{background:T.surface, border:`1px solid ${T.borderStrong}`}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.22em', color:T.text, textTransform:'uppercase'}}>
              Issue Log
            </div>
            {/* Filter tabs */}
            <div style={{display:'flex', gap:4}}>
              {(['all','open','resolved'] as const).map(f => {
                const active = statusFilter === f;
                const label  = f === 'all' ? `ALL` : f === 'open' ? `OPEN` : `RESOLVED`;
                const count  = f === 'open' ? openCount : f === 'resolved' ? issues.filter(i=>i.status==='Resolved').length : issues.length;
                return (
                  <button key={f} type="button" onClick={() => setStatusFilter(f)}
                    style={{height:30, padding:'0 12px', border:`1px solid ${active?T.yellow:T.borderStrong}`, background:active?`${T.yellow}12`:'transparent', color:active?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.16em', cursor:'pointer', display:'flex', alignItems:'center', gap:6}}>
                    {label}
                    <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:active?T.yellow:T.textFaint}}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{padding:'40px 20px', textAlign:'center', fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.10em'}}>
              {statusFilter === 'open' ? 'No open issues.' : statusFilter === 'resolved' ? 'No resolved issues yet.' : 'No issues logged yet.'}
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              {/* Header row */}
              <div style={{display:'grid', gridTemplateColumns:'100px 1fr 160px 90px 90px 100px 100px', gap:0, padding:'8px 20px', borderBottom:`1px solid ${T.border}`, background:T.bg}}>
                {['TICKET','ACCOUNT · CONTACT','TYPE','SEVERITY','STATUS','DATE',''].map((h,i) => (
                  <div key={i} style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.22em', color:T.textFaint, textTransform:'uppercase'}}>{h}</div>
                ))}
              </div>
              {/* Issue rows */}
              {filtered.map((issue:any) => {
                const sevColor    = SEV_COLOR[issue.severity] || T.textSubtle;
                const statColor   = STATUS_COLOR[issue.status] || T.textSubtle;
                const isResolving = resolveFetcher.state !== 'idle' && (resolveFetcher.formData as any)?.get('id') === issue.id;
                return (
                  <div key={issue.id} className="order-row"
                    style={{display:'grid', gridTemplateColumns:'100px 1fr 160px 90px 90px 100px 100px', gap:0, padding:'13px 20px', borderBottom:`1px solid ${T.border}`, alignItems:'center', background:T.surface}}>

                    {/* Ticket */}
                    <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.yellow, letterSpacing:'0.08em'}}>{issue.ticket_id}</div>

                    {/* Account · Contact */}
                    <div>
                      <div style={{fontFamily:'Inter,sans-serif', fontSize:13, color:T.text}}>{issue.org_name || '—'}</div>
                      {issue.contact_name && (
                        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.04em', marginTop:1}}>{issue.contact_name}</div>
                      )}
                    </div>

                    {/* Type */}
                    <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textMuted}}>{issue.issue_type}</div>

                    {/* Severity */}
                    <div style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', color:sevColor, textTransform:'uppercase'}}>{issue.severity}</div>

                    {/* Status */}
                    <div style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', color:statColor, textTransform:'uppercase'}}>{issue.status}</div>

                    {/* Date */}
                    <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.04em'}}>
                      {issue.date_of_issue
                        ? new Date(issue.date_of_issue + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})
                        : '—'}
                    </div>

                    {/* Resolve */}
                    <div>
                      {issue.status !== 'Resolved' && (
                        <resolveFetcher.Form method="post" action="/api/sf-issues" style={{display:'inline'}}>
                          <input type="hidden" name="intent" value="resolve"/>
                          <input type="hidden" name="id" value={issue.id}/>
                          <button type="submit" disabled={isResolving}
                            style={{height:26, padding:'0 10px', background:'transparent', border:`1px solid ${T.green}66`, color:T.green, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer'}}>
                            {isResolving ? '…' : '✓ RESOLVE'}
                          </button>
                        </resolveFetcher.Form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SalesFloorLayout>
  );
}
