import {useEffect, useMemo, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes/store — Store Search
// ─────────────────────────────────────────────────────────────────────────────
// Reps land here when they hit the "Store Search" tile on /vibes. Shows the
// full NJ account roster with a live name/city filter and routes selection
// into /vibes/store/:accountId for the full profile.
// ─────────────────────────────────────────────────────────────────────────────

type StoreRow = {
  accountId: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  lastVibesVisit?: string | null;
  daysSinceLast?: number | null;
  tier?: 'FRESH' | 'TARGET' | 'ROTATION';
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  try {
    const res = await fetch(`${origin}/api/vibes-route`);
    if (!res.ok) return json({stores: [] as StoreRow[]});
    const data = (await res.json()) as {
      fresh?: StoreRow[];
      targets?: StoreRow[];
      rotation?: StoreRow[];
    };
    const merged = new Map<string, StoreRow>();
    for (const row of [
      ...(data.rotation || []),
      ...(data.targets || []),
      ...(data.fresh || []),
    ]) {
      if (!row.accountId) continue;
      // FRESH > TARGET > ROTATION priority when deduping
      const existing = merged.get(row.accountId);
      if (
        !existing ||
        (row.tier === 'FRESH' && existing.tier !== 'FRESH') ||
        (row.tier === 'TARGET' && existing.tier === 'ROTATION')
      ) {
        merged.set(row.accountId, row);
      }
    }
    const stores = Array.from(merged.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return json({stores});
  } catch {
    return json({stores: [] as StoreRow[]});
  }
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Store Search · Vibes · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ─── BRAND ──────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  green: '#2ECC71',
  purple: '#B884FF',
  line: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.06)',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

export default function VibesStoreIndex() {
  const {stores} = useLoaderData<typeof loader>();
  const [q, setQ] = useState('');

  useEffect(() => {
    if (document.getElementById('vibes-font-link')) return;
    const l = document.createElement('link');
    l.id = 'vibes-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.id = 'klv-s';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stores;
    return stores.filter((s) => {
      const hay = [s.name, s.city, s.street, s.state]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [q, stores]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
      }}
    >
      <header
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${BRAND.line}`,
          background: BRAND.black,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/vibes"
          style={{
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 18,
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          ← VIBES
        </Link>
        <img src={LOGO_WHITE} alt="Highsman" style={{height: 40, width: 'auto'}} />
        <div style={{width: 40}} />
      </header>

      <div style={{padding: '16px'}}>
        <div
          style={{
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 22,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Store Search
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 36,
            lineHeight: 1,
            textTransform: 'uppercase',
            marginTop: 4,
          }}
        >
          Pull a Profile
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          {stores.length} NJ accounts on file. Tap any store for contacts,
          training status, and visit history.
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by store name or city…"
          autoFocus
          style={{
            marginTop: 14,
            width: '100%',
            padding: '14px 14px',
            background: BRAND.chip,
            border: `1px solid ${BRAND.line}`,
            borderRadius: 8,
            color: BRAND.white,
            fontFamily: BODY,
            fontSize: 16,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{padding: '0 16px 96px'}}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: BRAND.gray,
              border: `1px dashed ${BRAND.line}`,
              borderRadius: 10,
            }}
          >
            {stores.length === 0
              ? 'Zoho did not return any NJ accounts. Check /api/vibes-route.'
              : `No stores match "${q}".`}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {filtered.map((s) => (
              <Link
                key={s.accountId}
                to={`/vibes/store/${s.accountId}`}
                style={{
                  display: 'block',
                  padding: '12px 14px',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: BRAND.white,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 22,
                      lineHeight: 1,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {s.name}
                  </div>
                  {s.tier ? (
                    <span
                      style={{
                        fontFamily: TEKO,
                        fontSize: 11,
                        letterSpacing: '0.16em',
                        color:
                          s.tier === 'FRESH'
                            ? BRAND.gold
                            : s.tier === 'TARGET'
                              ? BRAND.purple
                              : BRAND.green,
                        flexShrink: 0,
                      }}
                    >
                      {s.tier}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    color: BRAND.gray,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {[s.street, s.city, s.state].filter(Boolean).join(' · ')}
                </div>
                {s.daysSinceLast != null ? (
                  <div
                    style={{
                      color: s.daysSinceLast > 21 ? BRAND.gold : BRAND.gray,
                      fontSize: 11,
                      marginTop: 4,
                      fontFamily: TEKO,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Last visit · {s.daysSinceLast}d ago
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
