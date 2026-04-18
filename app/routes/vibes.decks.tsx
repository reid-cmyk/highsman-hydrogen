import {useEffect, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes/decks — Budtender Training Deck Library
// ─────────────────────────────────────────────────────────────────────────────
// Reps hand this tab to budtenders at the floor, or pull up themselves during
// a live training. Each deck is embedded from Google Drive via the /preview
// URL shape (iframe-friendly, no Drive account required if shared "Anyone with
// the link").
// ─────────────────────────────────────────────────────────────────────────────

type Deck = {
  id: string;
  title: string;
  module_slug: string;
  drive_file_id: string;
  duration_minutes: number;
  summary: string | null;
  sort_order: number;
};

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  let decks: Deck[] = [];
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/training_decks?active=eq.true&select=*&order=sort_order.asc`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (res.ok) decks = await res.json();
    } catch (err) {
      console.warn('[vibes/decks] Supabase fetch failed', err);
    }
  }
  return json({decks});
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Training Decks · Vibes · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  green: '#2ECC71',
  line: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.06)',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

export default function VibesDecks() {
  const {decks} = useLoaderData<typeof loader>();
  const [openDeck, setOpenDeck] = useState<Deck | null>(null);

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

      <div style={{padding: '18px 16px 4px'}}>
        <div
          style={{
            color: BRAND.gold,
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontFamily: TEKO,
          }}
        >
          Budtender Training
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 44,
            lineHeight: 1,
            color: BRAND.white,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            marginTop: 2,
          }}
        >
          Deck Library
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 8,
            fontFamily: BODY,
          }}
        >
          Open a deck on your phone or tablet, hand it to a budtender, or run a
          group session live on the floor.
        </div>
      </div>

      <div style={{padding: '16px'}}>
        {decks.length === 0 ? (
          <div
            style={{
              padding: 24,
              border: `1px dashed ${BRAND.line}`,
              borderRadius: 8,
              textAlign: 'center',
              color: BRAND.gray,
            }}
          >
            <div style={{fontFamily: TEKO, fontSize: 22, color: BRAND.white}}>
              No decks loaded yet
            </div>
            <div style={{marginTop: 6, fontSize: 12}}>
              Seed training_decks in Supabase (see vibes_schema.sql).
            </div>
          </div>
        ) : (
          <div style={{display: 'grid', gap: 10}}>
            {decks.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => setOpenDeck(d)}
                style={{
                  textAlign: 'left',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 8,
                  padding: '14px 14px',
                  color: BRAND.white,
                  cursor: 'pointer',
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
                      fontSize: 26,
                      lineHeight: 1,
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                      color: BRAND.white,
                    }}
                  >
                    {d.title}
                  </div>
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 11,
                      color: BRAND.gold,
                      letterSpacing: '0.14em',
                    }}
                  >
                    {d.duration_minutes} MIN
                  </div>
                </div>
                {d.summary ? (
                  <div
                    style={{
                      color: BRAND.gray,
                      fontSize: 12,
                      marginTop: 6,
                      fontFamily: BODY,
                    }}
                  >
                    {d.summary}
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <span
                    style={{
                      background: BRAND.gold,
                      color: BRAND.black,
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontFamily: TEKO,
                      fontSize: 12,
                      letterSpacing: '0.1em',
                    }}
                  >
                    TEACH
                  </span>
                  <a
                    href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'transparent',
                      color: BRAND.gray,
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontFamily: TEKO,
                      fontSize: 12,
                      letterSpacing: '0.1em',
                      border: `1px solid ${BRAND.line}`,
                      textDecoration: 'none',
                    }}
                  >
                    OPEN IN DRIVE
                  </a>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full-screen deck viewer */}
      {openDeck ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: BRAND.black,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid ${BRAND.line}`,
            }}
          >
            <button
              type="button"
              onClick={() => setOpenDeck(null)}
              style={{
                background: 'transparent',
                color: BRAND.gold,
                border: 'none',
                fontFamily: TEKO,
                fontSize: 18,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              ← CLOSE
            </button>
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 18,
                color: BRAND.white,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}
            >
              {openDeck.title}
            </div>
            <a
              href={`https://drive.google.com/file/d/${openDeck.drive_file_id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: BRAND.gold,
                fontFamily: TEKO,
                fontSize: 14,
                letterSpacing: '0.1em',
                textDecoration: 'none',
              }}
            >
              DRIVE ↗
            </a>
          </div>
          <iframe
            src={`https://drive.google.com/file/d/${openDeck.drive_file_id}/preview`}
            title={openDeck.title}
            allow="autoplay"
            style={{flex: 1, width: '100%', border: 'none', background: '#000'}}
          />
        </div>
      ) : null}
    </div>
  );
}
