import {useEffect, useState} from 'react';
import type {MetaFunction, LinksFunction} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE — hide global header/footer for focused launch landing page
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

// ─────────────────────────────────────────────────────────────────────────────
// META
// ─────────────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN — Launch Deal: 20% Off Ground Game & Triple Threat'},
  {
    name: 'description',
    content:
      'Limited run. 20% off Ground Game 7G and Triple Threat 1.2G Triple Infused pre-rolls at participating NJ dispensaries. May 14 – June 13. Spark Greatness.',
  },
  {property: 'og:title', content: 'HIGHSMAN — Launch Deal: 20% Off Ground Game & Triple Threat'},
  {
    property: 'og:description',
    content: 'Limited run. 20% off at participating NJ dispensaries. May 14 – June 13.',
  },
  {property: 'og:type', content: 'website'},
  {property: 'og:url', content: 'https://highsman.com/njlaunch'},
  {
    property: 'og:image',
    content:
      'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Promo_Site_Launch.gif?v=1777390146',
  },
  {name: 'twitter:card', content: 'summary_large_image'},
];

// ─────────────────────────────────────────────────────────────────────────────
// LINKS — add Barlow Semi Condensed (Teko already loaded globally in root.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export const links: LinksFunction = () => [
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN TARGETS
// ─────────────────────────────────────────────────────────────────────────────

const LAUNCH_START_MS = new Date('2026-05-14T00:00:00-04:00').getTime();
const LAUNCH_END_MS = new Date('2026-06-13T23:59:59-04:00').getTime();

function pad(n: number) {
  return n < 10 ? '0' + n : '' + n;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE STYLES (kept inline + scoped to .nj-launch root to avoid global bleed)
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
  .nj-launch {
    --space-black: #000000;
    --quarter-gray: #A9ACAF;
    --yardline-white: #FFFFFF;
    --field-yellow: #F5E500;
    --field-yellow-hover: #FFF200;
    --shadow-line: rgba(255,255,255,0.08);
    --max-w: 1240px;
    background: var(--space-black);
    color: var(--yardline-white);
    font-family: 'Barlow Semi Condensed', -apple-system, BlinkMacSystemFont, sans-serif;
    font-weight: 400;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
    padding-bottom: 80px;
    min-height: 100vh;
  }
  @media (min-width: 901px) { .nj-launch { padding-bottom: 0; } }
  .nj-launch * { box-sizing: border-box; }
  .nj-launch img { max-width: 100%; height: auto; display: block; }
  .nj-launch a { color: inherit; text-decoration: none; }
  .nj-launch h1, .nj-launch h2, .nj-launch h3, .nj-launch h4, .nj-launch .teko {
    font-family: 'Teko', 'Barlow Semi Condensed', sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 0.95;
    margin: 0;
  }
  .nj-launch p { margin: 0; }

  /* Announcement bar */
  .nj-launch .announce {
    background: var(--field-yellow);
    color: var(--space-black);
    text-align: center;
    padding: 10px 16px;
    font-family: 'Teko', sans-serif;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 18px;
    letter-spacing: 0.06em;
  }
  .nj-launch .announce strong { font-weight: 700; }

  /* Header */
  .nj-launch header.site {
    position: sticky; top: 0; z-index: 50;
    background: rgba(0,0,0,0.92);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--shadow-line);
  }
  .nj-launch header.site .inner {
    max-width: var(--max-w); margin: 0 auto;
    padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .nj-launch header.site img.logo { width: 160px; }
  .nj-launch header.site nav a {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase; letter-spacing: 0.08em;
    font-size: 18px; font-weight: 500;
    color: var(--quarter-gray);
    margin-left: 22px;
    transition: color .15s ease;
  }
  .nj-launch header.site nav a:hover, .nj-launch header.site nav a:focus { color: var(--yardline-white); }
  .nj-launch header.site nav a.cta {
    color: var(--space-black);
    background: var(--field-yellow);
    padding: 8px 16px; border-radius: 4px; font-weight: 600;
  }
  .nj-launch header.site nav a.cta:hover { background: var(--field-yellow-hover); }
  @media (max-width: 700px) {
    .nj-launch header.site nav a:not(.cta) { display: none; }
    .nj-launch header.site img.logo { width: 130px; }
  }

  /* Hero */
  .nj-launch .hero {
    position: relative;
    padding: 80px 24px 60px;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 70% 20%, rgba(245,229,0,0.12) 0%, transparent 55%),
      radial-gradient(ellipse at 10% 90%, rgba(169,172,175,0.10) 0%, transparent 50%),
      var(--space-black);
  }
  .nj-launch .hero .inner {
    max-width: var(--max-w); margin: 0 auto;
    text-align: center; position: relative; z-index: 2;
  }
  .nj-launch .hero .eyebrow {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    font-size: 22px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: var(--field-yellow);
    border: 1px solid var(--field-yellow);
    padding: 6px 14px; margin-bottom: 22px;
  }
  .nj-launch .hero h1 {
    font-size: clamp(60px, 11vw, 168px);
    color: var(--yardline-white);
    margin-bottom: 8px; line-height: 0.85;
  }
  .nj-launch .hero h1 .yellow { color: var(--field-yellow); }
  .nj-launch .hero .sub {
    font-family: 'Teko', sans-serif;
    font-size: clamp(28px, 4vw, 52px);
    font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--yardline-white);
    margin-top: 10px;
  }
  .nj-launch .hero .sub .x {
    color: var(--quarter-gray); margin: 0 12px; font-weight: 400;
  }
  .nj-launch .hero .dates {
    margin-top: 20px;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 18px; font-weight: 500;
    color: var(--quarter-gray); letter-spacing: 0.04em;
  }
  .nj-launch .hero .dates strong { color: var(--yardline-white); font-weight: 600; }

  /* Buttons */
  .nj-launch .btn {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    font-weight: 600; font-size: 26px;
    text-transform: uppercase; letter-spacing: 0.08em;
    padding: 16px 36px; border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform .12s ease, background .15s ease, color .15s ease;
    line-height: 1;
  }
  .nj-launch .btn:hover { transform: translateY(-2px); }
  .nj-launch .btn-primary { background: var(--field-yellow); color: var(--space-black); }
  .nj-launch .btn-primary:hover { background: var(--field-yellow-hover); }
  .nj-launch .btn-ghost {
    background: transparent; color: var(--yardline-white);
    border-color: var(--yardline-white);
  }
  .nj-launch .btn-ghost:hover { background: var(--yardline-white); color: var(--space-black); }
  .nj-launch .hero .cta-row {
    margin-top: 36px;
    display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;
  }
  .nj-launch .hero::before {
    content: "H";
    position: absolute;
    font-family: 'Teko', sans-serif;
    font-weight: 700; font-size: 80vw;
    line-height: 1;
    color: rgba(255,255,255,0.025);
    top: -10vw; right: -10vw; z-index: 1;
    pointer-events: none; user-select: none;
  }

  /* Reveal (GIF banner) */
  .nj-launch .reveal {
    background: var(--space-black);
    padding: 0 24px 80px; position: relative;
  }
  .nj-launch .reveal .frame {
    max-width: 1100px; margin: 0 auto;
    position: relative;
    border: 1px solid var(--shadow-line);
    background: #0a0a0a;
    overflow: hidden;
    box-shadow:
      0 0 0 1px rgba(245,229,0,0.15),
      0 30px 80px rgba(0,0,0,0.6),
      0 0 80px rgba(245,229,0,0.10);
  }
  .nj-launch .reveal .frame img { width: 100%; height: auto; display: block; }
  .nj-launch .reveal .corner-tag {
    position: absolute; top: 16px; left: 16px;
    background: var(--field-yellow); color: var(--space-black);
    font-family: 'Teko', sans-serif;
    font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; padding: 6px 12px;
    font-size: 16px; z-index: 2;
  }

  /* Countdown */
  .nj-launch .countdown-wrap {
    background: var(--space-black);
    border-top: 1px solid var(--shadow-line);
    border-bottom: 1px solid var(--shadow-line);
    padding: 36px 24px;
  }
  .nj-launch .countdown { max-width: 720px; margin: 0 auto; text-align: center; }
  .nj-launch .countdown .label {
    font-family: 'Teko', sans-serif;
    font-size: 22px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--quarter-gray); margin-bottom: 14px;
  }
  .nj-launch .countdown .timer {
    display: flex; justify-content: center; gap: 16px; flex-wrap: wrap;
  }
  .nj-launch .countdown .unit {
    min-width: 88px; padding: 14px 12px;
    border: 1px solid var(--shadow-line);
    background: rgba(255,255,255,0.02);
  }
  .nj-launch .countdown .num {
    display: block;
    font-family: 'Teko', sans-serif;
    font-size: 56px; font-weight: 700;
    color: var(--field-yellow); line-height: 1;
  }
  .nj-launch .countdown .unit-label {
    display: block; margin-top: 4px;
    font-family: 'Teko', sans-serif;
    font-size: 16px; text-transform: uppercase;
    letter-spacing: 0.16em; color: var(--quarter-gray);
  }
  .nj-launch .countdown .live-msg {
    font-family: 'Teko', sans-serif;
    font-size: 32px; font-weight: 600;
    color: var(--field-yellow);
    text-transform: uppercase; letter-spacing: 0.08em;
  }

  /* Sections */
  .nj-launch section { padding: 80px 24px; }
  .nj-launch section .inner { max-width: var(--max-w); margin: 0 auto; }
  .nj-launch .section-eyebrow {
    font-family: 'Teko', sans-serif;
    font-weight: 500; text-transform: uppercase;
    letter-spacing: 0.18em; color: var(--field-yellow);
    font-size: 18px; margin-bottom: 12px;
  }
  .nj-launch .section-title {
    font-size: clamp(40px, 6vw, 80px);
    color: var(--yardline-white);
    margin-bottom: 16px; max-width: 900px;
  }
  .nj-launch .section-lede {
    font-size: 19px; color: var(--quarter-gray);
    max-width: 720px; margin-bottom: 48px;
  }

  /* Products */
  .nj-launch .products { background: var(--space-black); }
  .nj-launch .product-grid {
    display: grid; grid-template-columns: 1fr; gap: 24px;
  }
  @media (min-width: 800px) {
    .nj-launch .product-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  }
  .nj-launch .product-card {
    background: linear-gradient(180deg, #0a0a0a 0%, #000 100%);
    border: 1px solid var(--shadow-line);
    padding: 40px 32px;
    position: relative; overflow: hidden;
    display: flex; flex-direction: column;
    min-height: 540px;
    transition: border-color .2s ease, transform .2s ease;
  }
  .nj-launch .product-card:hover { border-color: var(--field-yellow); transform: translateY(-4px); }
  .nj-launch .product-card .product-img-wrap {
    position: relative; height: 280px;
    margin: -20px -32px 24px;
    background:
      radial-gradient(ellipse at center, rgba(245,229,0,0.10) 0%, transparent 65%),
      linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    border-bottom: 1px solid var(--shadow-line);
  }
  .nj-launch .product-card .product-img-wrap img {
    max-height: 260px; width: auto; max-width: 90%;
    object-fit: contain;
    filter: drop-shadow(0 20px 30px rgba(0,0,0,0.6));
    transition: transform .35s ease;
  }
  .nj-launch .product-card:hover .product-img-wrap img { transform: scale(1.04); }
  @media (min-width: 800px) {
    .nj-launch .product-card .product-img-wrap { height: 320px; }
    .nj-launch .product-card .product-img-wrap img { max-height: 300px; }
  }
  .nj-launch .product-card .badge {
    position: absolute; top: 24px; right: 24px;
    background: var(--field-yellow); color: var(--space-black);
    font-family: 'Teko', sans-serif;
    font-weight: 700; font-size: 22px;
    padding: 6px 14px; border-radius: 2px;
    letter-spacing: 0.04em; line-height: 1;
    z-index: 3;
  }
  .nj-launch .product-card .use-case {
    font-family: 'Teko', sans-serif;
    font-size: 16px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: var(--quarter-gray); margin-bottom: 14px;
  }
  .nj-launch .product-card h3 {
    font-size: clamp(48px, 6vw, 76px);
    color: var(--yardline-white); margin-bottom: 8px;
  }
  .nj-launch .product-card .format {
    font-family: 'Teko', sans-serif;
    font-size: 32px; font-weight: 500;
    color: var(--field-yellow);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 24px;
  }
  .nj-launch .product-card .desc {
    font-size: 17px; color: var(--yardline-white);
    margin-bottom: 24px; line-height: 1.55;
  }
  .nj-launch .product-card ul {
    list-style: none; margin: 0 0 32px 0; padding: 0; flex-grow: 1;
  }
  .nj-launch .product-card ul li {
    font-size: 15.5px; color: var(--quarter-gray);
    padding: 8px 0 8px 22px; position: relative;
    border-bottom: 1px solid var(--shadow-line);
  }
  .nj-launch .product-card ul li:last-child { border-bottom: none; }
  .nj-launch .product-card ul li::before {
    content: "▸"; position: absolute; left: 0; top: 8px;
    color: var(--field-yellow); font-size: 14px;
  }
  .nj-launch .product-card .deal-line {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase; color: var(--yardline-white);
    font-size: 22px; letter-spacing: 0.04em;
    padding: 14px 0;
    border-top: 2px solid var(--field-yellow);
    margin-top: auto;
  }
  .nj-launch .product-card .deal-line strong { color: var(--field-yellow); }
  .nj-launch .product-card .visual {
    position: absolute; bottom: -50px; right: -40px;
    font-family: 'Teko', sans-serif;
    font-weight: 700; font-size: 280px;
    color: rgba(245,229,0,0.03);
    line-height: 1;
    pointer-events: none; user-select: none; z-index: 0;
  }

  /* Why */
  .nj-launch .why { background: var(--space-black); border-top: 1px solid var(--shadow-line); }
  .nj-launch .why-grid {
    display: grid; grid-template-columns: 1fr; gap: 32px; margin-top: 48px;
  }
  @media (min-width: 800px) {
    .nj-launch .why-grid { grid-template-columns: repeat(3, 1fr); }
  }
  .nj-launch .why-card { border-left: 3px solid var(--field-yellow); padding: 12px 0 12px 24px; }
  .nj-launch .why-card .num {
    font-family: 'Teko', sans-serif;
    font-size: 22px; font-weight: 600;
    color: var(--field-yellow); letter-spacing: 0.16em;
    margin-bottom: 8px;
  }
  .nj-launch .why-card h4 {
    font-size: 32px; color: var(--yardline-white); margin-bottom: 12px;
  }
  .nj-launch .why-card p { color: var(--quarter-gray); font-size: 16.5px; line-height: 1.55; }

  /* How */
  .nj-launch .how { background: linear-gradient(180deg, #0a0a0a 0%, #000 100%); }
  .nj-launch .steps {
    display: grid; grid-template-columns: 1fr; gap: 24px; margin-top: 48px;
  }
  @media (min-width: 800px) {
    .nj-launch .steps { grid-template-columns: repeat(3, 1fr); }
  }
  .nj-launch .step {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--shadow-line);
    padding: 32px; position: relative;
  }
  .nj-launch .step .step-num {
    font-family: 'Teko', sans-serif;
    font-size: 80px; font-weight: 700;
    color: var(--field-yellow); line-height: 0.9;
    margin-bottom: 12px;
  }
  .nj-launch .step h4 { font-size: 28px; color: var(--yardline-white); margin-bottom: 10px; }
  .nj-launch .step p { color: var(--quarter-gray); font-size: 16px; }

  /* FAQ */
  .nj-launch .faq { background: var(--space-black); border-top: 1px solid var(--shadow-line); }
  .nj-launch .faq-list { margin-top: 32px; }
  .nj-launch .faq details {
    border-bottom: 1px solid var(--shadow-line);
    padding: 22px 0; cursor: pointer;
  }
  .nj-launch .faq summary {
    font-family: 'Teko', sans-serif;
    font-size: 26px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--yardline-white);
    list-style: none;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .nj-launch .faq summary::-webkit-details-marker { display: none; }
  .nj-launch .faq summary::after {
    content: "+"; font-size: 32px; color: var(--field-yellow);
    transition: transform .2s ease; line-height: 1;
  }
  .nj-launch .faq details[open] summary::after { content: "−"; }
  .nj-launch .faq details p {
    color: var(--quarter-gray); font-size: 17px;
    margin-top: 12px; line-height: 1.6; max-width: 800px;
  }

  /* Final CTA */
  .nj-launch .final-cta {
    background:
      radial-gradient(ellipse at center, rgba(245,229,0,0.18) 0%, transparent 60%),
      var(--space-black);
    text-align: center; padding: 100px 24px;
  }
  .nj-launch .final-cta h2 {
    font-size: clamp(48px, 8vw, 110px);
    color: var(--yardline-white); margin-bottom: 16px;
  }
  .nj-launch .final-cta h2 .yellow { color: var(--field-yellow); }
  .nj-launch .final-cta p {
    color: var(--quarter-gray); font-size: 19px;
    max-width: 620px; margin: 0 auto 32px;
  }

  /* Footer */
  .nj-launch footer.local {
    background: var(--space-black); padding: 60px 24px 100px;
    border-top: 1px solid var(--shadow-line); text-align: center;
  }
  .nj-launch footer.local .spark { width: 200px; margin: 0 auto 24px; opacity: 0.9; }
  .nj-launch footer.local .signature {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 13px; color: var(--quarter-gray);
    letter-spacing: 0.04em; margin-bottom: 28px;
  }
  .nj-launch footer.local .links a {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--quarter-gray); margin: 0 14px;
    font-size: 16px; transition: color .15s ease;
  }
  .nj-launch footer.local .links a:hover { color: var(--yardline-white); }
  .nj-launch footer.local .legal {
    margin-top: 28px; color: var(--quarter-gray);
    font-size: 12px; line-height: 1.6;
    max-width: 760px; margin-left: auto; margin-right: auto;
    opacity: 0.7;
  }

  /* Sticky mobile CTA */
  .nj-launch .sticky-cta {
    display: none;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--field-yellow); color: var(--space-black);
    padding: 16px; text-align: center; z-index: 100;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
  }
  .nj-launch .sticky-cta a {
    display: block;
    font-family: 'Teko', sans-serif;
    font-weight: 700; font-size: 22px;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--space-black);
  }
  @media (max-width: 900px) { .nj-launch .sticky-cta { display: block; } }

  .nj-launch a:focus-visible,
  .nj-launch button:focus-visible,
  .nj-launch summary:focus-visible {
    outline: 3px solid var(--field-yellow); outline-offset: 3px;
  }
  @media (prefers-reduced-motion: reduce) {
    .nj-launch * { animation: none !important; transition: none !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type CountdownState =
  | {kind: 'before'; days: number; hours: number; mins: number; secs: number}
  | {kind: 'live'}
  | {kind: 'ended'};

export default function NjLaunch() {
  const [cd, setCd] = useState<CountdownState>({
    kind: 'before',
    days: 0,
    hours: 0,
    mins: 0,
    secs: 0,
  });

  useEffect(() => {
    function tick() {
      const now = Date.now();
      if (now >= LAUNCH_START_MS && now <= LAUNCH_END_MS) {
        setCd({kind: 'live'});
        return;
      }
      if (now > LAUNCH_END_MS) {
        setCd({kind: 'ended'});
        return;
      }
      const diff = LAUNCH_START_MS - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setCd({kind: 'before', days, hours, mins, secs});
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="nj-launch">
      <style dangerouslySetInnerHTML={{__html: PAGE_CSS}} />

      {/* Announcement bar */}
      <div className="announce">
        <strong>LIMITED RUN</strong> · 20% OFF GROUND GAME &amp; TRIPLE THREAT · MAY 14 – JUNE 13
      </div>

      {/* Header */}
      <header className="site">
        <div className="inner">
          <a href="https://highsman.com" aria-label="Highsman home">
            <img
              className="logo"
              src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
              alt="Highsman"
            />
          </a>
          <nav>
            <a href="#products">The Drop</a>
            <a href="#how">How It Works</a>
            <a href="#faq">FAQ</a>
            <a className="cta" href="#find">Find a Dispensary</a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="inner">
          <span className="eyebrow">May 14 – June 13 · NJ Only</span>
          <h1>
            <span className="yellow">20% OFF.</span>
            <br />
            THE HIGHSMAN
            <br />
            LAUNCH DEAL.
          </h1>
          <div className="sub">
            Ground Game 7G <span className="x">×</span> Triple Threat 1.2G
          </div>
          <p className="dates">
            Live <strong>May 14</strong>. Gone <strong>June 13</strong>. At participating NJ
            dispensaries.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#find">
              Find a Dispensary →
            </a>
            <a className="btn btn-ghost" href="#products">
              See the Drop
            </a>
          </div>
        </div>
      </section>

      {/* REVEAL — launch GIF */}
      <section className="reveal">
        <div className="frame">
          <span className="corner-tag">The Drop</span>
          <img
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Promo_Site_Launch.gif?v=1777390146"
            alt="Highsman Launch — Ground Game and Triple Threat in motion"
            loading="lazy"
          />
        </div>
      </section>

      {/* COUNTDOWN */}
      <div className="countdown-wrap">
        <div className="countdown">
          {cd.kind === 'before' && (
            <>
              <div className="label">Drop goes live in</div>
              <div className="timer" role="timer" aria-live="polite">
                <div className="unit">
                  <span className="num">{pad(cd.days)}</span>
                  <span className="unit-label">Days</span>
                </div>
                <div className="unit">
                  <span className="num">{pad(cd.hours)}</span>
                  <span className="unit-label">Hours</span>
                </div>
                <div className="unit">
                  <span className="num">{pad(cd.mins)}</span>
                  <span className="unit-label">Mins</span>
                </div>
                <div className="unit">
                  <span className="num">{pad(cd.secs)}</span>
                  <span className="unit-label">Secs</span>
                </div>
              </div>
            </>
          )}
          {cd.kind === 'live' && (
            <>
              <div className="label">The Drop is Live · Ends June 13</div>
              <div className="live-msg">🟢 Find a Dispensary Now</div>
            </>
          )}
          {cd.kind === 'ended' && (
            <>
              <div className="label">This Drop Has Ended</div>
              <div className="live-msg">Stay tuned for what's next.</div>
            </>
          )}
        </div>
      </div>

      {/* PRODUCTS */}
      <section className="products" id="products">
        <div className="inner">
          <div className="section-eyebrow">The Drop</div>
          <h2 className="section-title">Two Formats. One Standard. Same 20% Off.</h2>
          <p className="section-lede">
            Both built on the same Highsman process. Pick your format and run with it.
          </p>

          <div className="product-grid">
            {/* Ground Game */}
            <article className="product-card">
              <div className="product-img-wrap">
                <img
                  src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Ground_Game_Bag_njretail.png?v=1776436172"
                  alt="Highsman Ground Game 7G Ready-to-Roll Flower bag"
                  loading="lazy"
                />
              </div>
              <span className="badge">20% OFF</span>
              <div className="visual">GG</div>
              <div className="use-case">Roll Your Own</div>
              <h3>Ground Game</h3>
              <div className="format">7G Ready-to-Roll Flower</div>
              <p className="desc">
                Premium flower, ground and ready. Roll a joint, pack a bowl, fill a bong — your
                call. Built for the ones who like control.
              </p>
              <ul>
                <li>Premium Highsman flower — same standard as the pre-roll</li>
                <li>7G — your most versatile format</li>
                <li>Best price-per-gram in the lineup</li>
                <li>Pre-ground. Ready when you are.</li>
              </ul>
              <div className="deal-line">
                First-Run Deal · <strong>20% Off</strong> · NJ Only
              </div>
            </article>

            {/* Triple Threat */}
            <article className="product-card">
              <div className="product-img-wrap">
                <img
                  src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Pre_Roll_Tube_retail.png?v=1776436152"
                  alt="Highsman Triple Threat 1.2G Triple Infused Pre-Roll tube"
                  loading="lazy"
                />
              </div>
              <span className="badge">20% OFF</span>
              <div className="visual">3X</div>
              <div className="use-case">Heavy Sessions · Sharing</div>
              <h3>Triple Threat</h3>
              <div className="format">1.2G Triple Infused Pre-Roll</div>
              <p className="desc">
                Diamonds, Live Resin, and interior kief spun <em>into</em> the flower at high speed.
                Closest thing to hash in a pre-roll format.
              </p>
              <ul>
                <li>Triple Infused — concentrates in the microstructure, not coated on top</li>
                <li>Burns smooth. No harsh "infused" edge.</li>
                <li>Flavor lasts the full smoke — not just the first hit</li>
                <li>1.2G — built for the long session</li>
              </ul>
              <div className="deal-line">
                First-Run Deal · <strong>20% Off</strong> · NJ Only
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="why">
        <div className="inner">
          <div className="section-eyebrow">Why Triple Infused</div>
          <h2 className="section-title">It's In the Flower. Not On It.</h2>
          <p className="section-lede">
            Most infused pre-rolls just coat the outside. Highsman spins the concentrates{' '}
            <em>into</em> the flower at high speed — so they go all the way through, like they were
            always there.
          </p>

          <div className="why-grid">
            <div className="why-card">
              <div className="num">01</div>
              <h4>Microstructure Infusion</h4>
              <p>
                Diamonds, Live Resin, and interior kief spun into the flower at 10,000 RPM — not
                painted on the outside.
              </p>
            </div>
            <div className="why-card">
              <div className="num">02</div>
              <h4>Flavor That Lasts</h4>
              <p>
                Full-spectrum from first hit to last. Not the front-loaded burn-off you get with
                surface-coated pre-rolls.
              </p>
            </div>
            <div className="why-card">
              <div className="num">03</div>
              <h4>Hash-Like Burn</h4>
              <p>
                Even, cool, no harshness. Tastes like the strain — not like extract sitting on top
                of it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="how" id="how">
        <div className="inner">
          <div className="section-eyebrow">How To Run It</div>
          <h2 className="section-title">Three Steps. One Drop.</h2>

          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h4>Find a Spot</h4>
              <p>
                Pick a participating NJ dispensary. The deal lives in their Deals or Specials tab on
                the menu.
              </p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h4>Pick Your Format</h4>
              <p>
                Ground Game 7G or Triple Threat 1.2G. Both are 20% off — single SKU, no
                cross-category bundles.
              </p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h4>Spark Greatness</h4>
              <p>
                Live May 14 through June 13. One run. When it's gone, it's gone — pricing returns to
                standard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="inner">
          <div className="section-eyebrow">Quick Answers</div>
          <h2 className="section-title">FAQ</h2>

          <div className="faq-list">
            <details>
              <summary>What's actually on sale?</summary>
              <p>
                Two SKUs: Ground Game 7G Ready-to-Roll Flower and Triple Threat 1.2G Triple Infused
                Pre-Roll. 20% off, single-unit purchase. No cross-category bundles. No stacking with
                other promos.
              </p>
            </details>
            <details>
              <summary>Where can I get it?</summary>
              <p>
                Participating adult-use dispensaries across New Jersey. The deal will be live in
                each store's Deals or Specials menu starting May 14. Hit "Find a Dispensary" to see
                the list.
              </p>
            </details>
            <details>
              <summary>How long does the deal run?</summary>
              <p>30 days. May 14 through June 13, 2026. After that, pricing returns to standard.</p>
            </details>
            <details>
              <summary>What's the difference between Ground Game and Triple Threat?</summary>
              <p>
                Same Highsman standard, different formats. Ground Game is 7G of pre-ground premium
                flower — your call how to roll it. Triple Threat is a 1.2G Triple Infused pre-roll
                built for heavy sessions and sharing. Pick what fits your session.
              </p>
            </details>
            <details>
              <summary>What does "Triple Infused" actually mean?</summary>
              <p>
                Diamonds (THCA Isolate), Live Resin, and interior kief spun into the flower's
                microstructure at high speed. The concentrates aren't coated on the outside —
                they're inside the flower. That's why the burn is smoother and the flavor lasts the
                full smoke.
              </p>
            </details>
            <details>
              <summary>Is this available outside of NJ?</summary>
              <p>
                This launch deal is New Jersey only. We'll announce future state launches on
                @highsman.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta" id="find">
        <div className="inner">
          <h2>
            Don't Miss <span className="yellow">The Drop.</span>
          </h2>
          <p>
            Limited run. Ground Game 7G and Triple Threat 1.2G — 20% off at participating NJ
            dispensaries. Live May 14. Gone June 13.
          </p>
          <a className="btn btn-primary" href="https://highsman.com/njmenu">
            Find a Dispensary →
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="local">
        <a href="https://highsman.com" aria-label="Highsman home">
          <img
            className="spark"
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Spark_Greatness_White.png?v=1775594430"
            alt="Spark Greatness"
          />
        </a>
        <div className="signature">HIGHSMAN by Ricky Williams · #34 · The Highsman</div>
        <div className="links">
          <a href="https://highsman.com">Home</a>
          <a href="https://highsman.com/njmenu">NJ Menu</a>
          <a href="https://instagram.com/highsman">@HIGHSMAN</a>
        </div>
        <p className="legal">
          For use only by adults 21 years of age or older. Keep out of reach of children and pets.
          Cannabis can impair concentration, coordination, and judgment. Do not operate a vehicle or
          machinery under the influence. Available only at licensed New Jersey adult-use
          dispensaries. Promo: 20% off single-unit purchase of Ground Game 7G or Triple Threat 1.2G
          Pre-Roll, May 14 – June 13, 2026, while supplies last. No stacking. Cross-category bundles
          excluded. Deal availability subject to participating retailers.
        </p>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="sticky-cta">
        <a href="https://highsman.com/njmenu">Find a Dispensary →</a>
      </div>
    </div>
  );
}
