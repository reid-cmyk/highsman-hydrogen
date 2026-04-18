-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Lead (Sampling) Visits (2026-04-18)
-- ─────────────────────────────────────────────────────────────────────────────
-- Lightweight sampling-visit log. When a Vibes rep drops into a PROSPECT
-- dispensary (not yet in Accounts) for a sampling touch, she doesn't need
-- the full 5-step visit flow (no SKU audit, no merch, no live training).
-- This is a 5-question drop-in:
--
--   1. Interest level       (cold / warm / hot / red_hot)
--   2. Who she talked to     (contact_name, contact_role, is_buyer flag)
--   3. Samples left          (free text)
--   4. Discussion notes      (free text — what was said / takeaways)
--   5. Sales handoff         (free text — what the salesperson should know)
--
-- Data targets Zoho LEADS (not Accounts). A new lead can be created inline
-- during the submit if the dispensary isn't already tracked.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lead_visits (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Rep attribution (optional — allows solo drop-ins if no rep row yet)
  rep_id            uuid references public.vibes_reps(id) on delete set null,
  rep_name          text,

  -- Zoho Lead reference (either pre-existing or just created inline)
  zoho_lead_id      text,
  lead_company      text not null,
  lead_city         text,
  lead_state        text,

  -- The 5 questions
  interest_level    text not null
    check (interest_level in ('cold','warm','hot','red_hot')),
  contact_name      text,
  contact_role      text,
  contact_is_buyer  boolean default false,
  samples_left      text,
  discussion_notes  text,
  sales_handoff     text,

  -- Was the Lead created inline as part of this visit?
  created_new_lead  boolean default false,

  -- Zoho Note attach audit (non-fatal if it fails)
  zoho_note_id      text,
  zoho_note_error   text,

  -- Raw payload for debugging
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

-- RLS (service_role bypasses, Oxygen writes exclusively via service_role)
alter table public.lead_visits enable row level security;

-- Verification query — run after migration:
--   select lead_company, interest_level, contact_name, created_at
--   from public.lead_visits
--   order by created_at desc limit 10;
