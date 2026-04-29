import {useEffect} from 'react';
import type {MetaFunction, LinksFunction} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE — hide global header/footer (focused B2B partner landing page)
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

// ─────────────────────────────────────────────────────────────────────────────
// META — B2B partner page, noindex (internal-facing)
// ─────────────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => [
  {title: 'NJ Retail Launch Deal · Partner Terms · Highsman'},
  {
    name: 'description',
    content:
      'Ground Game + Triple Threat launch deal for NJ dispensary partners. Front-loaded wholesale support. Place launch order April 28 – May 8, 2026. Consumer promo May 14 – June 13.',
  },
  {name: 'robots', content: 'noindex, nofollow'},
  {property: 'og:title', content: 'HIGHSMAN — NJ Wholesale Launch Promo'},
  {
    property: 'og:description',
    content:
      'Front-loaded wholesale support for NJ dispensary partners. Launch order window April 28 – May 8.',
  },
  {property: 'og:type', content: 'website'},
  {property: 'og:url', content: 'https://highsman.com/njwholesalepromo'},
];

export const links: LinksFunction = () => [
  {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
  {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous'},
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/icon?family=Material+Icons',
  },
];

const PAGE_CSS = `
  .nj-wholesale-promo {
    --space-black: #000000;
    --quarter-gray: #A9ACAF;
    --yardline-white: #FFFFFF;
    --field-yellow: #F5E500;
    --field-yellow-hover: #FFF200;
    --signal-red: #FF3B30;
    --go-green: #2ECC71;
    --surface: #0B0B0B;
    --surface-2: #141414;
    --surface-3: #1C1C1C;
    --line: rgba(255,255,255,0.10);
    --line-strong: rgba(255,255,255,0.22);
    --chip: rgba(255,255,255,0.06);
    --ground-game: #4CAF50;
    --triple-threat: #9C27B0;
    --max-w: 1240px;
    background: var(--space-black);
    color: var(--yardline-white);
    font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
    overflow-x: hidden;
    min-height: 100vh;
  }
  .nj-wholesale-promo * { box-sizing: border-box; }
  .nj-wholesale-promo img { max-width: 100%; height: auto; display: block; }
  .nj-wholesale-promo a { color: inherit; text-decoration: none; }
  .nj-wholesale-promo h1, .nj-wholesale-promo h2, .nj-wholesale-promo h3, .nj-wholesale-promo h4, .nj-wholesale-promo h5, .nj-wholesale-promo .teko {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 0.95;
    font-weight: 600;
    margin: 0;
  }

  .nj-wholesale-promo .partner-strip {
    background: var(--field-yellow);
    color: var(--space-black);
    font-family: 'Teko', sans-serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 9px 24px;
    text-align: center;
  }
  .nj-wholesale-promo .partner-strip strong { letter-spacing: 0.22em; }

  .nj-wholesale-promo header.site {
    background: rgba(0,0,0,0.92);
    border-bottom: 1px solid var(--line);
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
  }
  .nj-wholesale-promo header.site img { height: 44px; }
  .nj-wholesale-promo .header-cta {
    font-family: 'Teko', sans-serif;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    background: var(--field-yellow);
    color: var(--space-black);
    padding: 11px 22px;
    border-radius: 4px;
    transition: background 0.15s, transform 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .nj-wholesale-promo .header-cta:hover { background: var(--field-yellow-hover); transform: translateY(-1px); }
  .nj-wholesale-promo .header-cta .material-icons { font-size: 18px; }

  .nj-wholesale-promo .hero {
    position: relative;
    padding: 72px 32px 80px;
    overflow: hidden;
    background:
      radial-gradient(circle at 20% 30%, rgba(245,229,0,0.10) 0%, transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(76,175,80,0.06) 0%, transparent 50%),
      var(--space-black);
  }
  .nj-wholesale-promo .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 80px 80px;
    pointer-events: none;
  }
  .nj-wholesale-promo .hero-inner {
    max-width: var(--max-w);
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }
  .nj-wholesale-promo .hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'Teko', sans-serif;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--field-yellow);
    border: 1px solid var(--field-yellow);
    padding: 6px 14px;
    border-radius: 4px;
    margin-bottom: 24px;
  }
  .nj-wholesale-promo .hero-eyebrow .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--field-yellow);
    box-shadow: 0 0 12px var(--field-yellow);
    animation: njwp-pulse 1.6s infinite;
  }
  @keyframes njwp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .nj-wholesale-promo .hero h1 {
    font-size: clamp(48px, 8vw, 110px);
    line-height: 0.92;
    letter-spacing: 0.005em;
    margin-bottom: 20px;
    color: var(--yardline-white);
  }
  .nj-wholesale-promo .hero h1 .yellow { color: var(--field-yellow); }
  .nj-wholesale-promo .hero-sub {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: clamp(17px, 2vw, 22px);
    font-weight: 400;
    color: var(--quarter-gray);
    max-width: 720px;
    margin-bottom: 32px;
    line-height: 1.45;
  }
  .nj-wholesale-promo .hero-sub strong { color: var(--yardline-white); font-weight: 600; }
  .nj-wholesale-promo .hero-cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
  }
  .nj-wholesale-promo .btn-primary, .nj-wholesale-promo .btn-secondary {
    font-family: 'Teko', sans-serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 16px 32px;
    border-radius: 4px;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    border: none;
  }
  .nj-wholesale-promo .btn-primary {
    background: var(--field-yellow);
    color: var(--space-black);
  }
  .nj-wholesale-promo .btn-primary:hover { background: var(--field-yellow-hover); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(245,229,0,0.25); }
  .nj-wholesale-promo .btn-secondary {
    background: transparent;
    color: var(--yardline-white);
    border: 1.5px solid var(--line-strong);
  }
  .nj-wholesale-promo .btn-secondary:hover { border-color: var(--yardline-white); background: rgba(255,255,255,0.04); }

  .nj-wholesale-promo .hero-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 32px;
    margin-top: 48px;
    padding-top: 36px;
    border-top: 1px solid var(--line);
  }
  .nj-wholesale-promo .stat-num {
    font-family: 'Teko', sans-serif;
    font-size: 52px;
    font-weight: 700;
    line-height: 1;
    color: var(--field-yellow);
    letter-spacing: 0.01em;
  }
  .nj-wholesale-promo .stat-label {
    font-family: 'Teko', sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--quarter-gray);
    margin-top: 6px;
  }

  .nj-wholesale-promo section {
    padding: 80px 32px;
  }
  .nj-wholesale-promo .section-inner {
    max-width: var(--max-w);
    margin: 0 auto;
  }
  .nj-wholesale-promo .section-eyebrow {
    font-family: 'Teko', sans-serif;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--field-yellow);
    margin-bottom: 12px;
  }
  .nj-wholesale-promo .section-h2 {
    font-size: clamp(38px, 5vw, 64px);
    line-height: 0.95;
    margin-bottom: 16px;
    max-width: 880px;
  }
  .nj-wholesale-promo .section-lede {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 18px;
    color: var(--quarter-gray);
    max-width: 720px;
    margin-bottom: 48px;
    line-height: 1.5;
  }

  .nj-wholesale-promo .the-deal {
    background: var(--surface);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .nj-wholesale-promo .deal-card {
    background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 56px 48px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .nj-wholesale-promo .deal-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 50%, rgba(245,229,0,0.05) 100%);
    pointer-events: none;
  }
  .nj-wholesale-promo .deal-pct {
    font-family: 'Teko', sans-serif;
    font-size: clamp(120px, 18vw, 220px);
    font-weight: 700;
    line-height: 0.85;
    color: var(--field-yellow);
    letter-spacing: -0.02em;
    text-shadow: 0 0 40px rgba(245,229,0,0.25);
    margin-bottom: 8px;
  }
  .nj-wholesale-promo .deal-headline {
    font-size: clamp(28px, 4vw, 44px);
    margin-bottom: 14px;
  }
  .nj-wholesale-promo .deal-meta {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 17px;
    color: var(--quarter-gray);
    max-width: 560px;
    margin: 0 auto;
    line-height: 1.5;
  }
  .nj-wholesale-promo .deal-meta strong { color: var(--yardline-white); }
  .nj-wholesale-promo .deal-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    margin-top: 28px;
  }
  .nj-wholesale-promo .deal-tag {
    font-family: 'Teko', sans-serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 8px 14px;
    border-radius: 4px;
    border: 1px solid var(--line-strong);
    background: var(--chip);
  }
  .nj-wholesale-promo .deal-tag.gg { color: var(--ground-game); border-color: rgba(76,175,80,0.4); }
  .nj-wholesale-promo .deal-tag.tt { color: #C77BD7; border-color: rgba(156,39,176,0.5); }
  .nj-wholesale-promo .deal-tag.naming {
    background: var(--field-yellow);
    color: var(--space-black);
    border-color: var(--field-yellow);
  }

  .nj-wholesale-promo .math-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 24px;
  }
  .nj-wholesale-promo .math-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 32px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s, transform 0.2s;
  }
  .nj-wholesale-promo .math-card:hover { border-color: var(--line-strong); transform: translateY(-2px); }
  .nj-wholesale-promo .math-card.gg { border-top: 3px solid var(--ground-game); }
  .nj-wholesale-promo .math-card.tt { border-top: 3px solid var(--triple-threat); }
  .nj-wholesale-promo .math-hero {
    position: relative;
    margin: -32px -32px 24px;
    padding: 28px 32px 22px;
    background:
      radial-gradient(circle at 50% 100%, rgba(245,229,0,0.08) 0%, transparent 70%),
      linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%);
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    overflow: hidden;
  }
  .nj-wholesale-promo .math-card.gg .math-hero {
    background:
      radial-gradient(circle at 50% 100%, rgba(76,175,80,0.18) 0%, transparent 70%),
      linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%);
  }
  .nj-wholesale-promo .math-card.tt .math-hero {
    background:
      radial-gradient(circle at 50% 100%, rgba(156,39,176,0.22) 0%, transparent 70%),
      linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%);
  }
  .nj-wholesale-promo .math-hero img {
    max-height: 200px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 18px 32px rgba(0,0,0,0.45));
    transition: transform 0.3s ease;
  }
  .nj-wholesale-promo .math-card:hover .math-hero img { transform: translateY(-4px) scale(1.03); }
  .nj-wholesale-promo .math-hero-badge {
    position: absolute;
    top: 14px;
    right: 14px;
    font-family: 'Teko', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 3px;
    background: var(--field-yellow);
    color: var(--space-black);
  }
  .nj-wholesale-promo .math-card.gg .math-hero-badge {
    background: var(--ground-game);
    color: var(--space-black);
  }
  .nj-wholesale-promo .math-card.tt .math-hero-badge {
    background: var(--triple-threat);
    color: var(--yardline-white);
  }
  .nj-wholesale-promo .math-sku {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 6px;
  }
  .nj-wholesale-promo .math-name {
    font-family: 'Teko', sans-serif;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    line-height: 1;
  }
  .nj-wholesale-promo .math-format {
    font-family: 'Teko', sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--quarter-gray);
  }
  .nj-wholesale-promo .math-tag {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 3px;
    margin-bottom: 22px;
  }
  .nj-wholesale-promo .math-card.gg .math-tag {
    background: rgba(76,175,80,0.16);
    color: var(--ground-game);
  }
  .nj-wholesale-promo .math-card.tt .math-tag {
    background: rgba(156,39,176,0.18);
    color: #C77BD7;
  }
  .nj-wholesale-promo .split-bar {
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    margin-bottom: 22px;
    border: 1px solid var(--line);
  }
  .nj-wholesale-promo .split-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Teko', sans-serif;
    font-weight: 700;
    font-size: 22px;
    letter-spacing: 0.06em;
    color: var(--space-black);
    text-shadow: 0 1px 0 rgba(255,255,255,0.18);
  }
  .nj-wholesale-promo .seg-highsman { background: var(--field-yellow); }
  .nj-wholesale-promo .seg-store { background: var(--quarter-gray); }
  .nj-wholesale-promo .seg-store.full { background: rgba(255,255,255,0.08); color: var(--quarter-gray); text-shadow: none; }
  .nj-wholesale-promo .split-legend {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 14px;
    color: var(--quarter-gray);
  }
  .nj-wholesale-promo .split-legend > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nj-wholesale-promo .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .nj-wholesale-promo .legend-dot.high { background: var(--field-yellow); }
  .nj-wholesale-promo .legend-dot.store { background: var(--quarter-gray); }
  .nj-wholesale-promo .legend-dot.zero { background: rgba(255,255,255,0.2); }
  .nj-wholesale-promo .math-takeaway {
    font-family: 'Teko', sans-serif;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--yardline-white);
    border-top: 1px solid var(--line);
    padding-top: 18px;
    line-height: 1.15;
  }
  .nj-wholesale-promo .math-takeaway .yellow { color: var(--field-yellow); }

  .nj-wholesale-promo .how-it-works {
    background: var(--surface);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .nj-wholesale-promo .how-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }
  .nj-wholesale-promo .how-card {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 28px 24px;
    position: relative;
  }
  .nj-wholesale-promo .how-num {
    font-family: 'Teko', sans-serif;
    font-size: 64px;
    font-weight: 700;
    line-height: 0.85;
    color: var(--field-yellow);
    margin-bottom: 8px;
  }
  .nj-wholesale-promo .how-title {
    font-family: 'Teko', sans-serif;
    font-size: 22px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin-bottom: 8px;
  }
  .nj-wholesale-promo .how-body {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 15px;
    color: var(--quarter-gray);
    line-height: 1.5;
  }

  .nj-wholesale-promo .timeline-track {
    position: relative;
    margin-top: 24px;
    padding-left: 28px;
    border-left: 2px solid var(--line);
  }
  .nj-wholesale-promo .timeline-item {
    position: relative;
    padding-bottom: 28px;
    padding-left: 14px;
  }
  .nj-wholesale-promo .timeline-item:last-child { padding-bottom: 0; }
  .nj-wholesale-promo .timeline-item::before {
    content: '';
    position: absolute;
    left: -36px;
    top: 4px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--space-black);
    border: 2px solid var(--quarter-gray);
  }
  .nj-wholesale-promo .timeline-item.active::before {
    background: var(--field-yellow);
    border-color: var(--field-yellow);
    box-shadow: 0 0 0 4px rgba(245,229,0,0.15);
  }
  .nj-wholesale-promo .timeline-item.now::before {
    background: var(--field-yellow);
    border-color: var(--field-yellow);
    animation: njwp-pulse 1.6s infinite;
  }
  .nj-wholesale-promo .tl-date {
    font-family: 'Teko', sans-serif;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--field-yellow);
    margin-bottom: 4px;
  }
  .nj-wholesale-promo .tl-title {
    font-family: 'Teko', sans-serif;
    font-size: 24px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 1.1;
    margin-bottom: 4px;
  }
  .nj-wholesale-promo .tl-body {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 15px;
    color: var(--quarter-gray);
    line-height: 1.5;
  }
  .nj-wholesale-promo .tl-now-pill {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    background: var(--field-yellow);
    color: var(--space-black);
    padding: 3px 8px;
    border-radius: 3px;
    margin-left: 8px;
    vertical-align: middle;
  }

  .nj-wholesale-promo .conditions {
    background: var(--surface);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .nj-wholesale-promo .cond-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
  }
  .nj-wholesale-promo .cond-card {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 22px 22px 22px 22px;
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .nj-wholesale-promo .cond-check {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--field-yellow);
    color: var(--space-black);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nj-wholesale-promo .cond-check .material-icons { font-size: 20px; font-weight: 700; }
  .nj-wholesale-promo .cond-num {
    font-family: 'Teko', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--field-yellow);
    margin-bottom: 2px;
  }
  .nj-wholesale-promo .cond-title {
    font-family: 'Teko', sans-serif;
    font-size: 19px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 1.15;
    margin-bottom: 6px;
  }
  .nj-wholesale-promo .cond-body {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 14px;
    color: var(--quarter-gray);
    line-height: 1.5;
  }

  .nj-wholesale-promo .proof-card {
    background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface) 100%);
    border: 1px solid var(--line);
    border-left: 4px solid var(--field-yellow);
    border-radius: 8px;
    padding: 32px 32px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 32px;
    align-items: center;
  }
  .nj-wholesale-promo .proof-list {
    list-style: none;
    counter-reset: njwp-proof;
    padding: 0;
    margin: 0;
  }
  .nj-wholesale-promo .proof-list li {
    counter-increment: njwp-proof;
    position: relative;
    padding: 8px 0 8px 36px;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 16px;
    line-height: 1.45;
  }
  .nj-wholesale-promo .proof-list li::before {
    content: counter(njwp-proof);
    position: absolute;
    left: 0;
    top: 8px;
    width: 26px;
    height: 26px;
    background: var(--field-yellow);
    color: var(--space-black);
    border-radius: 50%;
    font-family: 'Teko', sans-serif;
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nj-wholesale-promo .proof-deadline {
    text-align: center;
    padding: 20px 24px;
    border-left: 1px solid var(--line);
  }
  .nj-wholesale-promo .proof-deadline-label {
    font-family: 'Teko', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--quarter-gray);
    margin-bottom: 6px;
  }
  .nj-wholesale-promo .proof-deadline-date {
    font-family: 'Teko', sans-serif;
    font-size: 56px;
    font-weight: 700;
    line-height: 0.9;
    color: var(--field-yellow);
  }
  .nj-wholesale-promo .proof-deadline-month {
    font-family: 'Teko', sans-serif;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--yardline-white);
  }

  .nj-wholesale-promo .nonexec-card {
    background: rgba(255,59,48,0.06);
    border: 1px solid rgba(255,59,48,0.4);
    border-left: 4px solid var(--signal-red);
    border-radius: 8px;
    padding: 28px 32px;
    margin-top: 18px;
    display: flex;
    gap: 18px;
    align-items: flex-start;
  }
  .nj-wholesale-promo .nonexec-icon {
    flex-shrink: 0;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: rgba(255,59,48,0.18);
    color: var(--signal-red);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nj-wholesale-promo .nonexec-icon .material-icons { font-size: 24px; }
  .nj-wholesale-promo .nonexec-title {
    font-family: 'Teko', sans-serif;
    font-size: 22px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--yardline-white);
    margin-bottom: 6px;
  }
  .nj-wholesale-promo .nonexec-body {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 15px;
    color: var(--quarter-gray);
    line-height: 1.55;
  }
  .nj-wholesale-promo .nonexec-body strong { color: var(--yardline-white); }

  .nj-wholesale-promo .faq {
    background: var(--surface);
    border-top: 1px solid var(--line);
  }
  .nj-wholesale-promo .faq-list {
    border-top: 1px solid var(--line);
  }
  .nj-wholesale-promo .faq-item {
    border-bottom: 1px solid var(--line);
    padding: 22px 0;
  }
  .nj-wholesale-promo .faq-q {
    font-family: 'Teko', sans-serif;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    color: var(--yardline-white);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .nj-wholesale-promo .faq-q::before {
    content: 'Q.';
    color: var(--field-yellow);
    font-weight: 700;
  }
  .nj-wholesale-promo .faq-a {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 16px;
    color: var(--quarter-gray);
    line-height: 1.55;
    padding-left: 38px;
  }
  .nj-wholesale-promo .faq-a strong { color: var(--yardline-white); }

  .nj-wholesale-promo .final-cta {
    background:
      radial-gradient(circle at 50% 50%, rgba(245,229,0,0.18) 0%, transparent 60%),
      var(--space-black);
    text-align: center;
    padding: 100px 32px;
    border-top: 1px solid var(--line);
  }
  .nj-wholesale-promo .final-cta h2 {
    font-size: clamp(48px, 7vw, 96px);
    line-height: 0.92;
    margin-bottom: 18px;
  }
  .nj-wholesale-promo .final-cta h2 .yellow { color: var(--field-yellow); }
  .nj-wholesale-promo .final-cta p {
    font-size: 18px;
    color: var(--quarter-gray);
    max-width: 600px;
    margin: 0 auto 36px;
  }
  .nj-wholesale-promo .final-cta .btn-primary { font-size: 26px; padding: 20px 40px; }

  .nj-wholesale-promo footer.site {
    background: var(--space-black);
    border-top: 1px solid var(--line);
    padding: 36px 32px;
    text-align: center;
  }
  .nj-wholesale-promo footer.site img { height: 40px; margin: 0 auto 14px; }
  .nj-wholesale-promo footer.site .footer-tag {
    font-family: 'Teko', sans-serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--field-yellow);
    margin-bottom: 8px;
  }
  .nj-wholesale-promo footer.site .footer-meta {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 13px;
    color: var(--quarter-gray);
    max-width: 720px;
    margin: 0 auto;
    line-height: 1.5;
  }

  @media (max-width: 720px) {
    .nj-wholesale-promo section { padding: 56px 22px; }
    .nj-wholesale-promo .hero { padding: 48px 22px 56px; }
    .nj-wholesale-promo header.site { padding: 14px 22px; }
    .nj-wholesale-promo .deal-card { padding: 36px 24px; }
    .nj-wholesale-promo .proof-card { grid-template-columns: 1fr; gap: 20px; }
    .nj-wholesale-promo .proof-deadline { border-left: none; border-top: 1px solid var(--line); padding-top: 20px; }
    .nj-wholesale-promo .header-cta span:not(.material-icons) { display: none; }
    .nj-wholesale-promo .hero-stats { gap: 22px; padding-top: 28px; margin-top: 36px; }
    .nj-wholesale-promo .stat-num { font-size: 38px; }
  }
`;

export default function NjWholesalePromo() {
  // Suppress Klaviyo popup on this B2B page (per project rules — non-consumer surface)
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-popup-njwholesalepromo';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <div className="nj-wholesale-promo">
      <style dangerouslySetInnerHTML={{__html: PAGE_CSS}} />

      <div className="partner-strip">
        <strong>HIGHSMAN PARTNERS</strong> &nbsp;·&nbsp; NJ RETAIL LAUNCH DEAL &nbsp;·&nbsp; INTERNAL — DISPENSARY BUYERS &amp; OWNERS
      </div>

      <header className="site">
        <a href="https://highsman.com" aria-label="Highsman home">
          <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430" alt="Highsman" />
        </a>
        <a href="https://highsman.com/njmenu" className="header-cta">
          <span>Place Launch Order</span>
          <span className="material-icons">arrow_forward</span>
        </a>
      </header>

      <div className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">
            <span className="dot"></span>
            <span>Limited Window · April 28 – May 8</span>
          </div>
          <h1>
            Stock the launch.<br />
            <span className="yellow">We&rsquo;ll cover the discount.</span>
          </h1>
          <p className="hero-sub">
            For the first 30 days of <strong>Ground Game 7G</strong> and <strong>Triple Threat 1.2G</strong>,
            Highsman is front-loading the consumer promo into your wholesale price.
            Lower cost, no credit memo, no order cap — but only on your first launch PO,
            and only when the deal is live on your menu by <strong>May 14th</strong>.
          </p>

          <div className="hero-cta-row">
            <a href="https://highsman.com/njmenu" className="btn-primary">
              <span>Place Launch Order</span>
              <span className="material-icons">arrow_forward</span>
            </a>
            <a href="#the-math" className="btn-secondary">
              <span>See The Math</span>
            </a>
          </div>

          <div className="hero-stats">
            <div>
              <div className="stat-num">20%</div>
              <div className="stat-label">Off Consumer Price</div>
            </div>
            <div>
              <div className="stat-num">30</div>
              <div className="stat-label">Day Promo Window</div>
            </div>
            <div>
              <div className="stat-num">$0</div>
              <div className="stat-label">Credit Memo Hassle</div>
            </div>
            <div>
              <div className="stat-num">No Cap</div>
              <div className="stat-label">First Order Volume</div>
            </div>
          </div>
        </div>
      </div>

      <section className="the-deal" id="the-deal">
        <div className="section-inner">
          <div className="section-eyebrow">The Consumer Offer</div>
          <h2 className="section-h2">What your shoppers see at the counter.</h2>
          <p className="section-lede">
            One clear, single-SKU promo. No cross-category bundles. No stacking with other deals.
            Use the standardized menu name so we can verify your execution within 48 hours of launch.
          </p>

          <div className="deal-card">
            <div className="deal-pct">20%</div>
            <div className="deal-headline">Off Any Single Ground Game 7G or Triple Threat 1.2G</div>
            <div className="deal-meta">
              <strong>May 14 – June 13, 2026</strong> &nbsp;·&nbsp; 30 Days &nbsp;·&nbsp; NJ Retail Only
            </div>
            <div className="deal-tags">
              <span className="deal-tag tt">Triple Threat 1.2G</span>
              <span className="deal-tag gg">Ground Game 7G</span>
              <span className="deal-tag naming">Menu Name: NEW: Ground Game + Triple Threat — Launch Deal</span>
            </div>
          </div>
        </div>
      </section>

      <section id="the-math">
        <div className="section-inner">
          <div className="section-eyebrow">The Math · By SKU</div>
          <h2 className="section-h2">Front-loaded, by SKU. Not the same split for both.</h2>
          <p className="section-lede">
            We absorb the discount into your wholesale price on the first launch PO.
            You see a lower unit cost the moment the order is placed.
            No credit memo. No reimbursement chase. The split changes by product.
          </p>

          <div className="math-grid">
            <div className="math-card tt">
              <div className="math-hero">
                <span className="math-hero-badge">We Eat 100%</span>
                <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Pre_Roll_Tube_retail.png?v=1776436152" alt="Highsman Triple Threat 1.2G Triple Infused Pre-Roll tube" loading="lazy" />
              </div>
              <div className="math-sku">
                <div className="math-name">Triple Threat 1.2G</div>
                <div className="math-format">Triple Infused Pre-Roll</div>
              </div>
              <div className="math-tag">Full Promo · 20 / 0</div>

              <div className="split-bar" aria-label="Highsman covers full 20%, Store covers 0%">
                <div className="split-segment seg-highsman" style={{flex: 2}}>20%</div>
                <div className="split-segment seg-store full" style={{flex: 0.05}}>0%</div>
              </div>

              <div className="split-legend">
                <div><span className="legend-dot high"></span> Highsman absorbs <strong style={{color: 'var(--yardline-white)'}}>20%</strong></div>
                <div><span className="legend-dot zero"></span> Store absorbs <strong style={{color: 'var(--yardline-white)'}}>0%</strong></div>
              </div>

              <div className="math-takeaway">
                We eat the full discount. Your <span className="yellow">margin stays whole</span> while the consumer still sees 20% off.
              </div>
            </div>

            <div className="math-card gg">
              <div className="math-hero">
                <span className="math-hero-badge">10/10 Split</span>
                <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Ground_Game_Bag_njretail.png?v=1776436172" alt="Highsman Ground Game 7G Ready-to-Roll Flower bag" loading="lazy" />
              </div>
              <div className="math-sku">
                <div className="math-name">Ground Game 7G</div>
                <div className="math-format">Ready-to-Roll Flower</div>
              </div>
              <div className="math-tag">Split Promo · 10 / 10</div>

              <div className="split-bar" aria-label="Highsman covers 10%, Store covers 10%">
                <div className="split-segment seg-highsman" style={{flex: 1}}>10%</div>
                <div className="split-segment seg-store" style={{flex: 1}}>10%</div>
              </div>

              <div className="split-legend">
                <div><span className="legend-dot high"></span> Highsman absorbs <strong style={{color: 'var(--yardline-white)'}}>10%</strong></div>
                <div><span className="legend-dot store"></span> Store absorbs <strong style={{color: 'var(--yardline-white)'}}>10%</strong></div>
              </div>

              <div className="math-takeaway">
                You see a <span className="yellow">10% lower wholesale price</span> on the launch PO. Your margin covers the rest of the consumer 20%.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="section-inner">
          <div className="section-eyebrow">How The Mechanism Works</div>
          <h2 className="section-h2">Built into the invoice. Nothing to file later.</h2>

          <div className="how-grid">
            <div className="how-card">
              <div className="how-num">1</div>
              <div className="how-title">Order Through /njmenu</div>
              <div className="how-body">
                The launch PO must be placed at <strong style={{color: 'var(--yardline-white)'}}>highsman.com/njmenu</strong> to trigger the reduced wholesale price. Phone or off-platform orders won&rsquo;t get the front-load.
              </div>
            </div>
            <div className="how-card">
              <div className="how-num">2</div>
              <div className="how-title">Lower Cost At Order Time</div>
              <div className="how-body">
                Discount is baked into the wholesale unit cost on the invoice. No credit memo. No paperwork after the fact. Whatever you order on the launch PO qualifies.
              </div>
            </div>
            <div className="how-card">
              <div className="how-num">3</div>
              <div className="how-title">Run The 20% Consumer Deal</div>
              <div className="how-body">
                Configure the deal on your menu under the standardized name, live by <strong style={{color: 'var(--yardline-white)'}}>May 14</strong>. Auto-apply preferred. Send proof within 48 hours.
              </div>
            </div>
            <div className="how-card">
              <div className="how-num">4</div>
              <div className="how-title">Reorders At Full Price</div>
              <div className="how-body">
                Month 2+ reorders return to full wholesale. The front-load only applies to your first launch order — that&rsquo;s why volume on the launch PO matters.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-inner">
          <div className="section-eyebrow">Timeline · Lock The Dates</div>
          <h2 className="section-h2">Six dates that decide whether you get the support.</h2>

          <div className="timeline-track">
            <div className="timeline-item now">
              <div className="tl-date">Apr 28 – May 8, 2026 <span className="tl-now-pill">Now Open</span></div>
              <div className="tl-title">Launch Order Window</div>
              <div className="tl-body">First launch POs at the reduced wholesale price. Place yours through highsman.com/njmenu. No cap — order what you can move in 30 days.</div>
            </div>
            <div className="timeline-item active">
              <div className="tl-date">May 8 – 12, 2026</div>
              <div className="tl-title">Delivery Window</div>
              <div className="tl-body">Product arrives at your store. Confirm the SKUs, get them on the floor, build your menu listing.</div>
            </div>
            <div className="timeline-item active">
              <div className="tl-date">May 14, 2026</div>
              <div className="tl-title">Consumer Promo Goes Live</div>
              <div className="tl-body">Deal must be live and visible in your Deals/Specials tab on the online menu, configured for Ground Game 7G and Triple Threat 1.2G only.</div>
            </div>
            <div className="timeline-item active">
              <div className="tl-date">May 16, 2026</div>
              <div className="tl-title">Menu Proof Due (48h Deadline)</div>
              <div className="tl-body">Screenshot of the live deal sent to your Highsman rep within 48 hours of launch. Miss this and you&rsquo;re flagged for wholesale price correction.</div>
            </div>
            <div className="timeline-item">
              <div className="tl-date">May 14 – June 13, 2026</div>
              <div className="tl-title">30-Day Consumer Promo Window</div>
              <div className="tl-body">The deal runs at retail for 30 days. Drive sell-through, free up shelf, build your reorder forecast.</div>
            </div>
            <div className="timeline-item">
              <div className="tl-date">June 14+, 2026</div>
              <div className="tl-title">Reorders At Full Wholesale</div>
              <div className="tl-body">No front-load support on Month 2+ reorders. The launch PO is your one shot at the reduced cost.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="conditions">
        <div className="section-inner">
          <div className="section-eyebrow">Qualifying Conditions</div>
          <h2 className="section-h2">Four boxes to check. All four are required.</h2>

          <div className="cond-grid">
            <div className="cond-card">
              <div className="cond-check"><span className="material-icons">check</span></div>
              <div>
                <div className="cond-num">Condition 01</div>
                <div className="cond-title">Single-SKU Configuration</div>
                <div className="cond-body">Consumer deal must be configured for Ground Game 7G and Triple Threat 1.2G only. No cross-category bundles. No stacking with other promos.</div>
              </div>
            </div>
            <div className="cond-card">
              <div className="cond-check"><span className="material-icons">check</span></div>
              <div>
                <div className="cond-num">Condition 02</div>
                <div className="cond-title">Live On Menu By May 14</div>
                <div className="cond-body">Deal must be live and visible on the Deals/Specials tab of your online menu on launch day. Not buried, not hidden behind a filter.</div>
              </div>
            </div>
            <div className="cond-card">
              <div className="cond-check"><span className="material-icons">check</span></div>
              <div>
                <div className="cond-num">Condition 03</div>
                <div className="cond-title">Menu Proof Within 48 Hours</div>
                <div className="cond-body">Screenshot of the live deal must reach your Highsman rep by May 16. Standardized deal name on the menu must match.</div>
              </div>
            </div>
            <div className="cond-card">
              <div className="cond-check"><span className="material-icons">check</span></div>
              <div>
                <div className="cond-num">Condition 04</div>
                <div className="cond-title">Auto-Apply Preferred</div>
                <div className="cond-body">Auto-apply discount is preferred for clean budtender execution. If you must use a manual override, confirm the execution method with your rep.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-inner">
          <div className="section-eyebrow">Proof Requirements</div>
          <h2 className="section-h2">Non-negotiable. Two pieces. One deadline.</h2>

          <div className="proof-card">
            <ol className="proof-list">
              <li><strong style={{color: 'var(--yardline-white)', fontWeight: 600}}>Screenshot of the deal live</strong> in your Deals/Specials tab on the online menu — must clearly show the percent off and the qualifying SKUs.</li>
              <li><strong style={{color: 'var(--yardline-white)', fontWeight: 600}}>Deal name matches</strong> the standardized naming: <em style={{color: 'var(--field-yellow)', fontStyle: 'normal'}}>&ldquo;NEW: Ground Game + Triple Threat — Launch Deal&rdquo;</em></li>
            </ol>
            <div className="proof-deadline">
              <div className="proof-deadline-label">Deadline</div>
              <div className="proof-deadline-date">16</div>
              <div className="proof-deadline-month">May 2026</div>
            </div>
          </div>
        </div>
      </section>

      <section className="conditions">
        <div className="section-inner">
          <div className="section-eyebrow">Non-Execution Policy</div>
          <h2 className="section-h2">If you take the support but don&rsquo;t run the deal —</h2>
          <p className="section-lede">
            The front-load is built into your wholesale price on the assumption that the consumer
            promo runs as configured. We verify within 48 hours of launch and act fast on misses.
          </p>

          <div className="nonexec-card">
            <div className="nonexec-icon"><span className="material-icons">priority_high</span></div>
            <div>
              <div className="nonexec-title">Stores That Don&rsquo;t Execute</div>
              <div className="nonexec-body">
                If a store receives the reduced wholesale price but does <strong>not</strong> run the 20% consumer promo
                (deal not live, not visible, not configured correctly), the store will be
                <strong> excluded from future Highsman promos</strong>. Sky flags non-executing stores to Reid within 48 hours of launch
                via the Sales-Floor escalation matrix. Wholesale price correction may apply.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="faq">
        <div className="section-inner">
          <div className="section-eyebrow">FAQ · Buyer &amp; Owner Quick Hits</div>
          <h2 className="section-h2">Answers to the questions we get most.</h2>

          <div className="faq-list">
            <div className="faq-item">
              <div className="faq-q">Is there a minimum or maximum order on the launch PO?</div>
              <div className="faq-a">No order cap. Whatever you order on the initial launch PO qualifies for the reduced wholesale price. Stock for what you can sell in 30 days.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Do reorders during the promo window get the front-load?</div>
              <div className="faq-a"><strong>No.</strong> The reduced wholesale price applies to the <strong>first launch PO only</strong>. Reorders during the 30-day window — and all Month 2+ reorders — return to standard wholesale.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Can I bundle Ground Game and Triple Threat with other promos?</div>
              <div className="faq-a">No stacking and no cross-category bundles. The deal must be configured as a single-SKU 20% off on Ground Game 7G or Triple Threat 1.2G only. Stacking voids qualification.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">What if my menu provider can&rsquo;t auto-apply the discount?</div>
              <div className="faq-a">Auto-apply is preferred. If you have to use a manual override at the register, confirm the execution method with your Highsman rep before launch so we can verify on the budtender side.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">Where exactly do I send the menu proof?</div>
              <div className="faq-a">Send the screenshot to your Highsman rep by <strong>May 16, 2026</strong>. Sky reviews proofs within 48 hours of launch and flags misses to Reid via the Sales-Floor escalation matrix.</div>
            </div>
            <div className="faq-item">
              <div className="faq-q">What happens to reorders if I&rsquo;m flagged for non-execution?</div>
              <div className="faq-a">Wholesale price correction may apply on the launch PO, and the store is excluded from future Highsman promos. Talk to your rep before launch if anything could prevent you from running the consumer deal as configured.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <h2>Place the launch order.<br /><span className="yellow">Spark Greatness.</span></h2>
        <p>The wholesale front-load only lives on the launch PO. Place it through highsman.com/njmenu before the May 8 cutoff.</p>
        <a href="https://highsman.com/njmenu" className="btn-primary">
          <span>Open /njmenu</span>
          <span className="material-icons">arrow_forward</span>
        </a>
      </section>

      <footer className="site">
        <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430" alt="Highsman" />
        <div className="footer-tag">SPARK GREATNESS&trade;</div>
        <div className="footer-meta">
          Internal partner terms — NJ Retail Launch Deal · April 28 – June 13, 2026.<br />
          Questions? Contact your Highsman rep or email partners@highsman.com.
        </div>
      </footer>
    </div>
  );
}
