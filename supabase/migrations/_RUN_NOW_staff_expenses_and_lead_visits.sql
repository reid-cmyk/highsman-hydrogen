-- ═════════════════════════════════════════════════════════════════════════════
-- RUN-ME-NOW bundle (2026-04-18)
-- ═════════════════════════════════════════════════════════════════════════════
-- Paste this whole file into Supabase SQL Editor → Run.
-- Covers both pending migrations in one shot:
--   1. staff_expenses   (for /expense traveler reimbursements → Bill.com)
--   2. lead_visits      (for /vibes/lead-visit sampling drop-ins → Zoho Leads)
-- Both are idempotent (create if not exists) — safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─── 1. staff_expenses ───────────────────────────────────────────────────────

create table if not exists public.staff_expenses (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  staff_name        text not null,

  amount            numeric(10,2) not null check (amount >= 0),
  vendor            text,
  notes             text,

  receipt_photo_url text not null,

  emailed_to        text,
  emailed_at        timestamptz,
  email_id          text,
  email_error       text
);

create index if not exists staff_expenses_name_date_idx
  on public.staff_expenses (staff_name, created_at desc);
create index if not exists staff_expenses_date_idx
  on public.staff_expenses (created_at desc);
create index if not exists staff_expenses_email_error_idx
  on public.staff_expenses (created_at desc)
  where email_error is not null;

alter table public.staff_expenses enable row level security;


-- ─── 2. lead_visits ──────────────────────────────────────────────────────────

create table if not exists public.lead_visits (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  rep_id            uuid references public.vibes_reps(id) on delete set null,
  rep_name          text,

  zoho_lead_id      text,
  lead_company      text not null,
  lead_city         text,
  lead_state        text,

  interest_level    text not null
    check (interest_level in ('cold','warm','hot','red_hot')),
  contact_name      text,
  contact_role      text,
  contact_is_buyer  boolean default false,
  samples_left      text,
  discussion_notes  text,
  sales_handoff     text,

  created_new_lead  boolean default false,

  zoho_note_id      text,
  zoho_note_error   text,

  raw               jsonb
);

create index if not exists lead_visits_rep_date_idx
  on public.lead_visits (rep_id, created_at desc);
create index if not exists lead_visits_lead_idx
  on public.lead_visits (zoho_lead_id);
create index if not exists lead_visits_date_idx
  on public.lead_visits (created_at desc);
create index if not exists lead_visits_interest_idx
  on public.lead_visits (interest_level, created_at desc);

alter table public.lead_visits enable row level security;


-- ─── Verification ────────────────────────────────────────────────────────────

select 'staff_expenses' as tbl, count(*) as rows from public.staff_expenses
union all
select 'lead_visits' as tbl, count(*) as rows from public.lead_visits;
