/**
 * app/routes/sales-staging.admin.tsx
 * /sales-staging/admin — Admin panel
 *
 * Two tabs:
 *   1. User Permissions — list / add / edit / delete Supabase Auth users
 *   2. Email Templates  — list / add / edit / delete email_templates table
 *
 * ── Supabase table required for Email Templates ──────────────────────────────
 * Run this once in the Supabase SQL Editor:
 *
 *   CREATE TABLE email_templates (
 *     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     key         text UNIQUE NOT NULL,
 *     label       text NOT NULL,
 *     sub         text NOT NULL DEFAULT '',
 *     subject     text NOT NULL,
 *     body        text NOT NULL,
 *     sort_order  integer DEFAULT 0,
 *     created_at  timestamptz DEFAULT now(),
 *     updated_at  timestamptz DEFAULT now()
 *   );
 *
 * The email page falls back to hardcoded templates if this table is missing.
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, useRevalidator} from '@remix-run/react';
import {useState, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFUser, listSFUsers, updateSFUserPermissions, isAdmin} from '~/lib/sf-auth.server';
import {SF_MODULES, SF_FEATURES} from '~/lib/sf-permissions';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [{title: 'Admin | Sales Floor'}, {name: 'robots', content: 'noindex'}];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:'#0A0A0A', surface:'#111111', surfaceElev:'#161616',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F0F0F0', textSubtle:'#9C9C9C', textFaint:'#5A5A5A', textMuted:'#7A7A7A',
  yellow:'#FFD500', cyan:'#00D4FF', green:'#00E87A', redSystems:'#FF3355',
  statusWarn:'#FFB300',
};

const ALL_MARKETS = ['NJ','MA','NY','RI','MO'];

const MODULE_LABELS: Record<string,string> = {
  dashboard:'Dashboard', onboarding:'Onboarding', reorders:'Reorders Due',
  leads:'Leads', orders:'Sales Orders', accounts:'Accounts',
  email:'Email', text:'Text', issues:'Issues', vibes:'Vibes', admin:'Admin',
};
const FEATURE_LABELS: Record<string,string> = {
  'accounts.export_csv':'Export CSV', 'accounts.delete':'Delete Accounts',
  'accounts.create':'Create Accounts', 'orders.create':'Create Orders',
  'accounts.flag_pete':'Flag Pete',
};

// Supabase admin helpers
const sbAdmin = (env: any) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');
  if (sfUser && !isAdmin(sfUser)) return redirect('/sales-staging');

  const [users, templateRows] = await Promise.all([
    listSFUsers(env),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/email_templates?order=sort_order.asc,created_at.asc`,
      {headers: {...sbAdmin(env), Prefer: 'return=representation'}},
    ).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  return json({sfUser, users, templates: Array.isArray(templateRows) ? templateRows : []});
}

// ─── Action ───────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser || !isAdmin(sfUser)) return json({ok:false,error:'unauthorized'},{status:401});

  const fd = await request.formData();
  const intent = String(fd.get('intent') || 'update_user');
  const h = sbAdmin(env);

  // ── Update user permissions ────────────────────────────────────────────────
  if (intent === 'update_user') {
    const userId = String(fd.get('user_id') || '');
    if (!userId) return json({ok:false,error:'missing user_id'});
    const display_name = String(fd.get('display_name') || '');
    const role = String(fd.get('role') || 'rep') as 'admin'|'rep';
    const collapse = (vals: string[]) => vals.includes('*') ? ['*'] : vals;
    const modules  = collapse(fd.getAll('modules').map(String));
    const features = collapse(fd.getAll('features').map(String));
    const markets  = collapse(fd.getAll('markets').map(String));
    const avatar_url = String(fd.get('avatar_url') || '').trim();
    const ok = await updateSFUserPermissions(userId, {display_name, role, modules, features, markets, avatar_url: avatar_url || undefined}, env);
    const headers = new Headers({'Content-Type':'application/json'});
    headers.append('Set-Cookie', `sf_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return new Response(JSON.stringify({ok, intent}), {status:200, headers});
  }

  // ── Create new user ────────────────────────────────────────────────────────
  if (intent === 'create_user') {
    const email       = String(fd.get('email') || '').trim().toLowerCase();
    const password    = String(fd.get('password') || '').trim();
    const displayName = String(fd.get('display_name') || '').trim();
    const role        = String(fd.get('role') || 'rep');
    if (!email || !password || !displayName) return json({ok:false,error:'email, password and display name required'});
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        email, password,
        email_confirm: true, // skip confirmation email for internal tool
        user_metadata: {
          display_name: displayName, role,
          modules: ['*'], features: ['*'], markets: ['*'], // defaults to full access; admin can restrict after
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ok:false,error:data.message||data.error||'Create failed'});
    return json({ok:true, intent, userId: data.id});
  }

  // ── Delete user ────────────────────────────────────────────────────────────
  if (intent === 'delete_user') {
    const userId = String(fd.get('user_id') || '');
    if (!userId) return json({ok:false,error:'missing user_id'});
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE', headers: h,
    });
    return json({ok: res.ok || res.status === 404, intent});
  }

  // ── Save (upsert) email template ───────────────────────────────────────────
  if (intent === 'save_template') {
    const id      = String(fd.get('id') || '').trim();
    const key     = String(fd.get('key') || '').trim().toLowerCase().replace(/\s+/g,'-');
    const label   = String(fd.get('label') || '').trim();
    const sub     = String(fd.get('sub') || '').trim();
    const subject = String(fd.get('subject') || '').trim();
    const body    = String(fd.get('body') || '').trim();
    const sort_order = parseInt(String(fd.get('sort_order') || '0'), 10) || 0;
    if (!key || !label || !subject || !body) return json({ok:false,error:'key, label, subject and body required'});
    const payload: any = {key, label, sub, subject, body, sort_order, updated_at: new Date().toISOString()};
    if (id) payload.id = id;
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/email_templates`,
      {method:'POST', headers:{...h, Prefer:'resolution=merge-duplicates,return=representation'}, body:JSON.stringify(payload)},
    );
    const saved = await res.json().catch(() => null);
    return json({ok: res.ok, intent, template: Array.isArray(saved) ? saved[0] : saved});
  }

  // ── Delete email template ──────────────────────────────────────────────────
  if (intent === 'delete_template') {
    const id = String(fd.get('id') || '');
    if (!id) return json({ok:false,error:'missing id'});
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/email_templates?id=eq.${id}`, {
      method:'DELETE', headers: h,
    });
    return json({ok: res.ok, intent});
  }

  return json({ok:false,error:'unknown intent'},{status:400});
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const {sfUser, users, templates} = useLoaderData<typeof loader>() as any;
  const [tab, setTab] = useState<'users'|'templates'>('users');
  const revalidator = useRevalidator();

  const tabBtn = (id: 'users'|'templates', label: string) => (
    <button type="button" onClick={() => setTab(id)}
      style={{height:36, padding:'0 20px', border:'none', borderBottom:`2px solid ${tab===id?T.yellow:'transparent'}`, background:'transparent', color:tab===id?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer'}}>
      {label}
    </button>
  );

  return (
    <SalesFloorLayout current="Admin" sfUser={sfUser}>
      {/* Page header */}
      <div className="hs-sweep" style={{padding:'20px 28px 0', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{marginBottom:4}}>
          <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:500, letterSpacing:'0.06em', color:T.text, textTransform:'uppercase', lineHeight:1}}>Admin</h1>
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, marginTop:4, letterSpacing:'0.12em'}}>
            {users.length} users · {templates.length} templates
          </div>
        </div>
        {/* Tabs */}
        <div style={{display:'flex', gap:2, marginTop:12}}>
          {tabBtn('users', 'User Permissions')}
          {tabBtn('templates', 'Email Templates')}
        </div>
      </div>

      <div style={{padding:'24px 28px', flex:1}}>

        {/* ── TAB 1: USERS ──────────────────────────────────────────────── */}
        {tab === 'users' && (
          <UsersTab users={users} onRevalidate={() => revalidator.revalidate()} />
        )}

        {/* ── TAB 2: TEMPLATES ──────────────────────────────────────────── */}
        {tab === 'templates' && (
          <TemplatesTab templates={templates} onRevalidate={() => revalidator.revalidate()} />
        )}
      </div>
    </SalesFloorLayout>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({users, onRevalidate}: {users: any[]; onRevalidate: () => void}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20}}>
        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.12em'}}>
          {users.length} users · permissions stored in Supabase Auth
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{height:34, padding:'0 16px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
          + ADD USER
        </button>
      </div>

      {showAdd && (
        <AddUserForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onRevalidate(); }} />
      )}

      <div style={{display:'flex', flexDirection:'column', gap:14}}>
        {users
          .sort((a: any, b: any) => (a.permissions.display_name||'').localeCompare(b.permissions.display_name||''))
          .map((u: any) => <UserCard key={u.id} user={u} onDeleted={onRevalidate} />)
        }
      </div>
    </div>
  );
}

function AddUserForm({onClose, onSaved}: {onClose: ()=>void; onSaved: ()=>void}) {
  const fetcher = useFetcher();
  const saving = fetcher.state !== 'idle';
  const d = fetcher.data as any;

  useEffect(() => {
    if (d?.ok && d?.intent === 'create_user') onSaved();
  }, [d, onSaved]);

  return (
    <div style={{background:T.surface, border:`2px solid ${T.yellow}44`, padding:'20px 24px', marginBottom:20}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.16em', color:T.yellow, textTransform:'uppercase', marginBottom:16}}>
        New User
      </div>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="create_user"/>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
          <div>
            <label style={labelStyle}>Email</label>
            <input name="email" type="email" required placeholder="name@highsman.com" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input name="display_name" required placeholder="Sky Lima" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input name="password" type="password" required placeholder="Temporary password" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select name="role" style={{...inputStyle, cursor:'pointer'}}>
              <option value="rep">Rep</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        {d && !d.ok && (
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.redSystems, letterSpacing:'0.08em', marginBottom:12}}>
            ⚠ {d.error}
          </div>
        )}
        <div style={{display:'flex', gap:8}}>
          <button type="submit" disabled={saving}
            style={{height:34, padding:'0 20px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
            {saving ? 'CREATING…' : 'CREATE USER'}
          </button>
          <button type="button" onClick={onClose}
            style={{height:34, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.16em', cursor:'pointer'}}>
            CANCEL
          </button>
        </div>
        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.08em', marginTop:10}}>
          New users get full access by default — edit permissions after creation.
        </div>
      </fetcher.Form>
    </div>
  );
}

function UserCard({user, onDeleted}: {user: any; onDeleted: ()=>void}) {
  const fetcher    = useFetcher();
  const delFetcher = useFetcher();
  const p = user.permissions;
  const isAllModules  = p.modules.includes('*');
  const isAllMarkets  = p.markets.includes('*');
  const isAllFeatures = p.features.includes('*');
  const saving     = fetcher.state !== 'idle';
  const deleting   = delFetcher.state !== 'idle';
  const [avatarUrl, setAvatarUrl] = useState(p.avatar_url || '');
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    const d = delFetcher.data as any;
    if (d?.ok && d?.intent === 'delete_user') onDeleted();
  }, [delFetcher.data, onDeleted]);

  return (
    <div style={{background:T.surface, border:`1px solid ${T.borderStrong}`, padding:'20px 24px'}}>
      {/* User header */}
      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:18}}>
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={p.display_name} style={{width:40, height:40, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`2px solid ${T.borderStrong}`}}/>
        ) : (
          <div style={{width:40, height:40, borderRadius:'50%', background:`linear-gradient(135deg,${T.yellow},#FFB800)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontWeight:700, fontSize:14, fontFamily:'Teko,sans-serif', flexShrink:0}}>
            {(p.display_name||'?').split(' ').map((w: string) => w[0]).slice(0,2).join('').toUpperCase()}
          </div>
        )}
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:20, letterSpacing:'0.08em', color:T.text}}>{p.display_name}</div>
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em'}}>{user.email}</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, letterSpacing:'0.14em', padding:'2px 8px', border:`1px solid ${p.role==='admin'?T.yellow:T.borderStrong}`, color:p.role==='admin'?T.yellow:T.textFaint}}>
            {(p.role||'rep').toUpperCase()}
          </span>
          {saving && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.cyan, letterSpacing:'0.12em'}}>saving…</span>}
          {(fetcher.data as any)?.ok && !saving && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.green, letterSpacing:'0.12em'}}>saved ✓</span>}
          {/* Delete */}
          {confirmDel ? (
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.redSystems, letterSpacing:'0.08em'}}>Delete user?</span>
              <delFetcher.Form method="post" style={{display:'inline'}}>
                <input type="hidden" name="intent" value="delete_user"/>
                <input type="hidden" name="user_id" value={user.id}/>
                <button type="submit" disabled={deleting}
                  style={{height:24, padding:'0 8px', background:'rgba(255,51,85,0.15)', border:`1px solid ${T.redSystems}`, color:T.redSystems, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer'}}>
                  {deleting ? '…' : 'DELETE'}
                </button>
              </delFetcher.Form>
              <button type="button" onClick={() => setConfirmDel(false)}
                style={{height:24, padding:'0 8px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, cursor:'pointer'}}>
                CANCEL
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)}
              style={{height:24, padding:'0 8px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.12em', cursor:'pointer'}}>
              DELETE
            </button>
          )}
        </div>
      </div>

      <fetcher.Form method="post" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:24}}>
        <input type="hidden" name="intent" value="update_user"/>
        <input type="hidden" name="user_id" value={user.id}/>

        {/* Modules */}
        <div>
          <div style={sectionLabel}>Modules</div>
          <CheckAll name="modules" label="All modules" defaultChecked={isAllModules}/>
          {SF_MODULES.filter(m => m !== 'dashboard').map(m => (
            <Checkbox key={m} name="modules" value={m} label={MODULE_LABELS[m]||m} defaultChecked={isAllModules||p.modules.includes(m)} disabled={isAllModules}/>
          ))}
        </div>

        {/* Features + Role */}
        <div>
          <div style={sectionLabel}>Features</div>
          <CheckAll name="features" label="All features" defaultChecked={isAllFeatures}/>
          {SF_FEATURES.map(f => (
            <Checkbox key={f} name="features" value={f} label={FEATURE_LABELS[f]||f} defaultChecked={isAllFeatures||p.features.includes(f)} disabled={isAllFeatures}/>
          ))}
          <div style={{marginTop:18}}>
            <div style={sectionLabel}>Role</div>
            <Radio name="role" value="admin" label="Admin" defaultChecked={p.role==='admin'}/>
            <Radio name="role" value="rep"   label="Rep"   defaultChecked={p.role!=='admin'}/>
          </div>
        </div>

        {/* Markets + Identity + Save */}
        <div>
          <div style={sectionLabel}>Markets</div>
          <CheckAll name="markets" label="All markets" defaultChecked={isAllMarkets}/>
          {ALL_MARKETS.map(m => (
            <Checkbox key={m} name="markets" value={m} label={m} defaultChecked={isAllMarkets||p.markets.includes(m)} disabled={isAllMarkets}/>
          ))}
          <div style={{marginTop:18}}>
            <label style={labelStyle}>Display Name</label>
            <input type="text" name="display_name" defaultValue={p.display_name} style={{...inputStyle, marginBottom:10}}/>
            <label style={labelStyle}>Avatar URL <span style={{color:T.textFaint, fontFamily:'JetBrains Mono,monospace', fontSize:9, textTransform:'none', letterSpacing:'0.04em'}}>(optional)</span></label>
            <input type="url" name="avatar_url" value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://..." style={inputStyle}/>
          </div>
          <button type="submit" disabled={saving}
            style={{marginTop:16, width:'100%', padding:'10px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:15, fontWeight:600, letterSpacing:'0.20em', textTransform:'uppercase', cursor:'pointer'}}>
            {saving ? 'SAVING…' : 'SAVE PERMISSIONS'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab({templates, onRevalidate}: {templates: any[]; onRevalidate: ()=>void}) {
  const [showAdd, setShowAdd]     = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20}}>
        <div>
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.12em'}}>
            {templates.length} templates
          </div>
          {templates.length === 0 && (
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.statusWarn, letterSpacing:'0.08em', marginTop:4}}>
              ⚠ email_templates table not found — run the SQL in the route file comment to enable persistence.
            </div>
          )}
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{height:34, padding:'0 16px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
          + ADD TEMPLATE
        </button>
      </div>

      {showAdd && (
        <TemplateForm
          key="new"
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onRevalidate(); }}
          sortOrder={templates.length}
        />
      )}

      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        {templates.map((tpl: any) =>
          editingId === tpl.id ? (
            <TemplateForm
              key={tpl.id}
              template={tpl}
              onClose={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); onRevalidate(); }}
              sortOrder={tpl.sort_order}
            />
          ) : (
            <TemplateCard key={tpl.id} template={tpl} onEdit={() => setEditingId(tpl.id)} onDeleted={onRevalidate}/>
          )
        )}
      </div>
    </div>
  );
}

function TemplateCard({template: t, onEdit, onDeleted}: {template:any; onEdit:()=>void; onDeleted:()=>void}) {
  const fetcher   = useFetcher();
  const deleting  = fetcher.state !== 'idle';
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok && d?.intent === 'delete_template') onDeleted();
  }, [fetcher.data, onDeleted]);

  return (
    <div style={{background:T.surface, border:`1px solid ${T.borderStrong}`, padding:'16px 20px', display:'flex', gap:16, alignItems:'flex-start'}}>
      {/* Template info */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:4}}>
          <span style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.10em', color:T.text, textTransform:'uppercase'}}>{t.label}</span>
          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.10em'}}>{t.key}</span>
          {t.sub && <span style={{fontFamily:'Inter,sans-serif', fontSize:11, color:T.textMuted}}>{t.sub}</span>}
        </div>
        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textSubtle, letterSpacing:'0.04em', marginBottom:4}}>
          {t.subject}
        </div>
        <div style={{fontFamily:'Inter,sans-serif', fontSize:11, color:T.textFaint, lineHeight:1.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:600}}>
          {t.body?.split('\n')[0]}…
        </div>
      </div>
      {/* Actions */}
      <div style={{display:'flex', gap:6, flexShrink:0, alignItems:'center'}}>
        <button type="button" onClick={onEdit}
          style={{height:28, padding:'0 12px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.yellow, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer'}}>
          EDIT
        </button>
        {confirm ? (
          <>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.redSystems, letterSpacing:'0.06em'}}>Delete?</span>
            <fetcher.Form method="post" style={{display:'inline'}}>
              <input type="hidden" name="intent" value="delete_template"/>
              <input type="hidden" name="id" value={t.id}/>
              <button type="submit" disabled={deleting}
                style={{height:28, padding:'0 10px', background:'rgba(255,51,85,0.12)', border:`1px solid ${T.redSystems}`, color:T.redSystems, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', cursor:'pointer'}}>
                {deleting?'…':'YES'}
              </button>
            </fetcher.Form>
            <button type="button" onClick={() => setConfirm(false)}
              style={{height:28, padding:'0 8px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, cursor:'pointer'}}>
              NO
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirm(true)}
            style={{height:28, padding:'0 10px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.redSystems, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.12em', cursor:'pointer'}}>
            DELETE
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateForm({template, onClose, onSaved, sortOrder}: {template?:any; onClose:()=>void; onSaved:()=>void; sortOrder:number}) {
  const fetcher = useFetcher();
  const saving  = fetcher.state !== 'idle';
  const isNew   = !template;

  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok && d?.intent === 'save_template') onSaved();
  }, [fetcher.data, onSaved]);

  const [body, setBody] = useState(template?.body || '');

  return (
    <div style={{background:T.surface, border:`2px solid ${T.yellow}44`, padding:'20px 24px', marginBottom:4}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.14em', color:T.yellow, textTransform:'uppercase', marginBottom:16}}>
        {isNew ? 'New Template' : `Edit: ${template.label}`}
      </div>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="save_template"/>
        {template?.id && <input type="hidden" name="id" value={template.id}/>}
        <input type="hidden" name="sort_order" value={String(sortOrder)}/>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
          <div>
            <label style={labelStyle}>Key <span style={{color:T.textFaint, fontSize:9, letterSpacing:'0.04em'}}>(unique slug, e.g. "reorder")</span></label>
            <input name="key" required defaultValue={template?.key||''} placeholder="e.g. reorder" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Label</label>
            <input name="label" required defaultValue={template?.label||''} placeholder="e.g. Reorder" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Subtitle <span style={{color:T.textFaint, fontSize:9, letterSpacing:'0.04em'}}>(shown in template gallery)</span></label>
            <input name="sub" defaultValue={template?.sub||''} placeholder="e.g. Time to restock" style={inputStyle}/>
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <label style={labelStyle}>Subject <span style={{color:T.textFaint, fontSize:9, letterSpacing:'0.04em'}}>({'{company}'} and {'{name}'} are placeholders)</span></label>
          <input name="subject" required defaultValue={template?.subject||''} placeholder="e.g. Time to reorder? — {company}" style={inputStyle}/>
        </div>

        <div style={{marginBottom:14}}>
          <label style={labelStyle}>Body</label>
          <textarea name="body" required rows={8} value={body} onChange={e=>setBody(e.target.value)}
            placeholder={`Hi {name},\n\nYour message here...\n\nSky Lima\nHighsman`}
            style={{width:'100%', padding:'9px 12px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box'}}/>
        </div>

        {(fetcher.data as any)?.error && (
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.redSystems, letterSpacing:'0.08em', marginBottom:12}}>
            ⚠ {(fetcher.data as any).error}
          </div>
        )}

        <div style={{display:'flex', gap:8}}>
          <button type="submit" disabled={saving}
            style={{height:34, padding:'0 20px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
            {saving ? 'SAVING…' : 'SAVE TEMPLATE'}
          </button>
          <button type="button" onClick={onClose}
            style={{height:34, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.16em', cursor:'pointer'}}>
            CANCEL
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}

// ─── Shared style helpers ─────────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.26em', color:T.textMuted, textTransform:'uppercase', marginBottom:10, display:'block'};
const labelStyle:   React.CSSProperties = {fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.24em', color:T.textFaint, textTransform:'uppercase', display:'block', marginBottom:5};
const inputStyle:   React.CSSProperties = {width:'100%', padding:'8px 10px', background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' as const};

function CheckAll({name, label, defaultChecked}: {name:string; label:string; defaultChecked:boolean}) {
  return (
    <label style={{display:'flex', alignItems:'center', gap:10, marginBottom:8, cursor:'pointer'}}>
      <input type="checkbox" name={name} value="*" defaultChecked={defaultChecked}
        onChange={e => {
          const form = e.target.form;
          if (!form) return;
          const boxes = form.querySelectorAll(`input[name="${name}"]:not([value="*"])`) as NodeListOf<HTMLInputElement>;
          boxes.forEach(b => { b.disabled = e.target.checked; });
        }}/>
      <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.yellow}}>All {name}</span>
    </label>
  );
}
function Checkbox({name, value, label, defaultChecked, disabled}: {name:string; value:string; label:string; defaultChecked:boolean; disabled?:boolean}) {
  return (
    <label style={{display:'flex', alignItems:'center', gap:10, marginBottom:7, cursor:'pointer'}}>
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled}/>
      <span style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textSubtle}}>{label}</span>
    </label>
  );
}
function Radio({name, value, label, defaultChecked}: {name:string; value:string; label:string; defaultChecked:boolean}) {
  return (
    <label style={{display:'flex', alignItems:'center', gap:10, marginBottom:7, cursor:'pointer'}}>
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked}/>
      <span style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textSubtle}}>{label}</span>
    </label>
  );
}
