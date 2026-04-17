-- ─────────────────────────────────────────────────────────────────────────────
-- Highsman Spark Team — Shift Reports schema
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this once in your Supabase SQL editor after creating the project.
-- Safe to re-run: every statement uses IF NOT EXISTS / IF EXISTS guards.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- shift_reports — one row per end-of-shift submission
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- ─── Section 01: Shift Logistics ────────────────────────────────────────
  rep_name        text not null,
  account_id      text not null,        -- Zoho Account ID
  account_name    text not null,
  account_city    text,
  shift_date      date not null,

  -- ─── Section 02: Sales Performance ──────────────────────────────────────
  intercepts          int not null check (intercepts >= 0),
  closes              int not null check (closes >= 0),
  -- stored so historical reports don't shift if we change the calc later
  close_rate          numeric(5,4) generated always as (
                        case when intercepts > 0
                             then closes::numeric / intercepts
                             else 0
                        end
                      ) stored,
  primary_objection   text,
  objection_handling  text,
  extra_notes         text[] not null default '{}',
  sales_feedback      text,

  -- ─── Section 03: Retail Intelligence ────────────────────────────────────
  menu_visibility     text,
  merch_setup         text,
  merch_opportunity   text,
  promos_setup        text,
  manager_first       text,
  manager_last        text,
  budtender_rating    int check (budtender_rating between 0 and 10),
  product_notes       text,

  -- ─── Section 04: Self-Assessment ────────────────────────────────────────
  aggression          int not null check (aggression between 1 and 10),
  improvement_notes   text,

  -- ─── Photo URLs (R2 public URLs) ────────────────────────────────────────
  setup_photo_url         text not null,
  merch_photo_urls        text[] not null default '{}',
  opportunity_photo_urls  text[] not null default '{}',

  -- ─── Grading (computed at submission; stored so rubric changes don't
  --              retroactively change historical grades) ──────────────────
  grade_letter        text check (grade_letter in ('A','B','C','D','F')),
  grade_score         int  check (grade_score between 0 and 100)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for the most common /ops dashboard queries
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists shift_reports_rep_date_idx
  on public.shift_reports (rep_name, shift_date desc);

create index if not exists shift_reports_account_date_idx
  on public.shift_reports (account_id, shift_date desc);

create index if not exists shift_reports_date_idx
  on public.shift_reports (shift_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper view: rolling 30-day rep scoreboard
-- Aggregates every rep's last 30 days of reports for the /ops Scoreboard card.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.rep_scoreboard_30d as
select
  rep_name,
  count(*)                                                as reports,
  sum(intercepts)                                         as total_intercepts,
  sum(closes)                                             as total_closes,
  case when sum(intercepts) > 0
       then round(sum(closes)::numeric / sum(intercepts), 4)
       else 0
  end                                                     as avg_close_rate,
  round(avg(aggression)::numeric, 2)                      as avg_aggression,
  round(avg(grade_score)::numeric, 1)                     as avg_grade_score,
  mode() within group (order by grade_letter)             as mode_grade_letter,
  max(shift_date)                                         as last_shift_date
from public.shift_reports
where shift_date >= current_date - interval '30 days'
group by rep_name
order by avg_grade_score desc nulls last;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper view: dispensary coverage pulse
-- Last-visit timestamp per Account, used by /ops Coverage Pulse card.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.account_last_shift as
select
  account_id,
  account_name,
  account_city,
  max(shift_date)                                         as last_shift_date,
  count(*)                                                as lifetime_reports,
  current_date - max(shift_date)                          as days_since_last
from public.shift_reports
group by account_id, account_name, account_city;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
-- The Hydrogen action uses the SERVICE ROLE key (server-only, bypasses RLS).
-- RLS is enabled as a safety net so the anon/public keys CAN'T read or write
-- this table if they ever get exposed. Update the policy when a staff-facing
-- Supabase client is added.
alter table public.shift_reports enable row level security;

-- No policies = no access for non-service-role clients. (Service role bypasses.)
-- When we add a staff dashboard backed directly by Supabase, add a policy here
-- keyed on a custom JWT claim or auth.uid().
