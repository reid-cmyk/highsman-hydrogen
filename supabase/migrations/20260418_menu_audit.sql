-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Menu Audit (2026-04-18)
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds the 10 new columns to `brand_visits` that back the new Menus step in
-- /vibes/visit/new. Every Vibes visit now audits BOTH the in-store digital
-- menu AND the store's online menu for accuracy across 5 checks per SKU:
--   photo · category · brand · size · price
--
-- Per-SKU JSONB payload shape (keyed by `${formatSlug}__${strainSlug}`):
--   {
--     onMenu: boolean | null,
--     photo:    'ok' | 'wrong' | null,
--     category: 'ok' | 'wrong' | null,
--     brand:    'ok' | 'wrong' | null,
--     size:     'ok' | 'wrong' | null,
--     price:    'ok' | 'wrong' | null,
--     priceSeen: string?,
--     notes: string?
--   }
--
-- `menu_flags` is a denormalized summary counter (count of 'wrong' per-check
-- results + count of SKUs flagged onMenu=false) so the sales team dashboard
-- can list stores with open issues without parsing the JSONB per row.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.brand_visits
  add column if not exists menu_instore_checked     boolean not null default false,
  add column if not exists menu_instore_na          boolean not null default false,
  add column if not exists menu_instore_audit       jsonb   not null default '{}'::jsonb,
  add column if not exists menu_instore_photo_urls  text[]  not null default '{}',
  add column if not exists menu_online_checked      boolean not null default false,
  add column if not exists menu_online_na           boolean not null default false,
  add column if not exists menu_online_url          text,
  add column if not exists menu_online_audit        jsonb   not null default '{}'::jsonb,
  add column if not exists menu_online_photo_urls   text[]  not null default '{}',
  add column if not exists menu_flags               int     not null default 0;

-- Fast "stores with open menu issues this month" queries.
create index if not exists brand_visits_menu_flags_idx
  on public.brand_visits (account_id, visit_date desc)
  where menu_flags > 0;

-- Verification query — run after migration:
--   select account_name, visit_date, menu_flags,
--          menu_instore_checked, menu_online_checked
--   from public.brand_visits
--   order by visit_date desc
--   limit 5;
