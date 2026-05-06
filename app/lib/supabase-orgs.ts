/**
 * app/lib/supabase-orgs.ts
 *
 * Supabase REST query helpers for the organizations + contacts tables.
 * Uses the raw REST API (apikey header) — same pattern as vibes._index.tsx.
 */

export type OrgRow = {
  id: string;
  name: string;
  market_state: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  lifecycle_stage: string;
  tier: string | null;
  last_order_date: string | null;
  last_order_amount: number | null;
  orders_count: number;
  reorder_cadence_days: number | null;
  tags: string[];
  online_menus: string[];
  license_number: string | null;
  zoho_account_id: string | null;
  do_not_contact: boolean;
  risk_of_loss: boolean;
  // 'healthy' | 'aging' | 'past_cadence' | 'low_inv' | 'out_of_stock'
  reorder_status: string;
  reorder_flag_aging_at: string | null;
  reorder_flag_past_cadence_at: string | null;
  reorder_flag_low_inv_at: string | null;
  reorder_flag_out_of_stock_at: string | null;
  reorder_suppressed: boolean;
  lead_stage: string | null;
  lead_stage_updated_at: string | null;
  market_rank: number | null;
  market_total: number | null;
  market_revenue_90d: number | null;
  lat: number | null;
  lng: number | null;
  // Populated by loaders that call fetchLatestNotes — not stored in Supabase
  latest_note?: {id: string; body: string; author_name: string | null; created_at: string} | null;
  contacts: ContactRow[];
};

export type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  job_role: string | null;
  is_primary_buyer: boolean;
};

type SBEnv = {SUPABASE_URL?: string; SUPABASE_SERVICE_KEY?: string};

function sbHeaders(env: SBEnv) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
    'Content-Type': 'application/json',
  };
}

/** Fetch organizations for the account list. Filters by state + lifecycle. */
export async function fetchOrgs(
  env: SBEnv,
  opts: {
    state?: string;          // 'NJ', 'MA', etc. — omit for all
    lifecycle?: string[];    // default: ['active','churned']
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<OrgRow[]> {
  const {
    state,
    lifecycle = ['active', 'churned'],
    search,
    limit = 500,
    offset = 0,
  } = opts;

  const base = `${env.SUPABASE_URL}/rest/v1/organizations`;
  const select = [
    'id','name','market_state','city','phone','website',
    'lifecycle_stage','tier','last_order_date','last_order_amount','orders_count',
    'reorder_cadence_days','tags','online_menus',
    'license_number','zoho_account_id','do_not_contact','risk_of_loss',
    'reorder_status','reorder_flag_aging_at','reorder_flag_past_cadence_at',
    'reorder_flag_low_inv_at','reorder_flag_out_of_stock_at','reorder_suppressed',
    'market_rank','market_total','market_revenue_90d',
    'lat','lng',
    'contacts(id,first_name,last_name,full_name,email,phone,mobile,job_role,is_primary_buyer)',
  ].join(',');

  const params = new URLSearchParams({
    select,
    order: 'name.asc',
    limit: String(limit),
    offset: String(offset),
  });

  if (state) params.set('market_state', `eq.${state}`);

  // lifecycle IN filter
  if (lifecycle.length === 1) {
    params.set('lifecycle_stage', `eq.${lifecycle[0]}`);
  } else if (lifecycle.length > 1) {
    params.set('lifecycle_stage', `in.(${lifecycle.join(',')})`);
  }

  const url = `${base}?${params}`;
  const res = await fetch(url, {headers: sbHeaders(env)});
  if (!res.ok) throw new Error(`Supabase orgs fetch failed: ${res.status}`);
  const rows: OrgRow[] = await res.json();

  // Client-side search (Supabase REST ilike requires separate param)
  if (search && search.trim()) {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.license_number || '').toLowerCase().includes(q),
    );
  }

  return rows;
}

/** Update a single org field. Used by FLAG PETE and inline edits. */
export async function updateOrg(
  env: SBEnv,
  id: string,
  patch: Partial<OrgRow>,
): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${id}`, {
    method: 'PATCH',
    headers: {...sbHeaders(env), Prefer: 'return=minimal'},
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase updateOrg failed: ${res.status} ${txt}`);
  }
}
