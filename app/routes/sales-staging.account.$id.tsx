/**
 * app/routes/sales-staging.account.$id.tsx
 *
 * /sales-staging/account/:id — Account detail (read + basic edit)
 * Reads from Supabase organizations + contacts + org_notes + onboarding_steps.
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link} from '@remix-run/react';
import {useState} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction<typeof loader> = ({data}) => [
  {title: `${(data as any)?.org?.name || 'Account'} | Sales Staging`},
  {name: 'robots', content: 'noindex, nofollow'},
];

export async function loader({request, context, params}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  if (!isStagingAuthed(cookie)) {
    return json({authenticated: false, org: null, contacts: [], notes: [], steps: []});
  }

  const id = params.id!;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
  const base = env.SUPABASE_URL;

  const [orgRes, notesRes, stepsRes] = await Promise.all([
    fetch(`${base}/rest/v1/organizations?id=eq.${id}&select=*,contacts(*)`, {headers}),
    fetch(`${base}/rest/v1/org_notes?organization_id=eq.${id}&order=created_at.desc&limit=50`, {headers}),
    fetch(`${base}/rest/v1/onboarding_steps?organization_id=eq.${id}&order=step_key.asc`, {headers}),
  ]);

  const [orgRows, notes, steps] = await Promise.all([
    orgRes.json(), notesRes.json(), stepsRes.json(),
  ]);

  const org = orgRows?.[0] || null;

  return json({
    authenticated: true,
    org,
    contacts: org?.contacts || [],
    notes: Array.isArray(notes) ? notes : [],
    steps: Array.isArray(steps) ? steps : [],
  });
}

export default function AccountDetail() {
  const {authenticated, org, contacts, notes, steps} = useLoaderData<typeof loader>() as any;

  if (!authenticated) {
    return (
      <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:'#fff',textAlign:'center'}}>
          <p style={{marginBottom:'16px',color:'#888'}}>Not authenticated</p>
          <a href="/sales-staging" style={{color:'#c8a84b',textDecoration:'none'}}>← Back to login</a>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:'#fff',textAlign:'center'}}>
          <p style={{marginBottom:'16px',color:'#888'}}>Account not found</p>
          <Link to="/sales-staging" style={{color:'#c8a84b',textDecoration:'none'}}>← Back to list</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100vh',background:'#000',color:'#fff',fontFamily:"'Inter',sans-serif"}}>
      {/* Header */}
      <div style={{background:'#0a0a0a',borderBottom:'1px solid rgba(255,255,255,0.08)',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
          <Link to="/sales-staging" style={{color:'#555',fontSize:'13px',textDecoration:'none'}}>← Accounts</Link>
          <span style={{color:'#333'}}>|</span>
          <span style={{fontFamily:"'Teko',sans-serif",fontSize:'20px',fontWeight:700,color:'#c8a84b',letterSpacing:'0.06em'}}>
            {org.name}
          </span>
          {org.tier && (
            <span style={{background:'rgba(200,168,75,0.15)',color:'#c8a84b',borderRadius:'4px',padding:'2px 8px',fontSize:'11px',fontWeight:700}}>
              TIER {org.tier}
            </span>
          )}
          <span style={{background:'rgba(34,197,94,0.1)',color:'#22C55E',borderRadius:'4px',padding:'2px 8px',fontSize:'11px',fontWeight:600,textTransform:'uppercase'}}>
            {org.lifecycle_stage}
          </span>
        </div>
        {org.zoho_account_id && (
          <span style={{fontSize:'11px',color:'#444'}}>Zoho: {org.zoho_account_id}</span>
        )}
      </div>

      <div style={{maxWidth:'1200px',margin:'0 auto',padding:'24px',display:'grid',gridTemplateColumns:'1fr 340px',gap:'24px'}}>
        {/* Left column */}
        <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
          {/* Key fields */}
          <Card title="Details">
            <Grid2>
              <Field label="Market State" value={org.market_state} />
              <Field label="City" value={org.city} />
              <Field label="Phone" value={org.phone} />
              <Field label="Website" value={org.website} href={org.website} />
              <Field label="License #" value={org.license_number} />
              <Field label="EIN" value={org.ein} />
              <Field label="Payment Terms" value={org.payment_terms} />
              <Field label="Last Order" value={org.last_order_date} />
              <Field label="Reorder Status" value={org.reorder_status} />
              <Field label="Sparkplug" value={org.sparkplug_enabled ? 'Yes' : 'No'} />
              <Field label="Online Menus" value={org.online_menus?.join(', ')} />
              <Field label="Do Not Contact" value={org.do_not_contact ? '⚠️ Yes' : 'No'} />
            </Grid2>
            {org.tags?.length > 0 && (
              <div style={{marginTop:'12px',display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {org.tags.map((t: string) => (
                  <span key={t} style={{background:'rgba(255,255,255,0.06)',borderRadius:'4px',padding:'2px 8px',fontSize:'11px',color:'#999'}}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Notes timeline */}
          <Card title={`Notes (${notes.length})`} action={<AddNoteForm orgId={org.id} />}>
            {notes.length === 0 && <p style={{color:'#555',fontSize:'13px'}}>No notes yet.</p>}
            {notes.map((n: any) => (
              <div key={n.id} style={{borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'12px',marginBottom:'12px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                  <span style={{fontSize:'12px',fontWeight:600,color:'#aaa'}}>{n.author_name}</span>
                  <span style={{fontSize:'11px',color:'#555'}}>
                    {new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  </span>
                </div>
                {n.pinned && <span style={{fontSize:'10px',color:'#c8a84b',marginBottom:'4px',display:'block'}}>📌 PINNED</span>}
                <p style={{margin:0,fontSize:'13px',color:'#ccc',whiteSpace:'pre-wrap',lineHeight:1.5}}>{n.body}</p>
              </div>
            ))}
          </Card>
        </div>

        {/* Right column */}
        <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
          {/* Contacts */}
          <Card title={`Contacts (${contacts.length})`}>
            {contacts.length === 0 && <p style={{color:'#555',fontSize:'13px'}}>No contacts.</p>}
            {contacts.map((c: any) => (
              <div key={c.id} style={{borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'10px',marginBottom:'10px'}}>
                <div style={{fontWeight:600,fontSize:'14px',color:'#fff',marginBottom:'2px'}}>
                  {c.full_name || `${c.first_name||''} ${c.last_name||''}`.trim() || 'Unknown'}
                  {c.is_primary_buyer && <span style={{marginLeft:'6px',fontSize:'10px',color:'#c8a84b'}}>★ BUYER</span>}
                </div>
                {c.job_role && <div style={{fontSize:'11px',color:'#666',marginBottom:'4px'}}>{c.job_role}</div>}
                <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                  {c.email && <a href={`mailto:${c.email}`} style={{fontSize:'12px',color:'#60a5fa',textDecoration:'none'}}>{c.email}</a>}
                  {(c.phone||c.mobile) && <a href={`tel:${c.phone||c.mobile}`} style={{fontSize:'12px',color:'#4ade80',textDecoration:'none'}}>{c.phone||c.mobile}</a>}
                </div>
              </div>
            ))}
          </Card>

          {/* Onboarding steps */}
          {steps.length > 0 && (
            <Card title="Onboarding">
              {steps.map((s: any) => (
                <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontSize:'12px',color:'#aaa',textTransform:'capitalize'}}>
                    {s.step_key.replace(/_/g,' ')}
                  </span>
                  <span style={{
                    fontSize:'11px',fontWeight:600,
                    color: s.status==='complete' ? '#22C55E' : s.status==='in_progress' ? '#f59e0b' : '#555',
                  }}>
                    {s.status.replace('_',' ').toUpperCase()}
                  </span>
                </div>
              ))}
            </Card>
          )}

          {/* Quick actions */}
          <Card title="Actions">
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {org.phone && (
                <>
                  <ActionLink href={`tel:${org.phone}`} color="#22C55E">📞 Call {org.name}</ActionLink>
                  <ActionLink href={`sms:${org.phone}`} color="#3b82f6">💬 Text {org.name}</ActionLink>
                </>
              )}
              {contacts[0]?.email && (
                <ActionLink href={`mailto:${contacts[0].email}`} color="#a78bfa">✉️ Email {contacts[0].full_name}</ActionLink>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Add Note Form ────────────────────────────────────────────────────────────

function AddNoteForm({orgId}: {orgId: string}) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{background:'none',border:'1px solid #333',borderRadius:'6px',padding:'4px 12px',color:'#888',fontSize:'12px',cursor:'pointer'}}
        >
          + Add note
        </button>
      ) : (
        <fetcher.Form
          method="post"
          action="/api/org-note-add"
          onSubmit={() => setOpen(false)}
          style={{display:'flex',flexDirection:'column',gap:'8px'}}
        >
          <input type="hidden" name="org_id" value={orgId} />
          <textarea
            name="body"
            placeholder="Note…"
            rows={3}
            autoFocus
            style={{background:'#111',border:'1px solid #333',borderRadius:'6px',padding:'8px 10px',color:'#fff',fontSize:'13px',resize:'vertical',outline:'none'}}
          />
          <div style={{display:'flex',gap:'8px'}}>
            <button type="submit" style={{padding:'5px 14px',background:'#c8a84b',border:'none',borderRadius:'5px',color:'#000',fontWeight:700,fontSize:'12px',cursor:'pointer'}}>
              Save
            </button>
            <button type="button" onClick={() => setOpen(false)} style={{padding:'5px 12px',background:'none',border:'1px solid #333',borderRadius:'5px',color:'#666',fontSize:'12px',cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function Card({title, children, action}: {title: string; children: React.ReactNode; action?: React.ReactNode}) {
  return (
    <div style={{background:'#0d0d0d',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'10px',padding:'16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
        <h3 style={{margin:0,fontSize:'13px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#666'}}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Grid2({children}: {children: React.ReactNode}) {
  return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>{children}</div>;
}

function Field({label, value, href}: {label: string; value: any; href?: string}) {
  if (!value) return null;
  return (
    <div>
      <div style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em',color:'#555',marginBottom:'2px'}}>{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{fontSize:'13px',color:'#60a5fa',textDecoration:'none'}}>{String(value)}</a>
      ) : (
        <div style={{fontSize:'13px',color:'#ddd'}}>{String(value)}</div>
      )}
    </div>
  );
}

function ActionLink({href, color, children}: {href: string; color: string; children: React.ReactNode}) {
  return (
    <a
      href={href}
      style={{display:'block',padding:'8px 12px',background:`${color}14`,border:`1px solid ${color}33`,borderRadius:'6px',color,fontSize:'13px',fontWeight:600,textDecoration:'none'}}
    >
      {children}
    </a>
  );
}
