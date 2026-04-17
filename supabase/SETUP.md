# Shift Report Backend Setup

Total time: **~5 minutes**. You set up two things — a Supabase project (for structured report data + dashboard queries) and a Cloudflare R2 bucket (for photos) — then paste six env vars into Shopify Oxygen.

---

## 1. Supabase (2 min)

### 1a. Create the project

1. Go to https://supabase.com/dashboard and click **New project**.
2. Name it `highsman-shift-reports` (or anything — this is just the label).
3. Pick the **US East** region (closest to Oxygen).
4. Save the database password somewhere — you won't need it for the app, but you'll want it if you ever use the Supabase SQL editor as a superuser.
5. Wait ~60 seconds for the project to provision.

### 1b. Run the schema

1. In the left nav click **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` in this repo, copy the entire file.
3. Paste into the editor and click **Run**.
4. You should see "Success. No rows returned." Every statement is idempotent, so re-running is safe.

### 1c. Grab credentials

1. Left nav → **Project Settings** (gear icon) → **API**.
2. Copy **Project URL** (looks like `https://abcdefgh.supabase.co`) → this is `SUPABASE_URL`.
3. Copy the `service_role` key from the **Project API keys** section → this is `SUPABASE_SERVICE_KEY`.
   - ⚠️ This key bypasses RLS. Never commit it or expose it to the browser.

---

## 2. Cloudflare R2 (2 min)

### 2a. Create the bucket

1. Go to https://dash.cloudflare.com → **R2 Object Storage** → **Create bucket**.
2. Name: `highsman-shift-reports`.
3. Location: **Automatic** (Cloudflare picks).
4. Default storage class: **Standard**.
5. Click **Create bucket**.

### 2b. Enable public access (for photo URLs)

The dashboard needs public read on the photo URLs so `/ops` can render them.

1. Open the new bucket → **Settings** tab.
2. Under **Public access** → **R2.dev subdomain**, click **Allow Access**.
3. Copy the public URL (looks like `https://pub-abc123def.r2.dev`) → this is `R2_PUBLIC_URL`.
   - Later you can swap this for a custom domain like `reports.highsman.com`. Just update `R2_PUBLIC_URL` — upload code doesn't change.

### 2c. Create an API token

1. R2 main page → **Manage R2 API Tokens** (top right).
2. Click **Create API token**.
3. Name: `highsman-hydrogen-shift-reports`.
4. Permissions: **Object Read & Write**.
5. Specify bucket: pick `highsman-shift-reports` only.
6. TTL: **Forever** (or 1 year — we rotate manually).
7. Click **Create API Token**.
8. You'll see three values. Copy:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   - **Account ID** (visible at the top of the R2 page) → `R2_ACCOUNT_ID`

Don't close the page until all three are saved — Cloudflare won't show the secret again.

---

## 3. Paste env vars into Oxygen (1 min)

1. Open Shopify admin → **Hydrogen** → `highsman-hydrogen` storefront → **Storefront settings** → **Environments and variables**.
2. Pick the **Production** environment (and **Preview** too if you want staging to work).
3. Add these six vars:

   | Key                      | Value                                  |
   | ------------------------ | -------------------------------------- |
   | `SUPABASE_URL`           | `https://<yourref>.supabase.co`        |
   | `SUPABASE_SERVICE_KEY`   | `eyJ…` (service_role key)              |
   | `R2_ACCOUNT_ID`          | (from step 2c)                         |
   | `R2_ACCESS_KEY_ID`       | (from step 2c)                         |
   | `R2_SECRET_ACCESS_KEY`   | (from step 2c)                         |
   | `R2_BUCKET`              | `highsman-shift-reports`               |
   | `R2_PUBLIC_URL`          | `https://pub-<id>.r2.dev`              |

   (That's technically seven including `R2_BUCKET` + `R2_PUBLIC_URL` — the name is obvious and the public URL just needs swapping when you move to a custom domain.)

4. Click **Save**. Oxygen redeploys in ~30 seconds.

---

## 4. Smoke test

1. Open `https://highsman.com/shift-report` (staff only — `noindex`).
2. Fill in the required fields, upload the setup photo, hit submit.
3. Success panel should show a real `REPORT #XXXXXXXX` id (not `STUB-…`).
4. Back in Supabase → **Table Editor** → `shift_reports` → the row should be there with the photo URL populated.
5. Click the URL in the `setup_photo_url` column — the image should load from `r2.dev`.

If submission fails with "submission backend (Supabase) isn't live yet" — the env vars didn't land. Check Oxygen's env and redeploy.

---

## 5. What's where after setup

| Artifact                    | Lives in                     | Used by                         |
| --------------------------- | ---------------------------- | ------------------------------- |
| Report rows                 | `shift_reports` (Supabase)   | `/ops` Scoreboard, grading      |
| Rolling 30-day rep scores   | `rep_scoreboard_30d` (view)  | `/ops` Scoreboard card          |
| Last-visit per dispensary   | `account_last_shift` (view)  | `/ops` Coverage Pulse card      |
| Photos                      | R2 bucket (public-read URLs) | Dashboard thumbnails, audits    |
| Grade calc                  | `api.shift-report-submit.ts` | Stored on insert (immutable)    |

---

## Future swaps

- **Custom photo domain**: set `R2_PUBLIC_URL=https://reports.highsman.com` once you add a CNAME in Cloudflare → R2.
- **RLS policies**: if we build a Supabase-backed staff client (instead of going through the Hydrogen action), add RLS policies keyed on `auth.jwt()` claims. Schema already has RLS enabled with zero policies, so non-service-role clients have zero access today.
- **Retention**: R2 doesn't age out photos by default. Add an R2 lifecycle rule after ~12 months if storage cost becomes a concern.
