-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Staff Travel Expenses (2026-04-18)
-- ─────────────────────────────────────────────────────────────────────────────
-- Parallel table to `goodie_receipts` but for any Highsman staff member
-- traveling and submitting a reimbursable expense (hotel, flight, meal,
-- Uber, trade-show supplies, etc.). Differs from goodies because:
--   • No rep_id / account link — can be anyone on the team
--   • Staff member types their own name
--   • Bill.com auto-files under a different GL category (Travel vs Goodies)
--     via a distinct subject line ("EXPENSE · ..." vs "Goodies Receipt · ...")
--
-- Fields mirror goodie_receipts where applicable so future reporting can
-- UNION the two tables if needed.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.staff_expenses (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  staff_name        text not null,

  amount            numeric(10,2) not null check (amount >= 0),
  vendor            text,   -- Hotel/airline/restaurant/Uber — optional
  notes             text,

  receipt_photo_url text not null,

  -- Email audit trail (Bill.com auto-file)
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

-- RLS (service_role bypasses, Oxygen writes exclusively via service_role key)
alter table public.staff_expenses enable row level security;

-- Verification query — run after migration:
--   select staff_name, amount, vendor, emailed_at, email_error
--   from public.staff_expenses
--   order by created_at desc limit 10;
