/**
 * app/routes/sales-staging.account.$id.tsx
 *
 * /sales-staging/account/:id — Account detail
 * Full read + inline edit + onboarding toggles + note add/delete
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link, useRevalidator} from '@remix-run/react';
import {useState, useRef, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction<typeof loader> = ({data}) => [
  {title: `${(data as any)?.org?.name || 'Account'} | Sales Staging`},
  {name: 'robots', content: 'noindex, nofollow'},
];

export async function loader({request, context, params}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({authenticated: false, org: null, contacts: [], notes: [], steps: []});
  }
  const id = params.id!;
  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;
  const [orgRes, notesRes, stepsRes] = await Promise.all([
    fetch(`${base}/rest/v1/organizations?id=eq.${id}&select=*,contacts(*)`, {headers: h}),
    fetch(`${base}/rest/v1/org_notes?organization_id=eq.${id}&order=created_at.desc&limit=100`, {headers: h}),
    fetch(`${base}/rest/v1/onboarding_steps?organization_id=eq.${id}&order=step_key.asc`, {headers: h}),
  ]);
  const [orgRows, notes, steps] = await Promise.all([orgRes.json(), notesRes.json(), stepsRes.json()]);
  const org = orgRows?.[0] || null;
  return json({authenticated: true, org, contacts: org?.contacts || [], notes: Array.isArray(notes) ? notes : [], steps: Array.isArray(steps) ? steps : []});
}

// ── Constants ──────────────────────────────────────────────────────────────

const LC_OPTIONS = ['active','untargeted','churned','dormant','contacted','qualified','sample_sent','first_order_pending','reorder_due'];
const TIER_OPTIONS = ['', 'A', 'B', 'C'];
const REORDER_OPTIONS = ['ok', 'due', 'overdue'];
const ONBOARDING_STEPS = [
  {key: 'visual_merch_shipped',    label: 'Visual Merch Shipped'},
  {key: 'menu_accuracy_confirmed', label: 'Menu Accuracy Confirmed'},
  {key: 'store_locator_confirmed', label: 'Store Locator Confirmed'},
  {key: 'digital_assets_sent',     label: 'Digital Assets Sent'},
];

// ── Component ──────────────────────────────────────────────────────────────

export default function AccountDetail() {
  const {authenticated, org, contacts, notes, steps} = useLoaderData<typeof loader>() as any;
  const revalidator = useRevalidator();

  if (!authenticated) return <Redirect />;
  if (!org) return <NotFound />;

  return (
    <div style={{minHeight:'100vh',background:'#000',color:'#fff',fontFamily:"'Inter',sans-serif"}}>
      {/* Header */}
      <div style={{background:'#0a0a0a',borderBottom:'1px solid rgba(255,255,255,0.08)',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',minWidth:0}}>
          <Link to="/sales-staging" style={{color:'#555',fontSize:'13px',textDecoration:'none',whiteSpace:'nowrap',flexShrink:0}}>← Accounts</Link>
          <span style={{color:'#333'}}>|</span>
          <span style={{fontFamily:"'Teko',sans-serif",fontSize:'22px',fontWeight:700,color:'#c8a84b',letterSpacing:'0.06em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {org.name}
          </span>
          <LifecycleBadge lc={org.lifecycle_stage} />
          {org.tier && <TierBadge tier={org.tier} />}
          {org.risk_of_loss && <span style={{background:'rgba(220,38,38,0.15)',color:'#dc2626',borderRadius:'4px',padding:'2px 7px',fontSize:'10px',fontWeight:700}}>RISK</span>}
        </div>
        <span style={{fontSize:'11px',color:'#333',flexShrink:0}}>Zoho: {org.zoho_account_id || '—'}</span>
      </div>

      <div style={{maxWidth:'1200px',margin:'0 auto',padding:'20px 24px',display:'grid',gridTemplateColumns:'1fr 320px',gap:'20px',alignItems:'start'}}>
        {/* ── Left column ── */}
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>

          {/* Details card with inline editing */}
          <Card title="Details">
            <DetailsForm org={org} onSaved={revalidator.revalidate} />
          </Card>

          {/* Notes */}
          <Card title={`Notes (${notes.length})`} action={<AddNoteForm orgId={org.id} onAdded={revalidator.revalidate} />}>
            {notes.length === 0
              ? <p style={{color:'#555',fontSize:'13px',margin:0}}>No notes yet.</p>
              : notes.map((n: any) => <NoteRow key={n.id} note={n} onDeleted={revalidator.revalidate} />)
            }
          </Card>
        </div>

        {/* ── Right column ── */}
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>

          {/* Quick actions */}
          <Card title="Actions">
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {org.phone && <>
                <ActionLink href={`tel:${org.phone}`} color="#22C55E">📞 Call {org.name}</ActionLink>
                <ActionLink href={`sms:${org.phone}`} color="#3b82f6">💬 Text {org.name}</ActionLink>
              </>}
              {contacts[0]?.email && <ActionLink href={`mailto:${contacts[0].email}`} color="#a78bfa">✉️ Email {contacts[0].full_name || contacts[0].first_name}</ActionLink>}
            </div>
          </Card>

          {/* Contacts */}
          <Card title={`Contacts (${contacts.length})`}>
            {contacts.length === 0
              ? <p style={{color:'#555',fontSize:'13px',margin:0}}>No contacts.</p>
              : contacts.map((c: any) => <ContactRow key={c.id} contact={c} />)
            }
          </Card>

          {/* Onboarding steps */}
          <Card title="Onboarding">
            <OnboardingSteps orgId={org.id} steps={steps} onToggled={revalidator.revalidate} />
          </Card>

        </div>
      </div>
    </div>
  );
}

// ── Details form with inline editing ─────────────────────────────────────

function DetailsForm({org, onSaved}: {org: any; onSaved: () => void}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'0'}}>
      {/* Status row */}
      <SectionLabel>Status</SectionLabel>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
        <EditableSelect label="Lifecycle" field="lifecycle_stage" value={org.lifecycle_stage} orgId={org.id} options={LC_OPTIONS} onSaved={onSaved} />
        <EditableSelect label="Tier" field="tier" value={org.tier || ''} orgId={org.id} options={TIER_OPTIONS} onSaved={onSaved} />
        <EditableSelect label="Reorder Status" field="reorder_status" value={org.reorder_status} orgId={org.id} options={REORDER_OPTIONS} onSaved={onSaved} />
        <EditableText label="Last Order Date" field="last_order_date" value={org.last_order_date} orgId={org.id} onSaved={onSaved} hint="YYYY-MM-DD" />
      </div>

      {/* Contact row */}
      <SectionLabel>Contact</SectionLabel>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
        <EditableText label="Phone" field="phone" value={org.phone} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Website" field="website" value={org.website} orgId={org.id} onSaved={onSaved} href={org.website} />
        <EditableText label="Payment Terms" field="payment_terms" value={org.payment_terms} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Budtenders" field="budtender_count" value={org.budtender_count} orgId={org.id} onSaved={onSaved} />
      </div>

      {/* Address */}
      <SectionLabel>Address</SectionLabel>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'10px',marginBottom:'14px'}}>
        <EditableText label="Street Address" field="street_address" value={org.street_address} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Zip" field="zip" value={org.zip} orgId={org.id} onSaved={onSaved} />
        <EditableText label="City" field="city" value={org.city} orgId={org.id} onSaved={onSaved} />
        <EditableText label="State" field="market_state" value={org.market_state} orgId={org.id} onSaved={onSaved} />
      </div>

      {/* Compliance */}
      <SectionLabel>Compliance</SectionLabel>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
        <EditableText label="License #" field="license_number" value={org.license_number} orgId={org.id} onSaved={onSaved} />
        <EditableText label="EIN" field="ein" value={org.ein} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Legal Name" field="legal_name" value={org.legal_name} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Preferred Contact" field="preferred_contact_channel" value={org.preferred_contact_channel} orgId={org.id} onSaved={onSaved} hint="call / text / email" />
      </div>

      {/* Pop-ups & Training */}
      <SectionLabel>Pop-ups & Training</SectionLabel>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
        <EditableText label="Pop-up Email" field="pop_up_email" value={org.pop_up_email} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Pop-up Link" field="pop_up_link" value={org.pop_up_link} orgId={org.id} onSaved={onSaved} href={org.pop_up_link} />
        <EditableText label="Last Pop-up Date" field="last_pop_up_date" value={org.last_pop_up_date} orgId={org.id} onSaved={onSaved} hint="YYYY-MM-DD" />
        <EditableText label="Training Email" field="staff_training_email" value={org.staff_training_email} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Training Link" field="staff_training_link" value={org.staff_training_link} orgId={org.id} onSaved={onSaved} href={org.staff_training_link} />
        <EditableText label="Last Training Date" field="last_staff_training_date" value={org.last_staff_training_date} orgId={org.id} onSaved={onSaved} hint="YYYY-MM-DD" />
      </div>

      {/* Ops */}
      <SectionLabel>Operations</SectionLabel>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
        <EditableText label="Online Menus" field="online_menus" value={org.online_menus?.join(', ')} orgId={org.id} onSaved={onSaved} hint="Comma-separated" />
        <EditableText label="Reorder Cadence (days)" field="reorder_cadence_days" value={org.reorder_cadence_days} orgId={org.id} onSaved={onSaved} />
        <EditableText label="Tags" field="tags" value={org.tags?.join(', ')} orgId={org.id} onSaved={onSaved} hint="Comma-separated" />
        <EditableToggle label="Allow Split Promos" field="allow_split_promos" value={org.allow_split_promos} orgId={org.id} onSaved={onSaved} />
        <EditableToggle label="Do Not Contact" field="do_not_contact" value={org.do_not_contact} orgId={org.id} onSaved={onSaved} />
        <EditableToggle label="Sparkplug" field="sparkplug_enabled" value={org.sparkplug_enabled} orgId={org.id} onSaved={onSaved} />
      </div>
    </div>
  );
}

// ── Editable field components ─────────────────────────────────────────────

function EditableText({label, field, value, orgId, onSaved, href, hint}: {
  label: string; field: string; value: any; orgId: string; onSaved: () => void; href?: string; hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const fetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft === String(value ?? '')) return;
    const fd = new FormData();
    fd.set('intent', 'patch_field'); fd.set('org_id', orgId);
    fd.set('field', field); fd.set('value', draft);
    fetcher.submit(fd, {method: 'post', action: '/api/org-update'});
    onSaved();
  };

  const displayVal = value ?? '';

  return (
    <div>
      <div style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'#555',marginBottom:'3px'}}>{label}</div>
      {editing ? (
        <div style={{display:'flex',gap:'4px'}}>
          <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') save(); if (e.key==='Escape') { setEditing(false); setDraft(String(value??'')); } }}
            placeholder={hint || ''}
            style={{flex:1,background:'#1a1a1a',border:'1px solid #c8a84b',borderRadius:'4px',color:'#fff',fontSize:'13px',padding:'4px 8px',outline:'none'}} />
          <button onClick={save} style={{background:'#c8a84b',border:'none',borderRadius:'4px',color:'#000',fontWeight:700,fontSize:'11px',padding:'4px 8px',cursor:'pointer'}}>✓</button>
          <button onClick={() => { setEditing(false); setDraft(String(value??'')); }} style={{background:'#222',border:'none',borderRadius:'4px',color:'#666',fontSize:'11px',padding:'4px 8px',cursor:'pointer'}}>✕</button>
        </div>
      ) : (
        <div onClick={() => { setEditing(true); setDraft(String(value??'')); }}
          style={{fontSize:'13px',color: displayVal ? '#ddd' : '#444',cursor:'text',padding:'3px 6px',marginLeft:'-6px',borderRadius:'4px',minHeight:'22px',
            outline: fetcher.state==='submitting' ? '1px solid #c8a84b44' : 'none'}}
          title="Click to edit"
        >
          {displayVal
            ? (href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{color:'#60a5fa',textDecoration:'none'}} onClick={e => e.stopPropagation()}>{String(displayVal)}</a> : String(displayVal))
            : <span style={{color:'#333',fontStyle:'italic'}}>—</span>
          }
        </div>
      )}
    </div>
  );
}

function EditableSelect({label, field, value, orgId, onSaved, options}: {
  label: string; field: string; value: any; orgId: string; onSaved: () => void; options: string[];
}) {
  const fetcher = useFetcher();
  const save = (newVal: string) => {
    if (newVal === String(value ?? '')) return;
    const fd = new FormData();
    fd.set('intent','patch_field'); fd.set('org_id', orgId);
    fd.set('field', field); fd.set('value', newVal);
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
    onSaved();
  };
  return (
    <div>
      <div style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'#555',marginBottom:'3px'}}>{label}</div>
      <select value={String(value??'')} onChange={e => save(e.target.value)}
        style={{width:'100%',background:'#111',border:'1px solid #333',borderRadius:'4px',color:'#ddd',fontSize:'13px',padding:'4px 8px',outline:'none',cursor:'pointer'}}>
        {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    </div>
  );
}

function EditableToggle({label, field, value, orgId, onSaved}: {
  label: string; field: string; value: boolean; orgId: string; onSaved: () => void;
}) {
  const fetcher = useFetcher();
  const toggle = () => {
    const fd = new FormData();
    fd.set('intent','patch_field'); fd.set('org_id', orgId);
    fd.set('field', field); fd.set('value', String(!value));
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
    onSaved();
  };
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'#555'}}>{label}</div>
      <button onClick={toggle}
        style={{background: value ? 'rgba(239,68,68,0.2)' : '#1a1a1a', border: `1px solid ${value ? '#dc2626' : '#333'}`,
          borderRadius:'4px', color: value ? '#dc2626' : '#666', fontSize:'12px', padding:'3px 10px', cursor:'pointer', fontWeight:600}}>
        {value ? 'YES' : 'NO'}
      </button>
    </div>
  );
}

// ── Onboarding steps ──────────────────────────────────────────────────────

function OnboardingSteps({orgId, steps, onToggled}: {orgId: string; steps: any[]; onToggled: () => void}) {
  const fetcher = useFetcher();
  const stepsMap = new Map(steps.map((s: any) => [s.step_key, s]));

  const toggle = (key: string) => {
    const current = stepsMap.get(key)?.status || 'not_started';
    const newStatus = current === 'complete' ? 'not_started' : 'complete';
    const fd = new FormData();
    fd.set('intent','toggle_onboarding'); fd.set('org_id', orgId);
    fd.set('step_key', key); fd.set('status', newStatus);
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
    onToggled();
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
      {ONBOARDING_STEPS.map(({key, label}) => {
        const step = stepsMap.get(key);
        const done = step?.status === 'complete';
        return (
          <button key={key} onClick={() => toggle(key)}
            style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background: done ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
              border:`1px solid ${done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,borderRadius:'6px',cursor:'pointer',textAlign:'left'}}>
            <span style={{fontSize:'13px',color: done ? '#86efac' : '#aaa'}}>{label}</span>
            <span style={{fontSize:'11px',fontWeight:700,color: done ? '#22C55E' : '#555'}}>
              {done ? '✓ DONE' : 'TO DO'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Note row with delete ──────────────────────────────────────────────────

function NoteRow({note, onDeleted}: {note: any; onDeleted: () => void}) {
  const fetcher = useFetcher();
  const [confirming, setConfirming] = useState(false);

  const deleteNote = () => {
    const fd = new FormData();
    fd.set('intent','delete_note'); fd.set('org_id', note.organization_id); fd.set('note_id', note.id);
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
    onDeleted();
  };

  return (
    <div style={{borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'12px',marginBottom:'12px',position:'relative'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'4px',gap:'8px'}}>
        <div>
          <span style={{fontSize:'12px',fontWeight:600,color:'#aaa'}}>{note.author_name}</span>
          {note.pinned && <span style={{marginLeft:'6px',fontSize:'10px',color:'#c8a84b'}}>📌</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
          <span style={{fontSize:'11px',color:'#555'}}>{new Date(note.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
          {!confirming
            ? <button onClick={() => setConfirming(true)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',fontSize:'12px',padding:'0 4px'}} title="Delete">✕</button>
            : <div style={{display:'flex',gap:'4px'}}>
                <button onClick={deleteNote} style={{background:'rgba(239,68,68,0.2)',border:'1px solid #dc2626',borderRadius:'3px',color:'#dc2626',cursor:'pointer',fontSize:'11px',padding:'1px 6px'}}>Delete</button>
                <button onClick={() => setConfirming(false)} style={{background:'none',border:'1px solid #333',borderRadius:'3px',color:'#666',cursor:'pointer',fontSize:'11px',padding:'1px 6px'}}>Cancel</button>
              </div>
          }
        </div>
      </div>
      <p style={{margin:0,fontSize:'13px',color:'#ccc',whiteSpace:'pre-wrap',lineHeight:1.55}}>{note.body}</p>
    </div>
  );
}

// ── Add note form ─────────────────────────────────────────────────────────

function AddNoteForm({orgId, onAdded}: {orgId: string; onAdded: () => void}) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');

  const submit = () => {
    if (!body.trim()) return;
    const fd = new FormData();
    fd.set('org_id', orgId); fd.set('body', body);
    fetcher.submit(fd, {method:'post', action:'/api/org-note-add'});
    setBody(''); setOpen(false); onAdded();
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{background:'none',border:'1px solid #333',borderRadius:'6px',padding:'4px 12px',color:'#888',fontSize:'12px',cursor:'pointer'}}>
      + Add note
    </button>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'6px',width:'260px'}}>
      <textarea value={body} onChange={e => setBody(e.target.value)} autoFocus rows={3}
        onKeyDown={e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) submit(); }}
        placeholder="Note… (⌘↵ to save)"
        style={{background:'#111',border:'1px solid #444',borderRadius:'6px',padding:'8px 10px',color:'#fff',fontSize:'13px',resize:'vertical',outline:'none'}} />
      <div style={{display:'flex',gap:'6px'}}>
        <button onClick={submit}
          style={{padding:'5px 14px',background:'#c8a84b',border:'none',borderRadius:'5px',color:'#000',fontWeight:700,fontSize:'12px',cursor:'pointer'}}>
          Save
        </button>
        <button onClick={() => { setOpen(false); setBody(''); }}
          style={{padding:'5px 10px',background:'none',border:'1px solid #333',borderRadius:'5px',color:'#666',fontSize:'12px',cursor:'pointer'}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Small reusable components ─────────────────────────────────────────────

function ContactRow({contact: c}: {contact: any}) {
  return (
    <div style={{borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'10px',marginBottom:'10px'}}>
      <div style={{fontWeight:600,fontSize:'14px',color:'#fff',marginBottom:'2px'}}>
        {c.full_name || `${c.first_name||''} ${c.last_name||''}`.trim() || 'Unknown'}
        {c.is_primary_buyer && <span style={{marginLeft:'6px',fontSize:'10px',color:'#c8a84b'}}>★ BUYER</span>}
      </div>
      {c.job_role && <div style={{fontSize:'11px',color:'#666',marginBottom:'4px'}}>{c.job_role}</div>}
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
        {c.email && <a href={`mailto:${c.email}`} style={{fontSize:'12px',color:'#60a5fa',textDecoration:'none'}}>{c.email}</a>}
        {(c.phone||c.mobile) && <a href={`tel:${c.phone||c.mobile}`} style={{fontSize:'12px',color:'#4ade80',textDecoration:'none'}}>{c.phone||c.mobile}</a>}
      </div>
    </div>
  );
}

function Card({title, children, action}: {title: string; children: React.ReactNode; action?: React.ReactNode}) {
  return (
    <div style={{background:'#0d0d0d',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'10px',padding:'16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
        <h3 style={{margin:0,fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'#555'}}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({children}: {children: React.ReactNode}) {
  return <div style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.1em',color:'#444',fontWeight:700,marginBottom:'8px',marginTop:'4px',borderBottom:'1px solid rgba(255,255,255,0.04)',paddingBottom:'4px'}}>{children}</div>;
}

function LifecycleBadge({lc}: {lc: string}) {
  const colors: Record<string,string> = {active:'#22C55E',churned:'#6b7280',untargeted:'#444',dormant:'#f59e0b',first_order_pending:'#3b82f6'};
  const c = colors[lc] || '#666';
  return <span style={{background:`${c}18`,color:c,borderRadius:'4px',padding:'2px 7px',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>{lc.replace(/_/g,' ')}</span>;
}

function TierBadge({tier}: {tier: string}) {
  return <span style={{background:'rgba(200,168,75,0.15)',color:'#c8a84b',borderRadius:'4px',padding:'2px 7px',fontSize:'11px',fontWeight:700}}>TIER {tier}</span>;
}

function ActionLink({href, color, children}: {href: string; color: string; children: React.ReactNode}) {
  return <a href={href} style={{display:'block',padding:'9px 12px',background:`${color}14`,border:`1px solid ${color}33`,borderRadius:'6px',color,fontSize:'13px',fontWeight:600,textDecoration:'none'}}>{children}</a>;
}

function Redirect() {
  return <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center'}}><a href="/sales-staging" style={{color:'#c8a84b',textDecoration:'none'}}>← Login</a></div>;
}

function NotFound() {
  return <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'12px'}}><p style={{color:'#888'}}>Account not found</p><Link to="/sales-staging" style={{color:'#c8a84b',textDecoration:'none'}}>← Back to list</Link></div>;
}
