/**
 * app/lib/org-notes.server.ts
 *
 * Shared server-side utility for fetching the latest note per org.
 * Used by Reorders Due, Accounts, Leads, and Onboarding loaders.
 *
 * fetchLatestNotes(orgIds, env) → Map<orgId, NotePreview>
 *
 * To change how notes are fetched (limit, extra fields, caching, etc.)
 * edit this one file — all feed pages update automatically.
 */

export type NotePreview = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

/**
 * Fetch the most recent note for each org in a single Supabase query.
 * Returns a Map<orgId, NotePreview> — orgs with no notes are absent from the map.
 * Best-effort: returns an empty map on any error so the feed still loads.
 */
export async function fetchLatestNotes(
  orgIds: string[],
  env: {SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string},
): Promise<Map<string, NotePreview>> {
  if (orgIds.length === 0) return new Map();

  try {
    const h = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Fetch recent notes for all orgs in one query.
    // Limit is generous (3000) to ensure we capture the latest note per org
    // even for large account lists — single fast index scan on organization_id + created_at.
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/org_notes` +
      `?organization_id=in.(${orgIds.join(',')})` +
      `&select=id,organization_id,body,author_name,created_at` +
      `&order=created_at.desc` +
      `&limit=3000`,
      {headers: h},
    );

    if (!res.ok) return new Map();

    const notes: any[] = await res.json().catch(() => []);
    const map = new Map<string, NotePreview>();

    // Since notes are sorted desc, the first occurrence per org = most recent
    for (const n of notes) {
      if (!map.has(n.organization_id)) {
        map.set(n.organization_id, {
          id:           n.id,
          body:         n.body,
          author_name:  n.author_name,
          created_at:   n.created_at,
        });
      }
    }

    return map;
  } catch {
    return new Map(); // never break the feed over a notes fetch failure
  }
}
