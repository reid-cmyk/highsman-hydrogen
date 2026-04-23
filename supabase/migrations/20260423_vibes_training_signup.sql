-- ─────────────────────────────────────────────────────────────────────────────
-- Highsman Vibes — Training Signup Module migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds per-store roster (denominator), short-lived signup tokens for QR codes,
-- and a joined view that drives the /vibes store-card Training panel.
--
-- Run once in Supabase SQL editor. Every statement is idempotent.
-- Depends on: vibes_schema.sql (creates budtender_training + store_training_summary)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- vibes_store_profiles — Serena-maintained data per dispensary
-- Keyed by Zoho account_id so we don't duplicate store name/address here.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.vibes_store_profiles (
  account_id           text primary key,              -- Zoho Account ID
  account_name         text,                          -- denormalized for convenience
  budtender_headcount  int check (budtender_headcount >= 0),
  manager_name         text,
  manager_email        text,
  manager_phone        text,

  store_notes          text,                          -- private Serena notes

  headcount_updated_at timestamptz,
  updated_by_rep_id    uuid references public.vibes_reps(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit log so fat-finger roster edits are recoverable.
create table if not exists public.vibes_store_profile_audit (
  id bigserial primary key,
  changed_at timestamptz not null default now(),
  account_id text not null,
  field_name text not null,
  old_value  text,
  new_value  text,
  changed_by_rep_id uuid references public.vibes_reps(id)
);

create index if not exists vibes_store_profile_audit_account_idx
  on public.vibes_store_profile_audit (account_id, changed_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- training_signup_tokens — short opaque tokens we encode into QR codes
-- Rep creates one token per store; token stays valid but we rotate on demand.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.training_signup_tokens (
  token      text primary key,                        -- URL-safe random slug
  account_id text not null,
  created_at timestamptz not null default now(),
  created_by_rep_id uuid references public.vibes_reps(id),
  revoked_at timestamptz
);

create index if not exists training_signup_tokens_account_idx
  on public.training_signup_tokens (account_id)
  where revoked_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: we deliberately do NOT create a store_training_progress view here.
-- Enrollment + tier data lives in Klaviyo (list WBSrLZ, metric UwTaBd) —
-- same source of truth as /staff-dashboard. See app/lib/vibes-klaviyo-training.ts
-- for the shared rollup helper. The /vibes loader joins that helper's output
-- against vibes_store_profiles.budtender_headcount at request time to compute
-- pct_enrolled per store.
--
-- Keeping the view out of Postgres prevents Supabase/Klaviyo drift.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- set_store_headcount()  —  helper RPC Serena's inline editor calls.
-- Writes new value + captures previous value in the audit log atomically.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_store_headcount(
  p_account_id   text,
  p_account_name text,
  p_headcount    int,
  p_rep_id       uuid
) returns public.vibes_store_profiles
language plpgsql
as $$
declare
  v_old_value int;
  v_profile   public.vibes_store_profiles;
begin
  select budtender_headcount into v_old_value
    from public.vibes_store_profiles
    where account_id = p_account_id;

  insert into public.vibes_store_profiles
    (account_id, account_name, budtender_headcount,
     headcount_updated_at, updated_by_rep_id, updated_at)
  values
    (p_account_id, p_account_name, p_headcount,
     now(), p_rep_id, now())
  on conflict (account_id) do update set
    account_name          = coalesce(excluded.account_name, vibes_store_profiles.account_name),
    budtender_headcount   = excluded.budtender_headcount,
    headcount_updated_at  = now(),
    updated_by_rep_id     = p_rep_id,
    updated_at            = now()
  returning * into v_profile;

  insert into public.vibes_store_profile_audit
    (account_id, field_name, old_value, new_value, changed_by_rep_id)
  values
    (p_account_id, 'budtender_headcount',
     v_old_value::text, p_headcount::text, p_rep_id);

  return v_profile;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_training_signup()  —  single entry point for QR landing + manual form.
-- Dedupes by (store, email). Updates completed_at on repeat signups.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.upsert_training_signup(
  p_store_account_id   text,
  p_store_account_name text,
  p_budtender_name     text,
  p_budtender_email    text,
  p_method             text,        -- 'self_serve' or 'live'
  p_module_slug        text default 'training-camp-signup',
  p_rep_id             uuid default null,
  p_klaviyo_profile_id text default null
) returns public.budtender_training
language plpgsql
as $$
declare
  v_row public.budtender_training;
begin
  if p_store_account_id is null or p_budtender_email is null then
    raise exception 'store_account_id and budtender_email are required';
  end if;

  -- Idempotent: one row per (store, lowercased email, module).
  select * into v_row
    from public.budtender_training
    where store_account_id = p_store_account_id
      and lower(budtender_email) = lower(p_budtender_email)
      and module_slug = p_module_slug
    limit 1;

  if found then
    update public.budtender_training
      set completed_at       = now(),
          budtender_name     = coalesce(p_budtender_name, budtender_name),
          method             = p_method,
          trained_by_rep_id  = coalesce(p_rep_id, trained_by_rep_id),
          klaviyo_profile_id = coalesce(p_klaviyo_profile_id, klaviyo_profile_id)
      where id = v_row.id
      returning * into v_row;
  else
    insert into public.budtender_training
      (method, budtender_name, budtender_email,
       store_account_id, store_account_name,
       module_slug, module_title,
       trained_by_rep_id, klaviyo_profile_id)
    values
      (p_method, p_budtender_name, p_budtender_email,
       p_store_account_id, p_store_account_name,
       p_module_slug, 'Training Camp Signup',
       p_rep_id, p_klaviyo_profile_id)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — service-role-only, matches the rest of vibes_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.vibes_store_profiles        enable row level security;
alter table public.vibes_store_profile_audit   enable row level security;
alter table public.training_signup_tokens      enable row level security;
