-- ─────────────────────────────────────────────────────────────────────────────
-- Highsman Vibes Team — Brand Rep Portal schema
-- ─────────────────────────────────────────────────────────────────────────────
-- Run once in Supabase SQL editor. Every statement is idempotent.
-- Source of truth for /vibes dashboard, Store Profile, Check-In flow,
-- Deck library, goodie log, merch inventory, and UGC review queue.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- vibes_reps — brand rep configuration
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.vibes_reps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  first_name text not null,
  last_name  text not null,
  full_name  text generated always as (first_name || ' ' || last_name) stored,
  email      text not null unique,
  phone      text,

  home_zip            text not null,      -- routing origin (Google Routes)
  max_drive_minutes   int,                -- NULL = no cap (entire state)
  territory_label     text,               -- e.g., 'Entire NJ'
  territory_states    text[] not null default '{}',

  ig_handle           text,               -- e.g., 'serenahighsman'

  start_date                date not null,
  onboarding_through_date   date,         -- full-week schedule through this date
  schedule_days             int[] not null default '{2,3,4}', -- 0=Sun … 6=Sat
  daily_goodie_budget       numeric(10,2) not null default 60,

  active boolean not null default true
);

create index if not exists vibes_reps_active_idx
  on public.vibes_reps (active, start_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- training_decks — Vibes deck library
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.training_decks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  title              text not null,
  module_slug        text not null unique,
  drive_file_id      text not null,
  duration_minutes   int  not null default 15,
  sort_order         int  not null default 0,
  summary            text,
  active             boolean not null default true
);

create index if not exists training_decks_active_idx
  on public.training_decks (active, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- brand_visits — one row per store visit (check-in)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.brand_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  rep_id        uuid not null references public.vibes_reps(id) on delete restrict,
  rep_name      text not null,

  account_id    text not null,   -- Zoho Account ID
  account_name  text not null,
  account_city  text,
  account_state text,

  visit_date    date not null default (now() at time zone 'America/New_York')::date,
  visit_type    text not null check (visit_type in (
                  'first_visit','rotation','target_sample','training','other')),

  checked_in_at   timestamptz,
  checked_out_at  timestamptz,
  gps_lat         numeric(9,6),
  gps_lng         numeric(9,6),

  -- ─── Audit ────────────────────────────────────────────────────────────────
  -- Legacy shelf-based fields (kept for historic visits, unused for new flow).
  skus_on_shelf           text[] not null default '{}',
  skus_missing            text[] not null default '{}',
  shelf_position_rating   int check (shelf_position_rating between 1 and 5),

  -- New merchandising-first audit model:
  --   sku_stock      — { [formatSlug]: { [strainSlug]: true } }
  --   merch_visible  — { [merchItemId]: count }  (from MERCH_ITEMS catalog)
  sku_stock                    jsonb   not null default '{}'::jsonb,
  merch_visible                jsonb   not null default '{}'::jsonb,
  merch_visible_photo_urls     text[]  not null default '{}',

  -- ─── Training ─────────────────────────────────────────────────────────────
  decks_taught            text[] not null default '{}',
  budtenders_trained      text[] not null default '{}',

  -- ─── Drop ─────────────────────────────────────────────────────────────────
  goodie_total_spent      numeric(10,2) not null default 0,
  merch_installed         jsonb not null default '{}'::jsonb, -- legacy
  -- Physical drop-offs this visit: { [merchItemId]: count }. Feeds per-store
  -- merch inventory tracking.
  dropoffs                jsonb   not null default '{}'::jsonb,
  dropoff_photo_urls      text[]  not null default '{}',

  -- ─── Vibes ────────────────────────────────────────────────────────────────
  vibes_score             int check (vibes_score between 1 and 10),
  notes_to_sales_team     text,
  spoke_with_manager      boolean not null default false,

  -- ─── Photos ───────────────────────────────────────────────────────────────
  shelf_photo_url         text,
  before_photo_url        text,
  after_photo_url         text,
  selfie_url              text,
  ugc_post_url            text
);

-- Idempotent column adds for existing installations (pre-merch-audit schema).
alter table public.brand_visits
  add column if not exists sku_stock                jsonb  not null default '{}'::jsonb,
  add column if not exists merch_visible            jsonb  not null default '{}'::jsonb,
  add column if not exists merch_visible_photo_urls text[] not null default '{}',
  add column if not exists dropoffs                 jsonb  not null default '{}'::jsonb,
  add column if not exists dropoff_photo_urls       text[] not null default '{}';

create index if not exists brand_visits_rep_date_idx
  on public.brand_visits (rep_id, visit_date desc);
create index if not exists brand_visits_account_date_idx
  on public.brand_visits (account_id, visit_date desc);
create index if not exists brand_visits_date_idx
  on public.brand_visits (visit_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- budtender_training — unified log (self-serve from Klaviyo + live from reps)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.budtender_training (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  method text not null check (method in ('self_serve','live')),

  budtender_name   text not null,
  budtender_email  text,

  store_account_id   text not null,
  store_account_name text not null,

  module_slug     text not null,
  module_title    text,

  trained_by_rep_id uuid references public.vibes_reps(id),
  deck_id           uuid references public.training_decks(id),
  visit_id          uuid references public.brand_visits(id),
  klaviyo_profile_id text,

  completed_at timestamptz not null default now(),
  quiz_score   int check (quiz_score between 0 and 100)
);

create index if not exists budtender_training_store_idx
  on public.budtender_training (store_account_id, completed_at desc);
create index if not exists budtender_training_budtender_idx
  on public.budtender_training (lower(budtender_name), store_account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- goodie_log — line-item goodie spend per visit
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.goodie_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  visit_id           uuid references public.brand_visits(id) on delete cascade,
  rep_id             uuid not null references public.vibes_reps(id) on delete restrict,
  store_account_id   text,
  store_account_name text,

  item        text not null,
  cost        numeric(10,2) not null check (cost >= 0),
  receipt_url text,

  spent_on date not null default (now() at time zone 'America/New_York')::date
);

create index if not exists goodie_log_rep_date_idx
  on public.goodie_log (rep_id, spent_on desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- merch_inventory — per-rep car stock of Highsman merch / POP
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.merch_inventory (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.vibes_reps(id) on delete cascade,

  item_slug         text not null,
  item_label        text not null,
  qty_on_hand       int not null default 0 check (qty_on_hand >= 0),
  restock_threshold int not null default 5,
  updated_at        timestamptz not null default now(),

  unique (rep_id, item_slug)
);

create index if not exists merch_inventory_rep_idx
  on public.merch_inventory (rep_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ugc_review_queue — posts tagged @highsman awaiting marketing review
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ugc_review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  rep_id          uuid not null references public.vibes_reps(id) on delete restrict,
  visit_id        uuid references public.brand_visits(id) on delete set null,

  post_url        text,
  screenshot_url  text,
  caption         text,
  suggested_hashtags text[] not null default '{}',

  status text not null default 'pending'
         check (status in ('pending','approved','rejected','reshared')),
  reviewed_by      text,
  reviewed_at      timestamptz,
  reshare_done_at  timestamptz,
  review_notes     text
);

create index if not exists ugc_review_status_idx
  on public.ugc_review_queue (status, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER VIEW: account_last_vibes_visit
-- Drives the Tier 3 ROTATION bucket (stores 21+ days stale)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.account_last_vibes_visit as
select
  account_id,
  account_name,
  max(visit_date)                                   as last_visit_date,
  count(*)                                          as lifetime_visits,
  current_date - max(visit_date)                    as days_since_last
from public.brand_visits
group by account_id, account_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER VIEW: rep_goodie_month_to_date
-- Shows each active rep's month-to-date goodie spend for budget gauge
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.rep_goodie_month_to_date as
select
  r.id              as rep_id,
  r.full_name       as rep_name,
  r.daily_goodie_budget,
  coalesce(sum(g.cost) filter (
    where g.spent_on >= date_trunc('month', current_date)::date
  ), 0) as mtd_spent,
  coalesce(sum(g.cost) filter (
    where g.spent_on = current_date
  ), 0) as today_spent
from public.vibes_reps r
left join public.goodie_log g on g.rep_id = r.id
where r.active
group by r.id, r.full_name, r.daily_goodie_budget;

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER VIEW: store_training_summary
-- Per-store roll-up of trained budtenders for the Store Profile panel
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.store_training_summary as
select
  store_account_id,
  store_account_name,
  count(distinct lower(budtender_name)) filter (where method = 'self_serve')
    as self_serve_count,
  count(distinct lower(budtender_name)) filter (where method = 'live')
    as live_count,
  count(distinct lower(budtender_name))
    as total_trained_distinct,
  max(completed_at) as last_training_at
from public.budtender_training
group by store_account_id, store_account_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA — Serena + the two known training decks
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.vibes_reps
  (first_name, last_name, email, home_zip, max_drive_minutes, territory_label,
   territory_states, ig_handle, start_date, onboarding_through_date,
   schedule_days, daily_goodie_budget)
values
  ('Serena','Gonzalez','serena@highsman.com','07083', null,'Entire NJ',
   array['NJ']::text[],'serenahighsman','2026-05-06','2026-05-13',
   array[1,2,3,4,5]::int[], 60)
on conflict (email) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  home_zip = excluded.home_zip,
  max_drive_minutes = excluded.max_drive_minutes,
  territory_label = excluded.territory_label,
  territory_states = excluded.territory_states,
  ig_handle = excluded.ig_handle,
  start_date = excluded.start_date,
  onboarding_through_date = excluded.onboarding_through_date,
  schedule_days = excluded.schedule_days,
  daily_goodie_budget = excluded.daily_goodie_budget,
  updated_at = now();

insert into public.training_decks
  (title, module_slug, drive_file_id, duration_minutes, sort_order, summary)
values
  ('Product Sales Training',   'product-sales',   '1NDBMlSdb2Ft9UgpmOAXYdA8-e8hsHaas', 20, 10,
   'Core sales training deck covering Hit Stick, Pre-Rolls, and Ground Game positioning.'),
  ('Triple Infusion Training', 'triple-infusion', '1q1eQdNFZxE_WS1yqdCUdLDyvxYNT05HK', 15, 20,
   'Deep dive on the Triple Infusion Pre-Roll line — flavor profiles, effects, pairing.')
on conflict (module_slug) do update set
  title = excluded.title,
  drive_file_id = excluded.drive_file_id,
  duration_minutes = excluded.duration_minutes,
  sort_order = excluded.sort_order,
  summary = excluded.summary;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — service-role only (Hydrogen actions use SERVICE KEY)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.vibes_reps           enable row level security;
alter table public.training_decks       enable row level security;
alter table public.brand_visits         enable row level security;
alter table public.budtender_training   enable row level security;
alter table public.goodie_log           enable row level security;
alter table public.merch_inventory      enable row level security;
alter table public.ugc_review_queue     enable row level security;
-- No policies = no access for non-service-role clients. Service role bypasses.
