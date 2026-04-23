# scripts/

One-off maintenance scripts. Not shipped to Oxygen — run locally from your workstation.

## backfill-klaviyo-store-account-id.mjs

Matches Klaviyo Budtender Training Camp profiles that are missing
`store_account_id` against Zoho Accounts (NJ/NY/MA/RI/MO) by normalized
dispensary name, then patches the match onto the Klaviyo profile.

**Why:** `rollupEnrollmentByStore()` in `app/lib/vibes-klaviyo-training.ts`
silently skips profiles without `store_account_id`. Profiles created before
we shipped the store-attributed signup flow only have `dispensary_name` or
`organization` set — this script brings them up to spec so they appear
on the correct `/vibes` store card.

### Run

```powershell
# From repo root, in PowerShell (Windows):

$env:KLAVIYO_PRIVATE_KEY="pk_..."
$env:ZOHO_CLIENT_ID="..."
$env:ZOHO_CLIENT_SECRET="..."
$env:ZOHO_REFRESH_TOKEN="..."

# Dry-run — writes scripts/backfill-preview.json, no Klaviyo writes
node scripts/backfill-klaviyo-store-account-id.mjs

# Review the preview, then apply
node scripts/backfill-klaviyo-store-account-id.mjs --apply
```

### Output files

- `scripts/backfill-preview.json` — always written. Lists every profile on
  the training list bucketed as:
  - `alreadySet` — already has `store_account_id` (no-op)
  - `matched` — exact normalized-name match → will be patched on `--apply`
  - `ambiguous` — no exact match but 2+ token overlap with some Zoho account.
    **Requires manual review.**
  - `unmatched` — no plausible Zoho account. Likely a typo in `dispensary_name`
    or a store not in your CRM.

- `scripts/backfill-results.json` — written only on `--apply`. Contains the
  per-profile patch result (`ok` | `error`) for audit.

### Safety

- Dry-run is the default. You must pass `--apply` to make writes.
- Only the `matched` bucket is patched. Ambiguous and unmatched profiles
  are left untouched — handle those manually via the Klaviyo UI.
- Idempotent — running `--apply` twice is safe (second pass becomes a no-op
  because `store_account_id` is now set).
- The patch also sets `backfilled_store_id_at` so you can audit which profiles
  came from this script vs. the live signup flow.
