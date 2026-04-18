import type {MetaFunction} from '@shopify/remix-oxygen';
import {useState, useEffect} from 'react';
import {Link, useFetcher} from '@remix-run/react';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Budtender Championship - NJ Launch May 2026'},
    {
      name: 'description',
      content:
        'The Highsman Budtender Championship. Sell Ground Game and Triple Threat in NJ from May 7 to June 7 and win the Champions Box, Varsity Jacket, and game day tickets.',
    },
  ];
};

export const handle = {hideHeader: true};

const PRIZE_ITEMS_FIRST = [
  {label: 'All 5 Triple Threat 1.2g Pre-Roll SKUs', bold: true},
  {label: 'All 5 Ground Game 7g Flower bags', bold: true},
  {label: 'Signed Playing Card from Ricky', bold: false},
  {label: 'Custom Highsman Lighter', bold: false},
  {label: 'Custom Highsman Rolling Papers', bold: false},
  {label: 'Highsman Varsity Jacket', bold: true},
];

const PRIZE_ITEMS_SECOND = [
  'All 5 Triple Threat 1.2g Pre-Roll SKUs',
  'All 5 Ground Game 7g Flower bags',
  'Signed Playing Card from Ricky',
  'Custom Highsman Lighter',
  'Custom Highsman Rolling Papers',
];

const HOW_STEPS = [
  {
    num: '01',
    title: 'May 7 \u2013 June 7',
    body: 'Move any Highsman product at your NJ store. Every unit counts toward your ranking.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="0" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        <line x1="10" y1="14" x2="14" y2="14" /><line x1="10" y1="18" x2="14" y2="18" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Top Performers Win',
    body: 'Store managers report top sellers at close of June 7. No tracking app. No forms. Just results.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Prizes Ship',
    body: "Champions are announced. Prizes ship direct to the store. Champions don't wait.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
];

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/';

const NAV_ITEMS = [
  {label: 'Prizes', href: '#prizes'},
  {label: 'How It Works', href: '#how-it-works'},
  {label: 'Refer', href: '#referral'},
  {label: 'Contact', href: '#contact'},
];

/* --- Sticky Page Nav --- */
function StickyNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 100);
      const sections = NAV_ITEMS.map((item) => {
        const el = document.querySelector(item.href);
        if (!el) return {id: item.href, top: Infinity};
        return {id: item.href, top: el.getBoundingClientRect().top};
      });
      const current = sections.filter((s) => s.top <= 120).pop();
      setActive(current?.id || '');
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
    else if (href === '#top') window.scrollTo({top: 0, behavior: 'smooth'});
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.04)',
      }}
      aria-label="Page navigation"
    >
      <div className="max-w-6xl mx-auto px-3 md:px-16 flex items-center justify-between h-12 md:h-16">
        <a href="#top" onClick={(e) => handleNav(e, '#top')} className="hidden md:block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400" aria-label="Back to top">
          <img
            src={`${CDN}Highsman_Logo_White.png?v=1775594430`}
            alt="Highsman"
            className="h-8 transition-opacity"
            style={{opacity: scrolled ? 1 : 0.7}}
          />
        </a>
        <div className="flex items-center justify-start md:justify-end gap-0 md:gap-1 w-full md:w-auto overflow-x-auto scrollbar-hide" style={{WebkitOverflowScrolling: 'touch'}}>
          {NAV_ITEMS.map(({label, href}) => (
            <a
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className="font-label text-[9px] md:text-xs tracking-[0.06em] md:tracking-[0.18em] uppercase whitespace-nowrap flex-shrink-0 px-2 md:px-5 py-2 md:py-3 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
              style={{
                color: active === href ? '#F5E100' : 'rgba(255,255,255,0.75)',
                background: active === href ? 'rgba(245,225,0,0.1)' : 'transparent',
                border: active === href ? '1px solid rgba(245,225,0,0.2)' : '1px solid transparent',
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

/* --- Referral Form Component --- */
function ReferralForm() {
  const fetcher = useFetcher();
  const [submitted, setSubmitted] = useState(false);
  const isSubmitting = fetcher.state !== 'idle';
  const data = fetcher.data as {success?: boolean; message?: string; error?: string} | undefined;
  if (data?.success && !submitted) setSubmitted(true);
  return (
    <div className="p-8" style={{background: '#111', border: '1px solid rgba(255,255,255,0.07)'}}>
      {submitted ? (
        <div className="text-center py-8">
          <div className="font-headline text-3xl uppercase tracking-wider mb-4" style={{color: '#F5E100'}}>
            Referral Sent!
          </div>
          <p className="font-body text-base" style={{color: 'rgba(255,255,255,0.6)'}}>
            {data?.message || 'They will receive an invite to Training Camp.'}
          </p>
          <button type="button" onClick={() => setSubmitted(false)} className="mt-6 font-headline text-sm uppercase tracking-[0.18em] px-8 py-4 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400" style={{background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}}>
            Refer Another
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-5 mb-6">
            <img src={`${CDN}Highsman_Letterman-Varsity-Jacket-01_1.png?v=1775594409`} alt="Highsman Varsity Jacket" className="w-16 h-16 flex-shrink-0" style={{objectFit: 'contain', background: '#1a1a1a'}} />
            <div>
              <h4 className="font-headline text-xl uppercase tracking-wider mb-1" style={{color: '#fff'}}>Training Camp Draw</h4>
              <p className="font-body text-xs" style={{color: 'rgba(255,255,255,0.6)'}}>10 jackets. Each referral = one entry.</p>
            </div>
          </div>
          <div className="mb-5 px-4 py-3 flex items-center gap-3" style={{background: 'rgba(245,225,0,0.06)', border: '1px solid rgba(245,225,0,0.12)'}}>
            <div className="w-1 self-stretch flex-shrink-0" style={{background: '#F5E100'}} />
            <p className="font-body text-xs leading-relaxed" style={{color: 'rgba(255,255,255,0.7)'}}>
              <strong style={{color: '#F5E100'}}>No cap on entries.</strong> Every budtender you refer who completes Training Camp = another shot at a Varsity Jacket.
            </p>
          </div>
          {data?.error && (
            <div className="font-body text-sm mb-4 px-4 py-3" style={{background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.2)'}}>
              {data.error}
            </div>
          )}
          <fetcher.Form method="post" action="/api/budtender-referral" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="referrerName" className="block font-label text-[9px] tracking-[0.25em] uppercase mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>Your Name</label>
                <input id="referrerName" name="referrerName" type="text" placeholder="First and last" required className="font-body text-sm px-4 py-3 w-full outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black" style={{background: '#1a1a1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}} />
              </div>
              <div>
                <label htmlFor="referrerEmail" className="block font-label text-[9px] tracking-[0.25em] uppercase mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>Your Email</label>
                <input id="referrerEmail" name="referrerEmail" type="email" placeholder="you@store.com" required className="font-body text-sm px-4 py-3 w-full outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black" style={{background: '#1a1a1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="budtenderName" className="block font-label text-[9px] tracking-[0.25em] uppercase mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>Budtender&apos;s Name</label>
                <input id="budtenderName" name="budtenderName" type="text" placeholder="Their first and last" required className="font-body text-sm px-4 py-3 w-full outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black" style={{background: '#1a1a1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}} />
              </div>
              <div>
                <label htmlFor="budtenderEmail" className="block font-label text-[9px] tracking-[0.25em] uppercase mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>Budtender&apos;s Email</label>
                <input id="budtenderEmail" name="budtenderEmail" type="email" placeholder="them@email.com" required className="font-body text-sm px-4 py-3 w-full outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black" style={{background: '#1a1a1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)'}} />
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className="block w-full font-headline text-base uppercase tracking-[0.18em] px-10 py-5 text-center transition-opacity hover:opacity-85 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" style={{background: '#F5E100', color: '#000'}}>
              {isSubmitting ? 'Sending...' : 'Refer a Budtender'}
            </button>
          </fetcher.Form>
        </>
      )}
    </div>
  );
}

export default function Budtenders() {
  // Suppress Klaviyo popup — this is a B2B / budtender page, not consumer-facing
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-popup';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        html { scroll-behavior: smooth; }
        .bt-page { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .bt-page img { display: block; }
      `}} />
      <div className="bt-page">
      <StickyNav />

      <div id="top" />

      {/* TOP BANNER IMAGE */}
      <section className="w-full" style={{background: '#000'}}>
        <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Budtenders_Only_Banner.png?v=1775671726" alt="Highsman Budtender Championship - Budtenders Only" className="w-full h-auto block" />
      </section>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{background: '#000'}}>
        <div className="absolute inset-0" style={{background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 60%, #000 100%)'}} />
        <div className="absolute top-0 left-0 right-0 h-1" style={{background: '#F5E100'}} />
        <div className="relative z-20 px-6 md:px-16 pt-6 md:pt-7 flex items-center justify-between flex-wrap gap-3">
          <img src={`${CDN}Highsman_Logo_White.png?v=1775594430`} alt="Highsman" className="h-7 md:h-9" />
          <div className="font-label text-[9px] md:text-[10px] tracking-[0.3em] md:tracking-[0.4em] uppercase px-3 md:px-4 py-1.5 md:py-2" style={{background: '#F5E100', color: '#000'}}>NJ Launch &middot; May 7 &ndash; June 7, 2026</div>
        </div>
        <div className="absolute right-0 bottom-0 pointer-events-none select-none leading-none" aria-hidden="true" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(280px, 45vw, 580px)', lineHeight: 0.85, color: 'rgba(245,225,0,0.06)', letterSpacing: '-0.04em'}}>34</div>
        <div className="relative z-10 px-6 md:px-16 pt-12 md:pt-24 pb-16 md:pb-28 max-w-6xl">
          <div className="inline-block font-label text-[10px] tracking-[0.4em] uppercase px-3 py-1.5 mb-8" style={{background: 'rgba(245,225,0,0.15)', color: '#F5E100', border: '1px solid rgba(245,225,0,0.25)'}}>Budtender Championship &middot; NJ Only</div>
          <h1 className="font-headline uppercase tracking-tight mb-6" style={{fontSize: 'clamp(72px, 14vw, 160px)', lineHeight: 0.84, color: '#fff'}}>
            Today Is <br />
            <span style={{color: '#F5E100'}}>Game Day.</span>
          </h1>
          <a href="https://highsman.com/budtender-education" className="flex items-start gap-4 mb-10 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400" style={{background: 'rgba(245,225,0,0.08)', border: '1px solid rgba(245,225,0,0.25)', padding: '16px 20px', maxWidth: '560px', textDecoration: 'none'}}>
            <div className="flex-shrink-0 w-1 self-stretch" style={{background: '#F5E100', minHeight: '40px'}} />
            <div>
              <p className="font-label text-[9px] tracking-[0.35em] uppercase mb-1" style={{color: '#F5E100'}}>Training Camp</p>
              <p className="font-body text-sm leading-snug" style={{color: 'rgba(255,255,255,0.85)'}}>
                Still need to complete training camp?{' '}
                <strong style={{color: '#fff'}}>Click here to get your $50 store credit and become a Hall Of Flamer.</strong>
              </p>
            </div>
          </a>
          <p className="font-body text-lg md:text-xl leading-relaxed mb-10 max-w-2xl" style={{color: 'rgba(255,255,255,0.7)'}}>
            <strong style={{color: '#fff'}}>Ground Game and Triple Threat are live in NJ.</strong>{' '}
            Sell the most May 7 &ndash; June 7. Walk away with the Champions Box, the Varsity Jacket, and seats at the game.
          </p>
          <div className="flex flex-wrap gap-4">
            <a href="#prizes" className="font-headline text-base uppercase tracking-[0.18em] px-10 py-5 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" style={{background: '#F5E100', color: '#000'}}>See the Prizes</a>
            <a href="#how-it-works" className="font-headline text-base uppercase tracking-[0.18em] px-10 py-5 border transition-colors hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400" style={{borderColor: 'rgba(255,255,255,0.3)', color: '#fff'}}>How It Works</a>
          </div>
        </div>
      </section>

      {/* MANIFESTO BAND */}
      <div style={{background: '#F5E100', borderBottom: '1px solid rgba(0,0,0,0.08)'}}>
        <div className="max-w-6xl mx-auto px-8 md:px-16 py-5 flex flex-wrap items-center justify-between gap-4">
          <p className="font-headline text-sm md:text-base uppercase tracking-[0.1em]" style={{color: '#000'}}>
            Behavior beats knowledge. Speed beats perfection.{' '}
            <strong style={{letterSpacing: '0.05em'}}>Volume beats hesitation.</strong>
          </p>
          <img src={`${CDN}HM_SparkGreatness_Black.png?v=1775594430`} alt="Spark Greatness" className="h-5 opacity-60" />
        </div>
      </div>

      {/* RICKY SIGN-OFF */}
      <section style={{background: '#000', borderBottom: '3px solid #F5E100'}}>
        <div className="max-w-6xl mx-auto px-8 md:px-16 py-20 md:py-24 md:grid md:grid-cols-[auto_1fr] md:gap-16 items-center">
          <img src={IMAGES.rickyWilliams} alt="Ricky Williams - Highsman Co-Founder" className="w-24 h-24 md:w-36 md:h-36 object-cover mb-10 md:mb-0 flex-shrink-0" style={{objectFit: 'cover', filter: 'grayscale(15%)'}} />
          <div>
            <blockquote className="font-headline uppercase tracking-tight mb-6" style={{fontSize: 'clamp(28px,4.5vw,56px)', lineHeight: 1.0, color: '#fff'}}>
              {'\u201C'}Let&apos;s have a legendary launch.{' '}
              <span style={{color: '#F5E100'}}>You&apos;re the reason this works</span>{' '}
              &mdash; and we don&apos;t take that lightly.{'\u201D'}
            </blockquote>
            <p className="font-label text-[10px] tracking-[0.28em] uppercase" style={{color: 'rgba(255,255,255,0.6)'}}>
              <strong style={{color: '#fff', letterSpacing: '0.08em'}}>Ricky Williams</strong>{' '}
              &mdash; Co-Founder, Highsman &middot; #34 &middot; The Highsman
            </p>
          </div>
        </div>
      </section>

      {/* PRIZES - 3 Column Layout */}
      <section id="prizes" style={{background: '#0a0a0a'}}>
        <div className="max-w-6xl mx-auto px-8 md:px-16 pt-24 pb-6">
          <div className="flex items-end justify-between mb-14 flex-wrap gap-4">
            <div>
              <p className="font-label text-[10px] tracking-[0.4em] uppercase mb-4" style={{color: 'rgba(255,255,255,0.6)'}}>Top 3 Performers Win</p>
              <h2 className="font-headline uppercase tracking-tight" style={{fontSize: 'clamp(60px,10vw,108px)', lineHeight: 0.86, color: '#fff'}}>The Prizes</h2>
            </div>
            <span className="font-label text-[10px] tracking-[0.3em] uppercase" style={{color: 'rgba(255,255,255,0.65)'}}>May 7 &ndash; June 7 &middot; NJ</span>
          </div>
        </div>
        {/* 3-Column Prize Cards */}
        <div className="max-w-6xl mx-auto px-8 md:px-16 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3" style={{gap: '1px', background: 'rgba(255,255,255,0.06)'}}>
            {/* 1ST PLACE */}
            <div className="relative overflow-hidden p-8 md:p-10" style={{background: '#0a0a0a', borderTop: '3px solid #F5E100'}}>
              <div className="absolute right-3 top-1 font-headline leading-none pointer-events-none select-none" aria-hidden="true" style={{fontSize: '120px', color: 'rgba(245,225,0,0.05)'}}>01</div>
              <div className="relative z-10">
                <div className="inline-block font-label text-[10px] tracking-[0.4em] uppercase px-3 py-1.5 mb-6" style={{background: '#F5E100', color: '#000'}}>First Place</div>
                <h3 className="font-headline uppercase tracking-tight mb-2 text-white" style={{fontSize: 'clamp(30px,3.5vw,44px)', lineHeight: 0.88}}>
                  <span style={{color: '#F5E100'}}>Champions Box</span>
                </h3>
                <h3 className="font-headline uppercase tracking-tight mb-6 text-white" style={{fontSize: 'clamp(30px,3.5vw,44px)', lineHeight: 0.88}}>
                  + Varsity Jacket
                </h3>
                <div className="overflow-hidden mb-4" style={{background: '#111', border: '1px solid rgba(245,225,0,0.15)'}}>
                  <img src={`${CDN}Champions_Box_Highsman_Comp_2.png?v=1776305321`} alt="Highsman Champions Box" className="w-full" style={{maxHeight: '200px', objectFit: 'contain', padding: '12px'}} />
                </div>
                <div className="overflow-hidden mb-6" style={{background: '#111', border: '1px solid rgba(245,225,0,0.1)'}}>
                  <img src={`${CDN}Highsman_Letterman-Varsity-Jacket-01_1.png?v=1775594409`} alt="Highsman Varsity Jacket" className="w-full" style={{maxHeight: '160px', objectFit: 'contain', padding: '12px'}} />
                </div>
                <ul className="space-y-2.5">
                  {PRIZE_ITEMS_FIRST.map(({label, bold}) => (
                    <li key={label} className="flex items-center gap-3 font-body text-sm" style={{color: bold ? '#fff' : 'rgba(255,255,255,0.45)'}}>
                      <span className="flex-shrink-0 w-1.5 h-1.5" style={{background: bold ? '#F5E100' : 'rgba(255,255,255,0.2)'}} />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {/* 2ND PLACE */}
            <div className="relative overflow-hidden p-8 md:p-10" style={{background: '#0a0a0a', borderTop: '3px solid #C0C0C0'}}>
              <div className="absolute right-3 top-1 font-headline leading-none pointer-events-none select-none" aria-hidden="true" style={{fontSize: '120px', color: 'rgba(192,192,192,0.05)'}}>02</div>
              <div className="relative z-10">
                <div className="inline-block font-label text-[10px] tracking-[0.4em] uppercase px-3 py-1.5 mb-6" style={{background: '#C0C0C0', color: '#000'}}>Second Place</div>
                <h3 className="font-headline uppercase tracking-tight mb-6 text-white" style={{fontSize: 'clamp(30px,3.5vw,44px)', lineHeight: 0.88}}>Champions Box</h3>
                <div className="overflow-hidden mb-6" style={{background: '#111', border: '1px solid rgba(192,192,192,0.1)'}}>
                  <img src={`${CDN}Champions_Box_Highsman_Comp_2.png?v=1776305321`} alt="Champions Box" className="w-full" style={{maxHeight: '200px', objectFit: 'contain', padding: '12px'}} />
                </div>
                <ul className="space-y-2.5">
                  {PRIZE_ITEMS_SECOND.map((item) => (
                    <li key={item} className="flex items-center gap-3 font-body text-sm" style={{color: 'rgba(255,255,255,0.65)'}}>
                      <span className="flex-shrink-0 w-1 h-1" style={{background: 'rgba(192,192,192,0.4)'}} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {/* 3RD PLACE */}
            <div className="relative overflow-hidden p-8 md:p-10" style={{background: '#0a0a0a', borderTop: '3px solid #CD7F32'}}>
              <div className="absolute right-3 top-1 font-headline leading-none pointer-events-none select-none" aria-hidden="true" style={{fontSize: '120px', color: 'rgba(205,127,50,0.05)'}}>03</div>
              <div className="relative z-10">
                <div className="inline-block font-label text-[10px] tracking-[0.4em] uppercase px-3 py-1.5 mb-6" style={{background: '#CD7F32', color: '#000'}}>Third Place</div>
                <h3 className="font-headline uppercase tracking-tight mb-6 text-white" style={{fontSize: 'clamp(30px,3.5vw,44px)', lineHeight: 0.88}}>Varsity Jacket</h3>
                <div className="overflow-hidden mb-6" style={{background: '#111', border: '1px solid rgba(205,127,50,0.1)'}}>
                  <img src={`${CDN}Highsman_Letterman-Varsity-Jacket-01_1.png?v=1775594409`} alt="Highsman Varsity Jacket" className="w-full" style={{maxHeight: '200px', objectFit: 'contain', padding: '16px'}} />
                </div>
                <ul className="space-y-2.5">
                  {['Custom Highsman Letterman Jacket', 'Wear the brand on the floor.'].map((item) => (
                    <li key={item} className="flex items-center gap-3 font-body text-sm" style={{color: 'rgba(255,255,255,0.65)'}}>
                      <span className="flex-shrink-0 w-1 h-1" style={{background: 'rgba(205,127,50,0.5)'}} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GAME DAY TICKETS */}
      <section style={{background: '#F5E100'}}>
        <div className="max-w-6xl mx-auto">
          <div className="md:grid md:grid-cols-2">
            <div className="px-8 md:px-16 py-20 md:py-24 flex flex-col justify-center" style={{borderRight: '1px solid rgba(0,0,0,0.1)'}}>
              <div className="inline-block font-label text-[10px] tracking-[0.4em] uppercase px-3 py-1.5 mb-8 self-start" style={{background: '#000', color: '#F5E100'}}>Bonus Prize &middot; 5 Chances to Win</div>
              <h2 className="font-headline uppercase tracking-tight mb-8" style={{fontSize: 'clamp(60px,9vw,112px)', lineHeight: 0.82, color: '#000'}}>Win <br />Game Day <br />Tickets</h2>
              <p className="font-body text-lg leading-relaxed mb-10 max-w-sm" style={{color: 'rgba(0,0,0,0.65)'}}>
                <strong style={{color: '#000'}}>5 Champions Boxes include two tickets</strong>{' '}to an Eagles or Giants game &mdash; with the Highsman team. Game day with us. On us.
              </p>
              <div className="flex flex-col gap-3 pt-6" style={{borderTop: '1px solid rgba(0,0,0,0.12)'}}>
                {['Philadelphia Eagles', 'New York Giants'].map((team) => (
                  <span key={team} className="flex items-center gap-3 font-headline text-xs uppercase tracking-[0.22em]" style={{color: 'rgba(0,0,0,0.55)'}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{opacity: 0.6}}>
                      <ellipse cx="12" cy="12" rx="11" ry="7" transform="rotate(-30 12 12)" />
                      <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1" style={{opacity: 0.3}} />
                    </svg>
                    {team}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-center relative overflow-hidden" style={{background: '#000', minHeight: '440px'}}>
              <div className="flex items-center gap-4 px-10 pt-8">
                <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.15)'}} />
                <span className="font-label text-[9px] tracking-[0.3em] uppercase" style={{color: 'rgba(245,225,0,0.6)'}}>Game Day &middot; 2026</span>
                <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.15)'}} />
              </div>
              <img src={`${CDN}Budtenders_Prize_Image_football_giveaway_9028f72e-b1c6-4cdb-a8b3-556663907532.png?v=1775599444`} alt="Football game day tickets with Highsman" className="w-full" style={{maxHeight: '400px', objectFit: 'contain', padding: '24px 32px'}} />
              <div className="flex items-center gap-4 px-10 pb-8">
                <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.15)'}} />
                <span className="font-label text-[9px] tracking-[0.3em] uppercase" style={{color: 'rgba(245,225,0,0.6)'}}>Highsman &middot; NJ</span>
                <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.15)'}} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{background: '#fff'}}>
        <div className="max-w-6xl mx-auto px-8 md:px-16 py-24">
          <div className="md:grid md:grid-cols-[260px_1fr] md:gap-20 items-start">
            <div className="mb-16 md:mb-0 md:sticky md:top-24">
              <p className="font-label text-[10px] tracking-[0.4em] uppercase mb-4" style={{color: 'rgba(0,0,0,0.55)'}}>No tracking. No app.</p>
              <h2 className="font-headline uppercase tracking-tight" style={{fontSize: 'clamp(48px,7vw,80px)', lineHeight: 0.86, color: '#000'}}>How It <br />Works</h2>
            </div>
            <div>
              {HOW_STEPS.map(({num, title, body, icon}, i) => (
                <div key={num} className="flex items-start gap-6 md:gap-8 py-10" style={{borderTop: '1px solid rgba(0,0,0,0.1)', borderBottom: i === HOW_STEPS.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'}}>
                  <div className="flex-shrink-0 flex flex-col items-center gap-3 pt-1">
                    <div className="flex items-center justify-center w-12 h-12" style={{background: '#000', color: '#F5E100'}}>
                      {icon}
                    </div>
                    <span className="font-headline leading-none" style={{fontSize: '20px', color: 'rgba(0,0,0,0.12)'}}>{num}</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-2xl md:text-3xl uppercase tracking-wider mb-3" style={{color: '#000'}}>{title}</h3>
                    <p className="font-body text-base leading-relaxed" style={{color: 'rgba(0,0,0,0.55)'}}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* REFERRAL */}
      <section id="referral" style={{background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.05)'}}>
        <div className="max-w-6xl mx-auto px-8 md:px-16 py-24 md:grid md:grid-cols-2 md:gap-20 items-center">
          <div>
            <p className="font-label text-[10px] tracking-[0.4em] uppercase mb-5" style={{color: 'rgba(255,255,255,0.6)'}}>Know a budtender?</p>
            <h2 className="font-headline uppercase tracking-tight mb-6" style={{fontSize: 'clamp(44px,7vw,76px)', lineHeight: 0.87, color: '#fff'}}>Refer Them. <br /><span style={{color: '#F5E100'}}>Win a Jacket.</span></h2>
            <p className="font-body text-base leading-relaxed max-w-md" style={{color: 'rgba(255,255,255,0.65)'}}>
              Know a budtender who should be repping Highsman? Refer them to the{' '}
              <strong style={{color: '#fff'}}>Highsman Budtender Education Training Camp</strong>
              {'. '}Every budtender you refer who completes the Training Camp enters you into a draw to win one of{' '}
              <strong style={{color: '#fff'}}>10 Highsman Varsity Jackets</strong>. No cap on entries.
            </p>
          </div>
          <div className="mt-10 md:mt-0"><ReferralForm /></div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{background: '#F5E100'}}>
        <div className="max-w-4xl mx-auto px-8 md:px-16 py-20 text-center">
          <h2 className="font-headline uppercase tracking-tight mb-5" style={{fontSize: 'clamp(44px,8vw,80px)', lineHeight: 0.86, color: '#000'}}>Questions? <br />We&apos;re Here.</h2>
          <p className="font-body text-base mb-10" style={{color: 'rgba(0,0,0,0.6)'}}>
            Reach the Highsman team at{' '}
            <a href="mailto:budtenders@highsman.com" className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" style={{color: '#000'}}>budtenders@highsman.com</a>
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="mailto:budtenders@highsman.com" className="font-headline text-base uppercase tracking-[0.18em] px-10 py-5 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400" style={{background: '#000', color: '#F5E100'}}>Email the Team</a>
            <Link to="/#store-locator" className="font-headline text-base uppercase tracking-[0.18em] px-10 py-5 border transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" style={{borderColor: 'rgba(0,0,0,0.25)', color: '#000'}}>Find Your Store</Link>
          </div>
        </div>
      </section>

      {/* FOOTER MARK */}
      <div style={{background: '#000', borderTop: '1px solid rgba(255,255,255,0.06)'}}>
        <div className="max-w-6xl mx-auto px-8 md:px-16 py-10 flex items-center justify-between flex-wrap gap-4">
          <img src={`${CDN}Spark_Greatness_White.png?v=1775594430`} alt="Spark Greatness" className="h-5 opacity-60" />
          <p className="font-label text-[10px] tracking-[0.2em] uppercase" style={{color: 'rgba(255,255,255,0.65)'}}>&copy; 2026 Highsman. All rights reserved.</p>
        </div>
      </div>
      </div>
    </>
  );
}

