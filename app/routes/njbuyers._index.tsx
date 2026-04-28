import type {MetaFunction, LinksFunction} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE — hide global header/footer for a focused buyer-credit landing page
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

// ─────────────────────────────────────────────────────────────────────────────
// META
// ─────────────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN — NJ Buyer Store Credit: 0.5% Back On Every Order'},
  {
    name: 'description',
    content:
      'Every NJ menu order banks 0.5% as Highsman store credit. Stack it. Cash out anytime as a Highsman gift card on apparel. Built for buyers who think long-game.',
  },
  {property: 'og:title', content: 'HIGHSMAN — 0.5% Back On Every NJ Order'},
  {
    property: 'og:description',
    content:
      'Bank 0.5% on every order. Cash out as a Highsman gift card anytime. Pros stack, then pull one big drop.',
  },
  {property: 'og:type', content: 'website'},
  {property: 'og:url', content: 'https://highsman.com/njbuyers'},
  {
    property: 'og:image',
    content:
      'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Promo_Site_Launch.gif?v=1777390146',
  },
  {name: 'twitter:card', content: 'summary_large_image'},
];

export const links: LinksFunction = () => [
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap',
  },
];

const LOGO_URL =
  'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_Block_Black.png';
const LOGO_WHITE_URL =
  'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_Block_White.png';

const PAGE_CSS = `
  .nj-buyers {
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
    min-height: 100vh;
  }
  .nj-buyers * { box-sizing: border-box; }
  .nj-buyers img { max-width: 100%; height: auto; display: block; }
  .nj-buyers a { color: inherit; text-decoration: none; }
  .nj-buyers h1, .nj-buyers h2, .nj-buyers h3, .nj-buyers h4, .nj-buyers .teko {
    font-family: 'Teko', 'Barlow Semi Condensed', sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 0.95;
    margin: 0;
  }
  .nj-buyers p { margin: 0; }

  /* Top sticky header */
  .nj-buyers header.site {
    position: sticky; top: 0; z-index: 50;
    background: rgba(0,0,0,0.92);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--shadow-line);
  }
  .nj-buyers header.site .inner {
    max-width: var(--max-w); margin: 0 auto;
    padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .nj-buyers header.site img.logo { width: 150px; }
  .nj-buyers header.site nav a {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase; letter-spacing: 0.08em;
    font-size: 18px; font-weight: 500;
    color: var(--quarter-gray); margin-left: 22px;
    transition: color .15s ease;
  }
  .nj-buyers header.site nav a:hover { color: var(--yardline-white); }
  .nj-buyers header.site nav a.cta {
    color: var(--space-black); background: var(--field-yellow);
    padding: 8px 18px; border-radius: 4px; font-weight: 600;
  }
  .nj-buyers header.site nav a.cta:hover { background: var(--field-yellow-hover); }
  @media (max-width: 700px) {
    .nj-buyers header.site nav a:not(.cta) { display: none; }
    .nj-buyers header.site img.logo { width: 120px; }
  }

  /* Hero */
  .nj-buyers .hero {
    position: relative;
    padding: 96px 24px 80px;
    background:
      radial-gradient(1200px 600px at 50% -20%, rgba(245,229,0,0.18), transparent 60%),
      linear-gradient(180deg, #050505 0%, #000 100%);
    border-bottom: 1px solid var(--shadow-line);
    overflow: hidden;
  }
  .nj-buyers .hero .inner {
    max-width: var(--max-w); margin: 0 auto;
    text-align: center;
    position: relative; z-index: 2;
  }
  .nj-buyers .hero .eyebrow {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.32em;
    font-size: 14px; font-weight: 600;
    color: var(--field-yellow);
    margin-bottom: 18px;
    padding: 4px 14px;
    border: 1px solid rgba(245,229,0,0.35);
    border-radius: 2px;
  }
  .nj-buyers .hero h1 {
    font-size: clamp(48px, 9vw, 112px);
    line-height: 0.92;
    margin-bottom: 20px;
  }
  .nj-buyers .hero h1 .yellow { color: var(--field-yellow); display: block; }
  .nj-buyers .hero .sub {
    max-width: 720px; margin: 0 auto 32px;
    color: var(--quarter-gray);
    font-size: 18px; line-height: 1.55;
  }
  .nj-buyers .hero .sub strong { color: var(--yardline-white); font-weight: 600; }
  .nj-buyers .hero .cta-row {
    display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;
  }
  .nj-buyers .btn {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 22px;
    padding: 14px 28px;
    border-radius: 4px;
    transition: all .15s ease;
    cursor: pointer;
    border: none;
  }
  .nj-buyers .btn-primary {
    background: var(--field-yellow);
    color: var(--space-black);
  }
  .nj-buyers .btn-primary:hover { background: var(--field-yellow-hover); transform: translateY(-1px); }
  .nj-buyers .btn-ghost {
    background: transparent;
    color: var(--yardline-white);
    border: 1px solid var(--shadow-line);
  }
  .nj-buyers .btn-ghost:hover { border-color: var(--field-yellow); color: var(--field-yellow); }

  /* Section frame */
  .nj-buyers section.band {
    padding: 80px 24px;
    border-bottom: 1px solid var(--shadow-line);
  }
  .nj-buyers section.band .inner {
    max-width: var(--max-w); margin: 0 auto;
  }
  .nj-buyers section.band h2 {
    font-size: clamp(36px, 5vw, 56px);
    margin-bottom: 12px;
  }
  .nj-buyers section.band h2 .yellow { color: var(--field-yellow); }
  .nj-buyers section.band .lede {
    color: var(--quarter-gray);
    font-size: 18px;
    max-width: 640px;
    margin-bottom: 40px;
  }
  .nj-buyers section.band .section-eyebrow {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 13px; font-weight: 600;
    color: var(--field-yellow);
    margin-bottom: 12px;
    display: block;
  }

  /* Math grid */
  .nj-buyers .math-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  .nj-buyers .math-card {
    border: 1px solid var(--shadow-line);
    border-radius: 8px;
    padding: 24px 22px;
    background: linear-gradient(180deg, rgba(245,229,0,0.04), rgba(245,229,0,0.01));
    text-align: left;
    transition: border-color .15s ease, transform .15s ease;
  }
  .nj-buyers .math-card:hover {
    border-color: rgba(245,229,0,0.4);
    transform: translateY(-2px);
  }
  .nj-buyers .math-card .label {
    font-family: 'Teko', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 13px; font-weight: 600;
    color: var(--quarter-gray);
    margin-bottom: 8px;
  }
  .nj-buyers .math-card .order {
    font-family: 'Teko', sans-serif;
    font-size: 32px; font-weight: 700;
    color: var(--yardline-white);
    line-height: 1;
    margin-bottom: 18px;
  }
  .nj-buyers .math-card .arrow {
    font-size: 20px; color: var(--quarter-gray);
    margin-bottom: 8px;
  }
  .nj-buyers .math-card .credit {
    font-family: 'Teko', sans-serif;
    font-size: 44px; font-weight: 700;
    color: var(--field-yellow);
    line-height: 1;
  }
  .nj-buyers .math-card .credit-suffix {
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 14px; font-weight: 500;
    color: var(--quarter-gray);
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .nj-buyers .math-card.highlight {
    border-color: rgba(245,229,0,0.5);
    background: linear-gradient(180deg, rgba(245,229,0,0.10), rgba(245,229,0,0.02));
  }
  .nj-buyers .math-card .badge {
    display: inline-block;
    font-family: 'Teko', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px; font-weight: 600;
    padding: 2px 8px;
    background: var(--field-yellow);
    color: var(--space-black);
    border-radius: 2px;
    margin-bottom: 10px;
  }

  /* Steps */
  .nj-buyers .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
  }
  .nj-buyers .step {
    border-left: 3px solid var(--field-yellow);
    padding: 4px 24px 4px;
  }
  .nj-buyers .step .num {
    font-family: 'Teko', sans-serif;
    font-size: 56px; font-weight: 700;
    color: var(--field-yellow);
    line-height: 1; margin-bottom: 10px;
  }
  .nj-buyers .step h3 {
    font-size: 26px;
    margin-bottom: 8px;
  }
  .nj-buyers .step p {
    color: var(--quarter-gray);
    font-size: 15px; line-height: 1.55;
  }

  /* Smart play band */
  .nj-buyers .smart-play {
    background:
      radial-gradient(800px 400px at 50% 0%, rgba(245,229,0,0.10), transparent 70%),
      #000;
  }
  .nj-buyers .smart-play .inner {
    max-width: 880px;
    text-align: center;
  }
  .nj-buyers .smart-play .punch {
    font-family: 'Teko', sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    font-size: clamp(36px, 6vw, 68px);
    line-height: 0.96;
    margin-bottom: 24px;
  }
  .nj-buyers .smart-play .punch .yellow { color: var(--field-yellow); }
  .nj-buyers .smart-play .body {
    color: var(--quarter-gray);
    font-size: 18px;
    line-height: 1.6;
    max-width: 700px;
    margin: 0 auto;
  }
  .nj-buyers .smart-play .body strong { color: var(--yardline-white); font-weight: 600; }

  /* FAQ */
  .nj-buyers .faq-list { display: grid; gap: 0; }
  .nj-buyers details {
    border-top: 1px solid var(--shadow-line);
    padding: 18px 4px;
  }
  .nj-buyers details:last-child { border-bottom: 1px solid var(--shadow-line); }
  .nj-buyers details summary {
    list-style: none;
    cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'Teko', sans-serif;
    font-size: 22px; font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .nj-buyers details summary::-webkit-details-marker { display: none; }
  .nj-buyers details summary::after {
    content: '+';
    color: var(--field-yellow);
    font-weight: 400;
    font-size: 28px;
    transition: transform .15s ease;
  }
  .nj-buyers details[open] summary::after { content: '-'; }
  .nj-buyers details p {
    margin-top: 12px;
    color: var(--quarter-gray);
    font-size: 16px; line-height: 1.6;
    max-width: 720px;
  }

  /* Final CTA */
  .nj-buyers .final-cta {
    background:
      radial-gradient(900px 500px at 50% 100%, rgba(245,229,0,0.16), transparent 60%),
      #000;
    text-align: center;
    padding: 96px 24px;
  }
  .nj-buyers .final-cta h2 {
    font-size: clamp(44px, 7vw, 84px);
    margin-bottom: 16px;
  }
  .nj-buyers .final-cta h2 .yellow { color: var(--field-yellow); }
  .nj-buyers .final-cta p {
    color: var(--quarter-gray);
    font-size: 18px;
    margin-bottom: 28px;
  }

  /* Footer */
  .nj-buyers footer.brand {
    padding: 32px 24px;
    text-align: center;
    color: var(--quarter-gray);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-top: 1px solid var(--shadow-line);
  }
  .nj-buyers footer.brand img { width: 120px; margin: 0 auto 12px; opacity: 0.6; }
  .nj-buyers footer.brand .tagline {
    font-family: 'Teko', sans-serif;
    color: var(--field-yellow);
    font-size: 16px; letter-spacing: 0.2em;
    margin-top: 6px;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function NjBuyers() {
  return (
    <div className="nj-buyers">
      <style dangerouslySetInnerHTML={{__html: PAGE_CSS}} />

      {/* Sticky header */}
      <header className="site">
        <div className="inner">
          <a href="/">
            <img className="logo" src={LOGO_WHITE_URL} alt="Highsman" />
          </a>
          <nav>
            <a href="#how-it-works">How it works</a>
            <a href="#math">The math</a>
            <a href="#faq">FAQ</a>
            <a className="cta" href="/njmenu">Order on NJ Menu</a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="inner">
          <span className="eyebrow">For NJ Buyers</span>
          <h1>
            Every Order Stacks.
            <span className="yellow">0.5% Back. Every Time.</span>
          </h1>
          <p className="sub">
            Every order you place on the NJ menu banks <strong>0.5% as Highsman store credit</strong>.
            Cash it out anytime as a Highsman gift card. Built for buyers who think long-game.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="/njmenu">Order on NJ Menu</a>
            <a className="btn btn-ghost" href="#how-it-works">See How It Works</a>
          </div>
        </div>
      </section>

      {/* THE MATH */}
      <section className="band" id="math">
        <div className="inner">
          <span className="section-eyebrow">The Math</span>
          <h2>What <span className="yellow">0.5%</span> Looks Like</h2>
          <p className="lede">
            Small order, small bank. Big order, real bank. Year over year, it stacks into something worth pulling.
          </p>
          <div className="math-grid">
            <div className="math-card">
              <div className="label">Single Order</div>
              <div className="order">$500</div>
              <div className="arrow">↓</div>
              <div className="credit">$2.50</div>
              <div className="credit-suffix">Banked</div>
            </div>
            <div className="math-card">
              <div className="label">Single Order</div>
              <div className="order">$2,000</div>
              <div className="arrow">↓</div>
              <div className="credit">$10</div>
              <div className="credit-suffix">Banked</div>
            </div>
            <div className="math-card">
              <div className="label">Single Order</div>
              <div className="order">$5,000</div>
              <div className="arrow">↓</div>
              <div className="credit">$25</div>
              <div className="credit-suffix">Banked</div>
            </div>
            <div className="math-card highlight">
              <span className="badge">Annual</span>
              <div className="label">$50K / Year On Menu</div>
              <div className="order">$50,000</div>
              <div className="arrow">↓</div>
              <div className="credit">$250</div>
              <div className="credit-suffix">Free Gear</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="band" id="how-it-works">
        <div className="inner">
          <span className="section-eyebrow">How It Works</span>
          <h2>Three Steps. <span className="yellow">Zero Friction.</span></h2>
          <p className="lede">
            No app to install. No code to remember. No hoops. Order, stack, cash out.
          </p>
          <div className="steps">
            <div className="step">
              <div className="num">01</div>
              <h3>Order on NJ Menu</h3>
              <p>
                Place any order at <strong style={{color: '#fff'}}>highsman.com/njmenu</strong>.
                0.5% banks automatically the moment your order ships.
              </p>
            </div>
            <div className="step">
              <div className="num">02</div>
              <h3>Stack Your Balance</h3>
              <p>
                Your credit lives in your buyer profile. Every order adds to it. Doesn&rsquo;t expire.
                See your live balance on the order confirmation page.
              </p>
            </div>
            <div className="step">
              <div className="num">03</div>
              <h3>Cash Out Anytime</h3>
              <p>
                Hit redeem on the confirmation page. We email you a Highsman gift card code.
                Use it on <strong style={{color: '#fff'}}>highsman.com/apparel</strong>. That fast.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SMART PLAY */}
      <section className="band smart-play">
        <div className="inner">
          <span className="section-eyebrow">The Smart Play</span>
          <p className="punch">
            Pros pull <span className="yellow">one big drop</span>,
            <br />
            not pocket change <span className="yellow">every order</span>.
          </p>
          <p className="body">
            Your credit doesn&rsquo;t expire. Stack it across six months of orders and grab a full kit.
            Drain $5 every order and you&rsquo;re buying a single sock. <strong>Long-game energy.</strong>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="band" id="faq">
        <div className="inner">
          <span className="section-eyebrow">FAQ</span>
          <h2>Quick Answers</h2>
          <p className="lede">
            What buyers ask before their first cash-out.
          </p>
          <div className="faq-list">
            <details>
              <summary>Does my credit expire?</summary>
              <p>
                No. Your balance sits in your buyer profile until you cash it out. Take your time.
              </p>
            </details>
            <details>
              <summary>Where do I see my balance?</summary>
              <p>
                On the order confirmation page after every NJ menu order. Shows what you just earned plus your running total.
              </p>
            </details>
            <details>
              <summary>How do I cash out?</summary>
              <p>
                One click on the confirmation page. We email a Highsman gift card code to the address tied to your buyer profile.
                Apply it at checkout on highsman.com/apparel — works on any item, sitewide.
              </p>
            </details>
            <details>
              <summary>What happens if my order is returned or cancelled?</summary>
              <p>
                Credit is clawed back automatically — same percentage, same order. You only keep credit on dollars that actually shipped.
              </p>
            </details>
            <details>
              <summary>Does this stack with promo codes like LAUNCH?</summary>
              <p>
                Yes. Credit accrues on whatever you actually paid — promo discounts apply first, then 0.5% lands on the discounted total. Stacks clean.
              </p>
            </details>
            <details>
              <summary>Can my whole team share one balance?</summary>
              <p>
                Credit ties to the buyer profile that placed the order. If your store has multiple buyers, each one banks their own.
                Talk to your Highsman rep if you want a single store-level account.
              </p>
            </details>
            <details>
              <summary>Is there a minimum to cash out?</summary>
              <p>
                No minimum. You can cash out $2 or wait until you&rsquo;re sitting on $250 — your call. Most buyers stack a few months and pull when there&rsquo;s a drop they want.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <h2>Stack Greatness. <span className="yellow">Spark Greatness.</span></h2>
        <p>Place your next NJ order. Watch the bank build.</p>
        <a className="btn btn-primary" href="/njmenu">Order on NJ Menu</a>
      </section>

      {/* Footer */}
      <footer className="brand">
        <img src={LOGO_URL} alt="Highsman" />
        <div>For NJ buyers ordering through highsman.com/njmenu</div>
        <div className="tagline">SPARK GREATNESS™</div>
      </footer>
    </div>
  );
}
