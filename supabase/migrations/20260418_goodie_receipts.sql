-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Goodies Receipts (2026-04-18)
-- ─────────────────────────────────────────────────────────────────────────────
-- New table to track every receipt Serena scans when she buys goodies for
-- a specific dispensary. Each row captures:
--   • WHO bought it (rep_id + rep_name)
--   • WHAT store it's for (account_id + account_name → Zoho)
--   • HOW MUCH it cost (amount)
--   • WHERE she bought it (vendor — Target, Costco, etc.)
--   • Evidence (receipt_photo_url — R2-hosted JPG)
--   • Optional: which visit it was tied to (visit_id → brand_visits)
--
-- On submit, the receipt is auto-emailed from spark@highsman.com to
-- greensparkllc@bill.com (tagged with rep + dispensary in the subject) so
-- Bill.com's inbox parser can file it for reimbursement automatically.
--   • emailed_to / emailed_at / email_id — Resend message record
--   • email_error — captured if Resend returned non-2xx so ops can retry
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.goodie_receipts (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Optional link to the visit this receipt was purchased for. Nullable
  -- because Serena often buys goodies before a visit is started.
  visit_id          uuid references public.brand_visits(id) on delete set null,

  rep_id            uuid not null references public.vibes_reps(id) on delete restrict,
  rep_name          text not null,

  -- Destination dispensary (the receipt's purpose, not where it was bought)
  account_id        text,
  account_name      text,
  account_state     text,

  amount            numeric(10,2) not null check (amount >= 0),
  vendor            text,   -- e.g. Target, Costco — optional
  notes             text,

  receipt_photo_url text not null,

  -- Email audit trail (Bill.com auto-file)
  emailed_to        text,
  emailed_at        timestamptz,
  email_id          text,
  email_error       text
);

create index if not exists goodie_receipts_rep_date_idx
  on public.goodie_receipts (rep_id, created_at desc);
create index if not exists goodie_receipts_account_date_idx
  on public.goodie_receipts (account_id, created_at desc);
create index if not exists goodie_receipts_visit_idx
  on public.goodie_receipts (visit_id);
create index if not exists goodie_receipts_email_error_idx
  on public.goodie_receipts (created_at desc)
  where email_error is not null;

-- RLS (service_role bypasses, Oxygen writes exclusively via service_role key)
alter table public.goodie_receipts enable row level security;

-- Verification query — run after migration:
--   select rep_name, account_name, amount, emailed_at, email_error
--   from public.goodie_receipts
--   order by created_at desc limit 10;
