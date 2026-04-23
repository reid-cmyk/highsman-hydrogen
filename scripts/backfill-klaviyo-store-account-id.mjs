#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Backfill: Klaviyo dispensary_name → store_account_id
// ─────────────────────────────────────────────────────────────────────────────
// Why this script exists:
//   The /vibes Training Camp panel rolls up enrollment per store by reading
//   `store_account_id` off each Klaviyo profile. Profiles that signed up before
//   we shipped the store-attributed flow don't have it set — they only have
//   a `dispensary_name` string or an `organization` attribute. Those profiles
//   get silently dropped from `rollupEnrollmentByStore()` in
//   app/lib/vibes-klaviyo-training.ts.
//
//   This script matches those orphans by normalized name against Zoho
//   Accounts (NJ/NY/MA/RI/MO) and patches `store_account_id` onto them.
//
// Run modes:
//   node scripts/backfill-klaviyo-store-account-id.mjs
//       ↳ dry-run: writes preview JSON, no Klaviyo writes
//
//   node scripts/backfill-klaviyo-store-account-id.mjs --apply
//       ↳ executes klaviyo_update_profile for every high-confidence match
//
// Required env vars:
//   KLAVIYO_PRIVATE_KEY
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
//
// Output:
//   scripts/backfill-preview.json  (always)
//   scripts/backfill-results.json  (only when --apply)
// ─────────────────────────────────────────────────────────────────────────────

import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const APPLY = process.argv.includes('--apply');
const OUT_DIR = resolve(new URL('.', import.meta.url).pathname);

const KLAVIYO_KEY = process.env.KLAVIYO_PRIVATE_KEY;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;

if (!KLAVIYO_KEY) die('KLAVIYO_PRIVATE_KEY missing');
if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
  die('Zoho credentials missing (ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN)');
}

const KLAVIYO_LIST_ID = 'WBSrLZ';
const KLAVIYO_HEADERS = {
  Authorization: `Klaviyo-API-Key ${KLAVIYO_KEY}`,
  Accept: 'application/json',
  revision: '2024-10-15',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`\n[FATAL] ${msg}\n`);
  process.exit(1);
}

function normalizeStoreName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function klaviyoFetch(url) {
  const res = await fetch(url, {headers: KLAVIYO_HEADERS});
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo ${res.status} ${url.slice(0, 80)}… — ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPages(url) {
  const all = [];
  let next = url;
  while (next) {
    const data = await klaviyoFetch(next);
    all.push(...(data.data ?? []));
    next = data.links?.next ?? null;
  }
  return all;
}

// ─── Zoho token ──────────────────────────────────────────────────────────────

let cachedZohoToken = null;
async function getZohoToken() {
  if (cachedZohoToken) return cachedZohoToken;
  const body = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    die(`Zoho token (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.access_token) die('Zoho token response missing access_token');
  cachedZohoToken = data.access_token;
  return cachedZohoToken;
}

// ─── Pull Zoho Accounts (NJ/NY/MA/RI/MO) ────────────────────────────────────

async function fetchZohoAccounts() {
  const token = await getZohoToken();
  const accounts = [];
  const states = ['NJ', 'NY', 'MA', 'RI', 'MO'];

  // COQL doesn't allow OR across 5 values nicely — fetch per state.
  for (const st of states) {
    let offset = 0;
    while (true) {
      const query = `
        select id, Account_Name, Account_State, Billing_State, Shipping_State, Billing_City
        from Accounts
        where Account_State = '${st}' or Billing_State = '${st}' or Shipping_State = '${st}'
        limit ${offset}, 200
      `.trim();
      // COQL requires binary AND/OR — three-way OR needs nesting.
      const nested = `
        select id, Account_Name, Account_State, Billing_State, Shipping_State, Billing_City
        from Accounts
        where ((Account_State = '${st}' or Billing_State = '${st}') or Shipping_State = '${st}')
        limit ${offset}, 200
      `.trim();

      const res = await fetch('https://www.zohoapis.com/crm/v7/coql', {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({select_query: nested}),
      });

      if (res.status === 204) break; // No more rows
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`  [zoho] ${st} page ${offset / 200} failed ${res.status}: ${text.slice(0, 200)}`);
        break;
      }
      const json = await res.json();
      const rows = json.data ?? [];
      accounts.push(...rows);
      if (rows.length < 200) break;
      offset += 200;
    }
  }

  // Deduplicate by id (a NJ store might also have Billing_State NY etc.)
  const byId = new Map();
  for (const a of accounts) if (a.id) byId.set(a.id, a);
  return [...byId.values()];
}

// ─── Pull Klaviyo profiles in the training list ─────────────────────────────

async function fetchListProfiles() {
  console.log(`  [klaviyo] enumerating list ${KLAVIYO_LIST_ID}…`);
  const idsUrl = `https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/?page[size]=100`;
  const idRecords = await fetchAllPages(idsUrl);
  const profileIds = idRecords.map((r) => r.id).filter(Boolean);
  console.log(`  [klaviyo] ${profileIds.length} profile IDs on list`);

  const profiles = [];
  const BATCH = 50;
  for (let i = 0; i < profileIds.length; i += BATCH) {
    const batch = profileIds.slice(i, i + BATCH);
    const idFilter = batch.map((id) => `"${id}"`).join(',');
    const url =
      `https://a.klaviyo.com/api/profiles/?filter=any(id,[${idFilter}])` +
      `&fields[profile]=email,first_name,last_name,organization,properties,created` +
      `&page[size]=100`;
    const chunk = await fetchAllPages(url);
    profiles.push(...chunk);
    process.stdout.write(`  [klaviyo] fetched ${profiles.length}/${profileIds.length}\r`);
  }
  console.log('');
  return profiles;
}

// ─── Patch a profile's store_account_id ─────────────────────────────────────

async function patchProfile(profileId, storeAccountId, storeAccountName) {
  const res = await fetch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
    method: 'PATCH',
    headers: {
      ...KLAVIYO_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        id: profileId,
        attributes: {
          properties: {
            store_account_id: storeAccountId,
            dispensary_name: storeAccountName,
            backfilled_store_id_at: new Date().toISOString(),
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`patch ${profileId} → ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Klaviyo store_account_id backfill (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const [profiles, accounts] = await Promise.all([
    fetchListProfiles(),
    fetchZohoAccounts(),
  ]);

  console.log(`  [zoho] ${accounts.length} dedup'd accounts across NJ/NY/MA/RI/MO`);

  // Build name lookup
  const nameToAccount = new Map();
  for (const a of accounts) {
    const key = normalizeStoreName(a.Account_Name || '');
    if (!key) continue;
    // First-writer-wins — duplicate names would need manual disambiguation
    if (!nameToAccount.has(key)) nameToAccount.set(key, a);
  }
  console.log(`  [zoho] ${nameToAccount.size} unique normalized names available\n`);

  const alreadySet = [];
  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  for (const p of profiles) {
    const attrs = p.attributes ?? {};
    const props = attrs.properties ?? {};
    const email = attrs.email || '(no email)';
    const name = `${attrs.first_name ?? ''} ${attrs.last_name ?? ''}`.trim() || email;

    if (props.store_account_id) {
      alreadySet.push({profileId: p.id, email, store_account_id: props.store_account_id});
      continue;
    }

    const dispName = props.dispensary_name || attrs.organization || '';
    if (!dispName) {
      unmatched.push({profileId: p.id, email, name, reason: 'no dispensary_name or organization'});
      continue;
    }

    const key = normalizeStoreName(dispName);
    const hit = nameToAccount.get(key);
    if (hit) {
      matched.push({
        profileId: p.id,
        email,
        name,
        dispensary_name: dispName,
        zoho_account_id: hit.id,
        zoho_account_name: hit.Account_Name,
        zoho_state: hit.Account_State || hit.Billing_State || hit.Shipping_State || null,
        confidence: 'exact-normalized',
      });
    } else {
      // Try a looser token-overlap check for ambiguous suggestions
      const tokens = new Set(key.split(' ').filter((t) => t.length >= 3));
      const candidates = [];
      for (const [k, acc] of nameToAccount) {
        const keyTokens = new Set(k.split(' ').filter((t) => t.length >= 3));
        let overlap = 0;
        for (const t of tokens) if (keyTokens.has(t)) overlap += 1;
        if (overlap >= 2) candidates.push({overlap, acc, key: k});
      }
      candidates.sort((a, b) => b.overlap - a.overlap);
      if (candidates.length) {
        ambiguous.push({
          profileId: p.id,
          email,
          name,
          dispensary_name: dispName,
          normalized: key,
          candidates: candidates.slice(0, 3).map((c) => ({
            zoho_account_id: c.acc.id,
            zoho_account_name: c.acc.Account_Name,
            normalized: c.key,
            token_overlap: c.overlap,
          })),
        });
      } else {
        unmatched.push({
          profileId: p.id,
          email,
          name,
          dispensary_name: dispName,
          reason: 'no matching Zoho account',
        });
      }
    }
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    stats: {
      totalProfilesOnList: profiles.length,
      alreadyAttributed: alreadySet.length,
      exactMatches: matched.length,
      ambiguousNeedManualReview: ambiguous.length,
      unmatched: unmatched.length,
    },
    alreadySet,
    matched,
    ambiguous,
    unmatched,
  };

  const previewPath = resolve(OUT_DIR, 'backfill-preview.json');
  writeFileSync(previewPath, JSON.stringify(summary, null, 2));
  console.log(`\n  PREVIEW → ${previewPath}`);
  console.log(`  Total on list:         ${profiles.length}`);
  console.log(`  Already attributed:    ${alreadySet.length}`);
  console.log(`  Exact matches:         ${matched.length}  ← would patch on --apply`);
  console.log(`  Ambiguous (manual):    ${ambiguous.length}`);
  console.log(`  Unmatched:             ${unmatched.length}`);

  if (!APPLY) {
    console.log('\n  DRY-RUN: no writes performed. Re-run with --apply to patch matched profiles.\n');
    return;
  }

  console.log(`\n  APPLYING ${matched.length} patches…`);
  const results = [];
  let ok = 0;
  let fail = 0;
  for (const m of matched) {
    try {
      await patchProfile(m.profileId, m.zoho_account_id, m.zoho_account_name);
      results.push({...m, status: 'ok'});
      ok += 1;
    } catch (err) {
      results.push({...m, status: 'error', error: String(err?.message ?? err)});
      fail += 1;
    }
    if ((ok + fail) % 25 === 0) {
      process.stdout.write(`  patched ${ok + fail}/${matched.length}\r`);
    }
  }
  const resultsPath = resolve(OUT_DIR, 'backfill-results.json');
  writeFileSync(
    resultsPath,
    JSON.stringify({completedAt: new Date().toISOString(), ok, fail, results}, null, 2),
  );
  console.log(`\n\n  RESULTS → ${resultsPath}`);
  console.log(`  Patched OK: ${ok}   Failed: ${fail}\n`);
}

main().catch((err) => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
