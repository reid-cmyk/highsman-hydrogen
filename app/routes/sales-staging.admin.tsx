/**
 * app/routes/sales-staging.admin.tsx
 * /sales-staging/admin — User & permissions management (admin only)
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher} from '@remix-run/react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFUser, listSFUsers, updateSFUserPermissions, isAdmin} from '~/lib/sf-auth.server';
import {SF_MODULES, SF_FEATURES} from '~/lib/sf-permissions';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [{title: 'Admin | Sales Floor'}, {name: 'robots', content: 'noindex'}];

const T = {
  bg:'#0A0A0A', surface:'#111111', surfaceElev:'#161616',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F0F0F0', textSubtle:'#9C9C9C', textFaint:'#5A5A5A', textMuted:'#7A7A7A',
  yellow:'#FFD500', cyan:'#00D4FF', green:'#00E87A', redSystems:'#FF3355',
};

const ALL_MARKETS = ['NJ','MA','NY','RI','MO'];

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');
  if (sfUser && !isAdmin(sfUser)) return redirect('/sales-staging');

  const users = await listSFUsers(env);
  return json({sfUser, users});
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser || !isAdmin(sfUser)) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const fd = await request.formData();
  const userId = String(fd.get('user_id') || '');
  if (!userId) return json({ok: false, error: 'missing user_id'});

  const display_name = String(fd.get('display_name') || '');
  const role = String(fd.get('role') || 'rep') as 'admin' | 'rep';
  const modules = fd.getAll('modules').map(String);
  const features = fd.getAll('features').map(String);
  const markets = fd.getAll('markets').map(String);
  const avatar_url = String(fd.get('avatar_url') || '').trim(); // always include (empty string clears it)

  const ok = await updateSFUserPermissions(userId, {display_name, role, modules, features, markets, avatar_url: avatar_url || undefined}, env);
  return json({ok});
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', onboarding: 'Onboarding', reorders: 'Reorders Due',
  leads: 'Leads', orders: 'Sales Orders', accounts: 'Accounts',
  funnel: 'Funnel', email: 'Email', text: 'Text', issues: 'Issues',
  vibes: 'Vibes', admin: 'Admin',
};

const FEATURE_LABELS: Record<string, string> = {
  'accounts.export_csv': 'Export CSV',
  'accounts.delete': 'Delete Accounts',
  'accounts.create': 'Create Accounts',
  'orders.create': 'Create Orders',
  'accounts.flag_pete': 'Flag Pete',
};

export default function AdminPage() {
  const {sfUser, users} = useLoaderData<typeof loader>() as any;
  return (
    <SalesFloorLayout current="Admin" sfUser={sfUser}>
      <div style={{padding: '28px 32px'}}>
        <h1 style={{margin: '0 0 4px', fontFamily: 'Teko,sans-serif', fontSize: 36, fontWeight: 500, letterSpacing: '0.10em', color: T.text, textTransform: 'uppercase'}}>
          User Management
        </h1>
        <div style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 10.5, color: T.textFaint, letterSpacing: '0.12em', marginBottom: 28}}>
          {users.length} users · permissions stored in Supabase Auth
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
          {users
            .sort((a: any, b: any) => a.permissions.display_name.localeCompare(b.permissions.display_name))
            .map((u: any) => <UserCard key={u.id} user={u} />)
          }
        </div>
      </div>
    </SalesFloorLayout>
  );
}

function UserCard({user}: {user: any}) {
  const fetcher = useFetcher();
  const p = user.permissions;
  const isAllModules = p.modules.includes('*');
  const isAllMarkets = p.markets.includes('*');
  const isAllFeatures = p.features.includes('*');
  const saving = fetcher.state !== 'idle';

  return (
    <div style={{background: T.surface, border: `1px solid ${T.borderStrong}`, padding: '20px 24px'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16}}>
        <div style={{width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${T.yellow},#FFB800)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 700, fontSize: 13, fontFamily: 'Teko,sans-serif', flexShrink: 0}}>
          {p.display_name.split(' ').map((w: string) => w[0]).slice(0,2).join('').toUpperCase()}
        </div>
        <div>
          <div style={{fontFamily: 'Teko,sans-serif', fontSize: 20, letterSpacing: '0.08em', color: T.text}}>{p.display_name}</div>
          <div style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: T.textFaint, letterSpacing: '0.10em'}}>{user.email}</div>
        </div>
        <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8}}>
          <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 9.5, letterSpacing: '0.14em', padding: '2px 8px', border: `1px solid ${p.role === 'admin' ? T.yellow : T.borderStrong}`, color: p.role === 'admin' ? T.yellow : T.textFaint}}>
            {p.role.toUpperCase()}
          </span>
          {saving && <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 9.5, color: T.cyan, letterSpacing: '0.12em'}}>saving…</span>}
          {(fetcher.data as any)?.ok && !saving && <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 9.5, color: T.green, letterSpacing: '0.12em'}}>saved ✓</span>}
        </div>
      </div>

      <fetcher.Form method="post" style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24}}>
        <input type="hidden" name="user_id" value={user.id} />

        {/* Modules */}
        <div>
          <div style={{fontFamily: 'Teko,sans-serif', fontSize: 13, letterSpacing: '0.22em', color: T.textMuted, textTransform: 'uppercase', marginBottom: 10}}>Modules</div>
          <label style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer'}}>
            <input type="checkbox" name="modules" value="*" defaultChecked={isAllModules}
              onChange={e => { const form = e.target.form!; const boxes = form.querySelectorAll('input[name="modules"]:not([value="*"])') as NodeListOf<HTMLInputElement>; boxes.forEach(b => { b.disabled = e.target.checked; }); }} />
            <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: T.yellow}}>All modules</span>
          </label>
          {SF_MODULES.filter(m => m !== 'dashboard').map(m => (
            <label key={m} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, cursor: 'pointer'}}>
              <input type="checkbox" name="modules" value={m}
                defaultChecked={isAllModules || p.modules.includes(m)}
                disabled={isAllModules} />
              <span style={{fontFamily: 'Inter,sans-serif', fontSize: 13, color: T.textSubtle}}>{MODULE_LABELS[m] || m}</span>
            </label>
          ))}
        </div>

        {/* Features + Role */}
        <div>
          <div style={{fontFamily: 'Teko,sans-serif', fontSize: 13, letterSpacing: '0.22em', color: T.textMuted, textTransform: 'uppercase', marginBottom: 10}}>Features</div>
          <label style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer'}}>
            <input type="checkbox" name="features" value="*" defaultChecked={isAllFeatures} />
            <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: T.yellow}}>All features</span>
          </label>
          {SF_FEATURES.map(f => (
            <label key={f} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, cursor: 'pointer'}}>
              <input type="checkbox" name="features" value={f}
                defaultChecked={isAllFeatures || p.features.includes(f)} />
              <span style={{fontFamily: 'Inter,sans-serif', fontSize: 13, color: T.textSubtle}}>{FEATURE_LABELS[f] || f}</span>
            </label>
          ))}

          <div style={{marginTop: 20}}>
            <div style={{fontFamily: 'Teko,sans-serif', fontSize: 13, letterSpacing: '0.22em', color: T.textMuted, textTransform: 'uppercase', marginBottom: 10}}>Role</div>
            <label style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer'}}>
              <input type="radio" name="role" value="admin" defaultChecked={p.role === 'admin'} />
              <span style={{fontFamily: 'Inter,sans-serif', fontSize: 13, color: T.textSubtle}}>Admin</span>
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer'}}>
              <input type="radio" name="role" value="rep" defaultChecked={p.role === 'rep'} />
              <span style={{fontFamily: 'Inter,sans-serif', fontSize: 13, color: T.textSubtle}}>Rep</span>
            </label>
          </div>
        </div>

        {/* Markets + Identity + Save */}
        <div>
          <div style={{fontFamily: 'Teko,sans-serif', fontSize: 13, letterSpacing: '0.22em', color: T.textMuted, textTransform: 'uppercase', marginBottom: 10}}>Markets</div>
          <label style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer'}}>
            <input type="checkbox" name="markets" value="*" defaultChecked={isAllMarkets} />
            <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: T.yellow}}>All markets</span>
          </label>
          {ALL_MARKETS.map(m => (
            <label key={m} style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, cursor: 'pointer'}}>
              <input type="checkbox" name="markets" value={m}
                defaultChecked={isAllMarkets || p.markets.includes(m)} />
              <span style={{fontFamily: 'Inter,sans-serif', fontSize: 13, color: T.textSubtle}}>{m}</span>
            </label>
          ))}

          <div style={{marginTop: 20}}>
            <div style={{fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.28em', color: T.textFaint, textTransform: 'uppercase', marginBottom: 6}}>Display Name</div>
            <input type="text" name="display_name" defaultValue={p.display_name}
              style={{width: '100%', padding: '8px 10px', background: T.bg, border: `1px solid ${T.borderStrong}`, color: T.text, fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: 12}} />
            <div style={{fontFamily: 'Teko,sans-serif', fontSize: 11, letterSpacing: '0.28em', color: T.textFaint, textTransform: 'uppercase', marginBottom: 6}}>Avatar URL <span style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: T.textFaint, letterSpacing: '0.06em', textTransform: 'none'}}>(optional)</span></div>
            <input type="url" name="avatar_url" defaultValue={p.avatar_url || ''}
              placeholder="https://..."
              style={{width: '100%', padding: '8px 10px', background: T.bg, border: `1px solid ${T.borderStrong}`, color: T.text, fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box'}} />
          </div>

          <button type="submit" style={{marginTop: 16, width: '100%', padding: '11px', background: T.yellow, border: 'none', color: '#000', fontFamily: 'Teko,sans-serif', fontSize: 16, fontWeight: 600, letterSpacing: '0.20em', textTransform: 'uppercase', cursor: 'pointer'}}>
            Save
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}
