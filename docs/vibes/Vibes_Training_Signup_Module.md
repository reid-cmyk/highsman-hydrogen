# Vibes Training Signup Module — Design Spec
**Page:** highsman.com/vibes
**Owner:** Reid Sterrett · **Primary user:** Serena (NJ Vibes rep)
**Ship target:** Before NJ product launch · **Date:** 2026-04-23

---

## Why this exists

The /vibes page is Serena's operating dashboard for NJ store visits. Budtender training enrollment needs to be a **first-class, unmissable** part of every store visit — not a submenu, not a separate page. For the NJ launch, the number of trained budtenders per dispensary is one of the three metrics that predicts sell-through (alongside shelf presence and facings). If Serena leaves a store and hasn't gotten budtenders signed up, the visit is incomplete.

Today the `/vibes` store card shows visit history, shelf status, and goodie spend. **It does not show training enrollment status, and there's no on-card path to sign a budtender up.** Serena is routing budtenders to the `/budtenders` Training Camp URL verbally or over text, and we have no per-store attribution on who's enrolled from where.

---

## Goal

1. **One-tap budtender signup** during any store visit — QR code primary, manual entry backup.
2. **Per-store visibility** of training progress: `enrolled / roster · %` with a progress bar, pinned to every store card.
3. **Serena-editable roster** — she updates headcount per store as she learns it, and the denominator updates live.
4. **Attribution** — every signup is tagged to the store_account_id so Klaviyo Training Camp metrics roll up per dispensary.

---

## The store-card training panel (pinned, always visible)

Every store card on `/vibes` gets a new **Training** module. It sits directly under the Store name + Address block, above the visit history and shelf audit. It is **never collapsed** — Serena should see it at a glance from her phone on the sales floor.

### Layout (mobile-first, 380px frame)

```
┌─────────────────────────────────────────┐
│  TRAINING CAMP                          │
│  ───────────────────────────────        │
│  8 / 12 enrolled · 67%                  │
│  ████████████████░░░░░░░░               │
│  4 completed Tier 1 · Last: 3 days ago  │
│                                         │
│  [  📱  Sign up budtenders  →  ]        │  ← big primary CTA
│                                         │
│  Roster: 12 budtenders  ✎ edit          │  ← inline editable
└─────────────────────────────────────────┘
```

### Visual rules (per `highsman-brand-voice` + existing /vibes design system)

- **Container:** Dark card (#0A0A0A) with 1px Quarter Gray (#A9ACAF) border. 16px inner padding.
- **Heading:** "TRAINING CAMP" in Teko, 14px, tracking 0.15em, uppercase, Highsman Yellow (#F5E100).
- **Fraction line:** Barlow Semi Condensed 20px bold. `8 / 12 enrolled · 67%` — the 8 and the 67% are yellow, the rest is white.
- **Progress bar:** 6px tall, yellow fill on Quarter Gray track. Animates on load (300ms ease-out).
- **Secondary line:** Barlow 13px, Quarter Gray. Shows tier-1 completion count + relative-time since last signup at this store.
- **Primary CTA:** Full-width yellow button (#F5E100), black text, Teko 18px, 48px tall. Phone emoji optional; the arrow is a right-pointing SVG chevron.
- **Roster line:** Barlow 13px, Quarter Gray. The pencil icon is tappable — opens the inline roster editor.

### States

| Condition | What the card shows |
|---|---|
| `roster = null`, `enrolled = 0` | Fraction hidden. Shows **"No roster set yet"** and a yellow-bordered outline CTA **"Set budtender headcount"** above the signup button. |
| `enrolled > 0`, `roster = null` | Shows `8 enrolled · set roster to see %` with an inline "Add roster" link. |
| `enrolled = roster` (100%) | Yellow background on progress bar + small trophy icon + line reads **"Full roster trained — keep rotating."** |
| `roster > 0`, `enrolled < 20%` | Progress bar stays yellow but the fraction line is prefixed with a small red dot **"● Needs attention"** to prompt Serena. |
| `days since last signup > 30` | Secondary line flips to **"⚠ Stale — last signup 42 days ago"** in a muted red (#B33A3A). |

---

## Sign-up flow — QR primary, manual fallback

When Serena taps **Sign up budtenders**, the card expands into a **full-screen modal overlay** (not a new page — she stays in context on the store card). The modal has two panes toggled by a pill switch at the top:

### Pane A — QR code (default)

```
┌─────────────────────────────────────────┐
│ ×                                        │
│                                          │
│         SIGN UP BUDTENDERS                │
│         Green Leaf Dispensary · Newark    │
│                                          │
│         ┌───────────────────┐             │
│         │                   │             │
│         │    ▓▓ ▓▓  ▓▓▓▓    │             │
│         │    ▓▓▓▓ ▓▓ ▓▓     │   ← QR       │
│         │    ▓▓ ▓▓ ▓▓▓▓▓    │   (280×280) │
│         │                   │             │
│         └───────────────────┘             │
│                                          │
│   Have them scan this with their phone.   │
│   Takes 20 seconds. You'll see them pop   │
│   up here as they join.                   │
│                                          │
│   [   ⌨  Enter manually instead    ]      │
└─────────────────────────────────────────┘
```

- The QR encodes: `https://highsman.com/training/join/{storeToken}` where `storeToken` is a short signed JWT with the `account_id` baked in (no mutable secrets in the URL, just an opaque token).
- The modal **live-listens** to Supabase `budtender_training` inserts for this store (Supabase Realtime) — every new signup pops up as a small toast: **"✓ Marcus Reyes joined."** This gives Serena immediate visual confirmation without her having to refresh.
- Big, clear instruction copy in Serena's on-floor voice: *"Have them scan this with their phone."*

### Pane B — Manual entry

Used when a budtender's phone is dead, no service, or they're busy and Serena just wants to type their info in herself.

- Fields: `First name`, `Last name`, `Email`, `Phone` (optional), `Role` (picklist: Budtender / Manager / Owner).
- One-tap submit. Same backend endpoint as the QR scan.
- Stays on the manual pane after submit so Serena can rapid-fire enter a whole crew — fields clear, toast confirms, focus returns to First name.

---

## Public budtender signup landing (what the QR points to)

The budtender lands on `highsman.com/training/join/{storeToken}` on their own phone.

### Design principles

- **Mobile-only layout.** No desktop version needed — nobody scans a QR at a store on their laptop. Optimized for 375px / 414px viewports.
- **Fast.** 4 fields. No captcha. No account creation. One tap submit.
- **On-brand.** Same Teko/Barlow/yellow-on-black treatment as the main site. Store name displayed prominently so the budtender knows which dispensary this attaches to.

### Layout

```
┌────────────────────────────────┐
│       [ Highsman logo ]         │
│                                 │
│     JOIN THE TRAINING CAMP      │
│                                 │
│   You're signing up through:    │
│   GREEN LEAF · NEWARK           │
│                                 │
│   First name   [_________]      │
│   Last name    [_________]      │
│   Email        [_________]      │
│   Phone        [_________]      │
│                                 │
│   I am a                         │
│   ( ) Budtender                 │
│   ( ) Manager                   │
│   ( ) Owner                     │
│                                 │
│   [  START TRAINING  →  ]       │
│                                 │
│   You'll get your first deck    │
│   by email in under a minute.   │
└────────────────────────────────┘
```

### Confirmation state (after submit)

```
┌────────────────────────────────┐
│        ✓  You're in.            │
│                                 │
│   Check your email in about     │
│   60 seconds. Your first deck   │
│   — Hit Stick 101 — is on its   │
│   way.                          │
│                                 │
│   5 decks total.                │
│   Complete all 5 → Hall of Flame│
│                                 │
│   [  View the 5 decks  →  ]     │
└────────────────────────────────┘
```

No redirect, no page jump. The same route renders the confirmation in place. The "View the 5 decks" link goes to `/vibes/decks` (public training library).

---

## Roster editor (inline, no modal)

Tapping the pencil next to **Roster: 12 budtenders** on the store card opens an inline editor right where the text was:

```
Roster: [ 12 ] budtenders       [ Save ]  [ × ]
```

- Number input, keyboard-friendly. Default value is current roster. Save-on-blur or Save button.
- Writes to `vibes_store_profiles.budtender_headcount` (see migration below).
- Updates the % bar live on save.
- If Serena sets roster lower than current enrolled count (e.g. someone left the dispensary), the UI shows a one-time toast: **"Heads up — enrolled exceeds roster. Check if anyone's left the store."**

The headcount is **Serena-maintained** — it's based on what she observes during visits, not pulled from an external source. This is correct: budtender turnover is fast, and she has the best ground truth.

---

## Where the data lives — Klaviyo is the source of truth

**`/staff-dashboard` already reads enrollment + tier status live from Klaviyo.** `/vibes` must read from the same place so the two dashboards can never disagree. Building a parallel Supabase count for /vibes would be a data-integrity trap.

| Field | Store | Rationale |
|---|---|---|
| **Enrolled count (per store)** | Klaviyo list `WBSrLZ` filtered by custom profile property `store_account_id` | Same list /staff-dashboard uses. Adding `store_account_id` as a profile prop lets both dashboards roll up per dispensary without drift. |
| **Tier / course completion** | Klaviyo metric `UwTaBd` (`COURSE_COMPLETED`) events, keyed by profile | Identical tier computation as /staff-dashboard — we share `computeTier()` via the new `vibes-klaviyo-training.ts` helper. |
| **Signup event** | Klaviyo metric `Uir9Fc` — fired by `/api/training-signup` on every new profile | Keeps staff-dashboard's timeline accurate. |
| **Roster headcount** | Supabase `vibes_store_profiles.budtender_headcount` | This data doesn't exist in Klaviyo. Serena-edited, audit-logged. |
| **Live-signup mirror** | Supabase `budtender_training` (already exists) | Audit trail for Serena's on-site live signups + powers Supabase Realtime "✓ Marcus joined" toast on the QR modal. **Secondary** — never used as the enrollment count. |
| **Store display name** | Zoho CRM Account (already queried on /vibes) | Source of truth for dispensary name. |

### One-way data flow

```
   Budtender scans QR or Serena types manually
                │
                ▼
     /api/training-signup (action)
                │
       ┌────────┴────────┐
       ▼                 ▼
   Klaviyo            Supabase
   (source of         (mirror: audit +
   truth —            realtime toast)
   list WBSrLZ
   + store_account_id
   profile prop)
       │
       ▼
   read by BOTH
   /vibes AND /staff-dashboard
   via vibes-klaviyo-training.ts
```

### Required new Klaviyo profile properties (net-new)

- `store_account_id` *(string — Zoho Account ID)* — **the** store attribution key
- `signup_method` *(enum: `self_serve` | `live`)*
- `signed_up_by_rep` *(uuid — vibes_rep id, null for self-serve)*
- `budtender_role` *(enum: `Budtender` | `Manager` | `Owner`)*
- `signed_up_at` *(ISO timestamp)*

### Backfill plan for existing Klaviyo profiles

`/staff-dashboard` already uses `dispensary_name` (free-text string) for rollup. We backfill `store_account_id` onto existing profiles by matching `dispensary_name` → Zoho Account via a one-time script:

1. Pull all Klaviyo profiles on list `WBSrLZ`.
2. Fuzzy-match `dispensary_name` against Zoho `Account_Name`.
3. PATCH `store_account_id` onto matched profiles.
4. Unmatched profiles go into a manual-review queue (CSV) for Serena/Reid.

This runs once pre-launch. New signups always get `store_account_id` set at signup time (no backfill ever needed again).

---

## Metrics that show up on the card (plain-English definitions)

All numbers are computed by `vibes-klaviyo-training.ts` against Klaviyo — the same helper `/staff-dashboard` uses. Store-card numbers will always equal staff-dashboard numbers filtered to that store.

- **`enrolled`** — count of Klaviyo profiles on list `WBSrLZ` with `store_account_id` matching this store.
- **`roster`** — the headcount Serena entered in the roster editor (Supabase).
- **`% enrolled`** — `enrolled / roster`, clamped 0–100%.
- **`Tier 1 completed`** — count of enrolled profiles with a `UwTaBd` event whose `course_id` is `meet-ricky` (matches staff-dashboard's Rookie-tier computation).
- **`last activity at store`** — max `datetime` across all course-completion events for this store's profiles, displayed as relative time.

---

## Non-negotiables

1. **The training panel is pinned** on every store card. It is not behind a tab, a modal, or a click-to-expand.
2. **QR signup is under 20 seconds** on the budtender's side. We measure this — the signup event fires a timing beacon.
3. **Signups attach to a store.** No store_account_id = we reject the signup. No orphan Klaviyo profiles.
4. **Signups are deduped.** Same email at same store = one `budtender_training` row, updated `completed_at`. We don't spam Klaviyo with repeat subscriptions.
5. **Roster edits are undoable.** Every change writes to an audit log so Serena can recover from a fat-finger.
6. **No Klaviyo popup on `/training/join/*`** per the project rule for non-consumer pages.

---

## Phase 1 ship (this week)

- [ ] SQL migration: `vibes_store_profiles` (roster), `training_signup_tokens` (QR tokens), `set_store_headcount()` RPC
- [ ] Shared Klaviyo helper (`app/lib/vibes-klaviyo-training.ts`) — consumed by /vibes AND /staff-dashboard going forward
- [ ] Refactor staff-dashboard loader to import from the shared helper (no behavior change — just deduplicate)
- [ ] Store-card Training panel component (`VibesTrainingPanel.tsx`)
- [ ] Public signup landing (`training.join.$storeToken.tsx`)
- [ ] Signup action (`api.training-signup.tsx`) — Klaviyo-first, Supabase mirror
- [ ] QR code generation helper using `qrcode` npm lib, rendered server-side on `/vibes`
- [ ] Roster editor inline UI (writes via `api.vibes-roster.tsx` → `set_store_headcount()` RPC)
- [ ] One-time backfill script: `dispensary_name` → `store_account_id` on existing Klaviyo profiles

## Phase 2 (post-launch, within 30 days)

- [ ] Supabase Realtime live-toast on the QR modal ("✓ Marcus joined.")
- [ ] Tier breakdown chip row (Rookie / Starting Lineup / Franchise Player / Hall of Flame)
- [ ] Serena leaderboard: stores with highest % enrolled this week
- [ ] Nudge automation: if a store has `enrolled/roster < 25%` for 14 days, auto-add to Serena's next-week route

---

## Success criteria (how we know this worked)

- **Within 30 days of NJ launch:** ≥ 60% of NJ dispensaries have at least 1 budtender enrolled.
- **Within 60 days:** median `% enrolled` per visited store is ≥ 50%.
- **Within 90 days:** ≥ 200 budtenders total enrolled, attributed to the correct store.

If these don't hit, the card design isn't the problem — the product-sales conversation is. This module gets the enrollment motion out of the way so Serena can focus on that.

---
