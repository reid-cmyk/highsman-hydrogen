/**
 * vibes-klaviyo-training.ts
 *
 * Shared Klaviyo helper that /vibes store cards AND /staff-dashboard
 * read from — one source of truth for budtender training enrollment
 * and course completion.
 *
 * Design principle: /vibes and /staff-dashboard MUST show the same numbers
 * for the same store. We prevent drift by routing both dashboards through
 * this one helper.
 *
 * Data contract (Klaviyo):
 *   • List:          WBSrLZ  (Budtender Training Camp)
 *   • Signup metric: Uir9Fc
 *   • Completion metric: UwTaBd   (fires once per course completed)
 *   • Custom profile properties we care about:
 *       - store_account_id   (Zoho Account ID — primary key for store rollups)
 *       - dispensary_name    (display string — also used by staff-dashboard)
 *       - budtender_state    ('NJ' | 'NY' | 'MA' | 'RI' | 'MO')
 *       - signup_method      ('self_serve' | 'live')
 *       - signed_up_by_rep   (vibes_rep id)
 *
 * Course order (matches staff-dashboard):
 *   1. meet-ricky          → Rookie
 *   2. meet-highsman       → Starting Lineup
 *   3. the-science         → Franchise Player
 *   4. product-training    → Hall of Flame
 *   5. rushing-bonus       → Hall of Flame
 */

// ─── Constants (duplicated from staff-dashboard so they stay in sync here) ───

export const KLAVIYO_TRAINING_LIST_ID = 'WBSrLZ';
export const KLAVIYO_COURSE_COMPLETED_METRIC_ID = 'UwTaBd';
export const KLAVIYO_SIGNUP_METRIC_ID = 'Uir9Fc';

export const COURSE_ORDER = [
  {id: 'meet-ricky', title: 'Meet Ricky', tierAfter: 'Rookie'},
  {id: 'meet-highsman', title: 'Highsman Brand Training', tierAfter: 'Starting Lineup'},
  {id: 'the-science', title: 'The Science', tierAfter: 'Franchise Player'},
  {id: 'product-training', title: 'Highsman Product Training', tierAfter: 'Hall of Flame'},
  {id: 'rushing-bonus', title: 'Rushing Bonus', tierAfter: 'Hall of Flame'},
] as const;

export type Tier =
  | 'Unsigned'
  | 'Rookie'
  | 'Starting Lineup'
  | 'Franchise Player'
  | 'Hall of Flame';

// ─── Low-level Klaviyo fetch (paginated) ─────────────────────────────────────

async function klaviyoFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: 'application/json',
      revision: '2024-10-15',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPages(baseUrl: string, apiKey: string) {
  const all: any[] = [];
  let url: string | null = baseUrl;
  while (url) {
    const data = await klaviyoFetch(url, apiKey);
    all.push(...(data.data ?? []));
    url = data.links?.next ?? null;
  }
  return all;
}

// ─── Tier computation (same logic as staff-dashboard) ───────────────────────

export function computeTier(completedCourseIds: Set<string>): Tier {
  const all = completedCourseIds.size >= COURSE_ORDER.length;
  const franch =
    completedCourseIds.has('meet-ricky') &&
    completedCourseIds.has('meet-highsman') &&
    completedCourseIds.has('the-science');
  const start =
    completedCourseIds.has('meet-ricky') &&
    completedCourseIds.has('meet-highsman');
  const rookie = completedCourseIds.has('meet-ricky');

  if (all) return 'Hall of Flame';
  if (franch) return 'Franchise Player';
  if (start) return 'Starting Lineup';
  if (rookie) return 'Rookie';
  return 'Unsigned';
}

// ─── Public types ────────────────────────────────────────────────────────────

export type StoreTrainingRollup = {
  storeAccountId: string;
  storeAccountName: string | null;
  enrolled: number;
  tier1Completed: number; // "meet-ricky" course completion — first deck
  tierCounts: Record<Tier, number>;
  lastActivityAt: string | null;
  budtenders: Array<{
    profileId: string;
    name: string;
    email: string;
    tier: Tier;
    coursesCompleted: number;
    lastActivityAt: string;
  }>;
};

// ─── Primary entry point: rollup ALL stores in one pass ─────────────────────

/**
 * Returns a Map keyed by store_account_id. Used by /vibes index loader
 * so we hit Klaviyo once for the entire dashboard instead of N times.
 *
 * Cache for ~5 min in-memory at the loader level — Klaviyo's list endpoint
 * is not cheap, but budtender enrollment doesn't change second-to-second.
 */
export async function rollupEnrollmentByStore(
  apiKey: string,
): Promise<Map<string, StoreTrainingRollup>> {
  // 1. Fetch all profile IDs in the training list
  const idsUrl =
    `https://a.klaviyo.com/api/lists/${KLAVIYO_TRAINING_LIST_ID}` +
    `/relationships/profiles/?page[size]=100`;
  const idRecords = await fetchAllPages(idsUrl, apiKey);
  const profileIds: string[] = idRecords.map((r: any) => r.id).filter(Boolean);

  if (profileIds.length === 0) return new Map();

  // 2. Fetch full profile attributes (batch of 50 due to URL length)
  const profiles: any[] = [];
  const BATCH = 50;
  for (let i = 0; i < profileIds.length; i += BATCH) {
    const batch = profileIds.slice(i, i + BATCH);
    const idFilter = batch.map((id) => `"${id}"`).join(',');
    const url =
      `https://a.klaviyo.com/api/profiles/?filter=any(id,[${idFilter}])` +
      `&fields[profile]=email,first_name,last_name,organization,properties,location,created` +
      `&page[size]=100`;
    const rows = await fetchAllPages(url, apiKey);
    profiles.push(...rows);
  }

  // 3. Fetch all course completion events (paginated, sorted newest-first)
  const eventsUrl =
    `https://a.klaviyo.com/api/events/?filter=equals(metric_id,"${KLAVIYO_COURSE_COMPLETED_METRIC_ID}")` +
    `&include=profile&fields[event]=event_properties,datetime&page[size]=100&sort=-datetime`;
  const events = await fetchAllPages(eventsUrl, apiKey);

  // 4. Index events by profile
  const eventsByProfile = new Map<string, any[]>();
  for (const ev of events) {
    const pid =
      ev.relationships?.profile?.data?.id ??
      ev.relationships?.profiles?.data?.[0]?.id ??
      ev.attributes?.profile_id;
    if (!pid) continue;
    if (!eventsByProfile.has(pid)) eventsByProfile.set(pid, []);
    eventsByProfile.get(pid)!.push(ev);
  }

  // 5. Bucket profiles by store_account_id
  const byStore = new Map<string, StoreTrainingRollup>();
  const now = new Date().toISOString();

  for (const p of profiles) {
    const pid = p.id;
    const attrs = p.attributes ?? {};
    const props = attrs.properties ?? {};

    const storeId: string | null =
      props.store_account_id ??
      props.store_id ??
      null;

    if (!storeId) continue; // Orphan profile — not attributed to a store

    const storeName: string | null =
      props.dispensary_name ?? attrs.organization ?? null;

    // Compute completed courses from events
    const completed = new Set<string>();
    let lastActivity = attrs.created ?? now;
    for (const ev of eventsByProfile.get(pid) ?? []) {
      const ep =
        ev.attributes?.event_properties ??
        ev.attributes?.eventProperties ??
        {};
      if (ep.course_id) completed.add(ep.course_id);
      const dt = ev.attributes?.datetime;
      if (dt && dt > lastActivity) lastActivity = dt;
    }

    const tier = computeTier(completed);
    const firstName = attrs.first_name ?? '';
    const lastName = attrs.last_name ?? '';

    // Ensure bucket
    if (!byStore.has(storeId)) {
      byStore.set(storeId, {
        storeAccountId: storeId,
        storeAccountName: storeName,
        enrolled: 0,
        tier1Completed: 0,
        tierCounts: {
          Unsigned: 0,
          Rookie: 0,
          'Starting Lineup': 0,
          'Franchise Player': 0,
          'Hall of Flame': 0,
        },
        lastActivityAt: null,
        budtenders: [],
      });
    }
    const bucket = byStore.get(storeId)!;
    bucket.enrolled += 1;
    bucket.tierCounts[tier] += 1;
    if (completed.has('meet-ricky')) bucket.tier1Completed += 1;
    if (
      !bucket.lastActivityAt ||
      (lastActivity && lastActivity > bucket.lastActivityAt)
    ) {
      bucket.lastActivityAt = lastActivity;
    }
    bucket.budtenders.push({
      profileId: pid,
      name: `${firstName} ${lastName}`.trim() || attrs.email || 'Budtender',
      email: attrs.email ?? '',
      tier,
      coursesCompleted: completed.size,
      lastActivityAt: lastActivity,
    });
  }

  return byStore;
}

// ─── Subscribe / update a single profile (signup action uses this) ──────────

/**
 * Upsert a Klaviyo profile into the training list with store attribution.
 * Idempotent — called from both the QR landing page and Serena's manual form.
 */
export async function subscribeBudtender(
  apiKey: string,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    role?: string | null;
    storeAccountId: string;
    storeAccountName: string | null;
    state?: string | null;
    signupMethod: 'self_serve' | 'live';
    signedUpByRepId?: string | null;
  },
): Promise<string | null> {
  if (!apiKey) throw new Error('KLAVIYO_PRIVATE_KEY missing');
  if (!input.storeAccountId) {
    throw new Error('store_account_id is required for all training signups');
  }

  // Upsert profile (Klaviyo's upsert-or-create)
  const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      revision: '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email: input.email,
          first_name: input.firstName,
          last_name: input.lastName,
          phone_number: input.phone ?? undefined,
          properties: {
            store_account_id: input.storeAccountId,
            dispensary_name: input.storeAccountName ?? undefined,
            budtender_state: input.state ?? undefined,
            budtender_education_signup: true,
            signup_method: input.signupMethod,
            signed_up_by_rep: input.signedUpByRepId ?? undefined,
            budtender_role: input.role ?? undefined,
            signed_up_at: new Date().toISOString(),
          },
        },
      },
    }),
  });

  let profileId: string | null = null;

  if (profileRes.status === 201) {
    const j = await profileRes.json();
    profileId = j.data?.id ?? null;
  } else if (profileRes.status === 409) {
    // Duplicate — pull existing profile id out of the conflict error
    const j = await profileRes.json();
    profileId = j.errors?.[0]?.meta?.duplicate_profile_id ?? null;

    // Patch the existing profile with the latest store attribution
    if (profileId) {
      await fetch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          revision: '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'profile',
            id: profileId,
            attributes: {
              first_name: input.firstName,
              last_name: input.lastName,
              phone_number: input.phone ?? undefined,
              properties: {
                store_account_id: input.storeAccountId,
                dispensary_name: input.storeAccountName ?? undefined,
                budtender_state: input.state ?? undefined,
                budtender_education_signup: true,
                signup_method: input.signupMethod,
                signed_up_by_rep: input.signedUpByRepId ?? undefined,
                budtender_role: input.role ?? undefined,
              },
            },
          },
        }),
      });
    }
  } else {
    const body = await profileRes.text().catch(() => '');
    throw new Error(
      `Klaviyo profile upsert failed ${profileRes.status}: ${body.slice(0, 200)}`,
    );
  }

  // Subscribe the profile to the training list (idempotent)
  if (profileId) {
    await fetch(
      `https://a.klaviyo.com/api/lists/${KLAVIYO_TRAINING_LIST_ID}/relationships/profiles/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          revision: '2024-10-15',
        },
        body: JSON.stringify({
          data: [{type: 'profile', id: profileId}],
        }),
      },
    );

    // Fire the signup metric so staff-dashboard's timeline sees it
    await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        revision: '2024-10-15',
      },
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            profile: {data: {type: 'profile', id: profileId}},
            metric: {
              data: {
                type: 'metric',
                attributes: {name: 'Budtender Training Signup'},
              },
            },
            properties: {
              store_account_id: input.storeAccountId,
              dispensary_name: input.storeAccountName ?? undefined,
              signup_method: input.signupMethod,
              signed_up_by_rep: input.signedUpByRepId ?? undefined,
            },
          },
        },
      }),
    }).catch(() => {}); // Non-fatal
  }

  return profileId;
}
