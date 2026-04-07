import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Budtender Championship — NJ Launch May 2026'},
    {
      name: 'description',
      content:
        'The Highsman Budtender Championship. Sell Ground Game and Triple Threat in NJ from May 7 – June 7 and win the Champions Box, Varsity Jacket, and game day tickets.',
    },
  ];
};

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
    title: 'May 7 – June 7',
    body: 'Move Ground Game and Triple Threat at your NJ store throughout the competition window. Every unit counts toward your ranking.',
  },
  {
    num: '02',
    title: 'Managers Report',
    body: 'At the end of June 7th, store managers report top performers directly to the Highsman team. No tracking app. No forms.',
  },
  {
    num: '03',
    title: 'Prizes Ship',
    body: "Winners are announced and prizes ship directly to the store. Champions don't wait long.",
  },
];

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/';

export default function Budtenders() {
  return (
    <>
      {/* HERO */}
      <section className="bg-surface-container-lowest min-h-[80vh] flex flex-col justify-end pb-20 pt-36 px-6 md:px-16 relative overflow-hidden border-b border-outline-variant/20">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
        <div className="relative z-10 max-w-5xl">
          <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-6">
            NJ Launch &middot; May 7 – June 7, 2026 &middot; Budtender Championship
          </p>
          <h1 className="font-headline text-[clamp(80px,14vw,148px)] leading-[0.82] uppercase tracking-tight text-on-surface mb-8">
            Today Is<br />
            <span className="text-primary">Game Day.</span>
          </h1>
          <p className="font-body text-xl md:text-2xl text-on-surface-variant max-w-2xl leading-relaxed mb-10">
            <strong className="text-on-surface font-semibold">Ground Game and Triple Threat are live in New Jersey.</strong>{' '}
            The floor is yours. We&apos;re rewarding everyone who performs.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="bg-primary px-5 py-2.5 font-headline text-sm uppercase tracking-[0.12em] text-on-primary">
              May 7 – June 7 &middot; NJ Only
            </span>
            <span className="bg-surface-container border border-outline-variant/30 px-5 py-2.5 font-headline text-sm uppercase tracking-[0.12em] text-on-surface">
              Ground Game — 7g Flower
            </span>
            <span className="bg-surface-container border border-outline-variant/30 px-5 py-2.5 font-headline text-sm uppercase tracking-[0.12em] text-on-surface">
              Triple Threat — 1.2g Pre-Rolls
            </span>
          </div>
        </div>
      </section>

      {/* INTRO BAND */}
      <div className="bg-surface-container py-10 px-6 md:px-16 border-b border-outline-variant/20">
        <p className="font-body text-lg text-on-surface-variant max-w-4xl leading-relaxed">
          We&apos;re running the{' '}
          <strong className="text-on-surface font-semibold">Highsman Budtender Championship</strong>{' '}
          across every NJ store from{' '}
          <strong className="text-on-surface font-semibold">May 7th through June 7th</strong>. Sell the most. Walk away with something{' '}
          <strong className="text-on-surface font-semibold">built for champions</strong>.
        </p>
      </div>

      {/* PRIZES */}
      <section className="bg-surface-container-lowest py-24 px-6 md:px-16">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-3">Top 3 Performers Win</p>
            <h2 className="font-headline text-[clamp(56px,9vw,96px)] leading-[0.86] uppercase tracking-tight text-on-surface">The Prizes</h2>
          </div>

          {/* 1st Prize */}
          <div className="relative overflow-hidden mb-4 bg-surface-container" style={{borderTop: '3px solid #F5E100'}}>
            <div className="absolute right-0 top-0 bottom-0 items-center pr-8 pointer-events-none select-none hidden md:flex" aria-hidden="true">
              <span className="font-headline leading-none uppercase" style={{fontSize: '28vw', color: 'rgba(255,255,255,0.03)', lineHeight: 1}}>01</span>
            </div>
            <div className="relative z-10 p-8 md:p-12 md:grid md:grid-cols-[1fr_420px] md:gap-0">
              <div className="md:pr-12 md:border-r md:border-outline-variant/20">
                <span className="inline-block font-label text-[10px] tracking-[0.36em] uppercase px-3 py-1.5 mb-8" style={{background: '#F5E100', color: '#000'}}>First Place</span>
                <h3 className="font-headline text-[clamp(40px,6vw,68px)] uppercase leading-[0.88] mb-10" style={{color: '#F5E100'}}>
                  Champions Box<br />
                  <span className="text-on-surface">+ Varsity Jacket</span>
                </h3>
                <ul className="space-y-4 mb-8">
                  {PRIZE_ITEMS_FIRST.map(({label, bold}) => (
                    <li key={label} className="flex items-start gap-3 font-body text-base">
                      <span className="flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center border" style={{borderColor: '#F5E100'}}>
                        <span className="block w-1.5 h-1.5" style={{background: '#F5E100'}} />
                      </span>
                      <span className={bold ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0 md:pl-12 flex flex-col gap-6 justify-center">
                <div className="bg-surface-container-lowest border border-outline-variant/20 overflow-hidden">
                  <div className="px-3 pt-3"><span className="font-label text-[9px] tracking-[0.3em] uppercase text-on-surface-variant">Champions Box</span></div>
                  <img src={`${CDN}Game_Day_Prize_Pic.svg?v=1775597075`} alt="Highsman Champions Box" className="w-full" style={{maxHeight: '340px', objectFit: 'contain', padding: '12px'}} />
                </div>
                <div className="bg-surface-container-lowest border border-outline-variant/20 overflow-hidden">
                  <div className="px-3 pt-3"><span className="font-label text-[9px] tracking-[0.3em] uppercase text-on-surface-variant">Varsity Jacket</span></div>
                  <img src={IMAGES.varsityJacket} alt="Highsman Varsity Jacket" className="w-full" style={{maxHeight: '200px', objectFit: 'contain', padding: '8px'}} />
                </div>
              </div>
            </div>
          </div>

          {/* 2nd & 3rd */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-container border-t-2 border-t-[#C0C0C0]">
              <div className="p-8">
                <span className="inline-block font-label text-[10px] tracking-[0.36em] uppercase px-3 py-1.5 mb-6" style={{background: '#C0C0C0', color: '#000'}}>Second Place</span>
                <h3 className="font-headline text-[clamp(30px,4vw,44px)] uppercase leading-[0.9] text-on-surface mb-6">Champions Box</h3>
                <div className="border border-outline-variant/20 bg-surface-container-lowest mb-6">
                  <img src={`${CDN}Game_Day_Prize_Pic.svg?v=1775597075`} alt="Champions Box" className="w-full" style={{maxHeight: '260px', objectFit: 'contain', padding: '12px'}} />
                </div>
                <ul className="space-y-2.5">
                  {PRIZE_ITEMS_SECOND.map((item) => (
                    <li key={item} className="flex items-start gap-3 font-body text-sm text-on-surface-variant">
                      <span className="flex-shrink-0 w-3.5 h-3.5 mt-0.5 flex items-center justify-center border border-on-surface-variant/30"><span className="block w-1 h-1 bg-on-surface-variant/40" /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-surface-container" style={{borderTop: '2px solid #CD7F32'}}>
              <div className="p-8">
                <span className="inline-block font-label text-[10px] tracking-[0.36em] uppercase px-3 py-1.5 mb-6" style={{background: '#CD7F32', color: '#000'}}>Third Place</span>
                <h3 className="font-headline text-[clamp(30px,4vw,44px)] uppercase leading-[0.9] text-on-surface mb-6">Varsity Jacket</h3>
                <div className="border border-outline-variant/20 bg-surface-container-lowest mb-6">
                  <img src={IMAGES.varsityJacket} alt="Highsman Varsity Jacket" className="w-full" style={{maxHeight: '200px', objectFit: 'contain', padding: '8px'}} />
                </div>
                <ul className="space-y-2.5">
                  {['Custom Highsman Letterman Jacket', 'Wear the brand on the floor'].map((item) => (
                    <li key={item} className="flex items-start gap-3 font-body text-sm text-on-surface-variant">
                      <span className="flex-shrink-0 w-3.5 h-3.5 mt-0.5 flex items-center justify-center border border-on-surface-variant/30"><span className="block w-1 h-1 bg-on-surface-variant/40" /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GAME DAY BONUS */}
      <section style={{background: '#F5E100'}}>
        <div className="max-w-6xl mx-auto">
          <div className="md:grid md:grid-cols-2">
            <div className="px-8 md:px-16 py-20 flex flex-col justify-center">
              <p className="font-label text-[10px] tracking-[0.36em] uppercase mb-6" style={{color: 'rgba(0,0,0,0.45)'}}>Bonus Prize &middot; 5 Chances to Win</p>
              <h2 className="font-headline text-[clamp(52px,8vw,96px)] uppercase leading-[0.84] tracking-tight mb-8" style={{color: '#000'}}>
                Win<br />Game Day<br />Tickets
              </h2>
              <p className="font-body text-base leading-relaxed mb-8" style={{color: 'rgba(0,0,0,0.7)', maxWidth: '400px'}}>
                <strong style={{color: '#000'}}>5 Champions Boxes include tickets for two</strong>{' '}
                to an Eagles or Giants game with the Highsman team. Game day with us — on us.
              </p>
              <div className="flex flex-col gap-3 mb-10">
                <div className="flex items-center gap-3">
                  <span className="font-headline text-2xl">🏈</span>
                  <span className="font-headline text-sm uppercase tracking-widest" style={{color: '#000'}}>Philadelphia Eagles</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-headline text-2xl">🏈</span>
                  <span className="font-headline text-sm uppercase tracking-widest" style={{color: '#000'}}>New York Giants</span>
                </div>
              </div>
              <span className="inline-block font-headline text-xs uppercase tracking-[0.22em] px-5 py-3 self-start" style={{background: '#000', color: '#F5E100'}}>Competition May 7 – June 7</span>
            </div>
            <div className="flex items-stretch" style={{background: '#000'}}>
              <div className="w-full p-8 md:p-10 flex flex-col justify-center">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.3)'}} />
                  <span className="font-label text-[9px] tracking-[0.3em] uppercase" style={{color: 'rgba(245,225,0,0.5)'}}>Game Day &middot; 2026</span>
                  <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.3)'}} />
                </div>
                <img src={`${CDN}Budtenders_Prize_Image_football_giveaway_9028f72e-b1c6-4cdb-a8b3-556663907532.png?v=1775599444`} alt="Football game day tickets — Eagles and Giants" className="w-full" style={{maxHeight: '360px', objectFit: 'contain'}} />
                <div className="flex items-center gap-4 mt-6">
                  <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.3)'}} />
                  <span className="font-label text-[9px] tracking-[0.3em] uppercase" style={{color: 'rgba(245,225,0,0.5)'}}>Highsman &middot; NJ</span>
                  <div className="h-px flex-1" style={{background: 'rgba(245,225,0,0.3)'}} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-surface-container py-24 px-6 md:px-16 border-t border-b border-outline-variant/20">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-3">No tracking. No app.</p>
            <h2 className="font-headline text-[clamp(52px,9vw,88px)] leading-[0.88] uppercase tracking-tight text-on-surface">How It Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-outline-variant/20">
            {HOW_STEPS.map(({num, title, body}, i) => (
              <div key={num} className={`p-10 ${i < 2 ? 'md:border-r border-b md:border-b-0 border-outline-variant/20' : ''}`}>
                <div className="font-headline leading-none mb-6" style={{fontSize: '72px', color: 'rgba(255,255,255,0.07)'}}>{num}</div>
                <h3 className="font-headline text-2xl uppercase tracking-wider text-on-surface mb-4">{title}</h3>
                <p className="font-body text-sm text-on-surface-variant leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REFERRAL */}
      <section className="bg-surface-container-lowest py-24 px-6 md:px-16">
        <div className="max-w-6xl mx-auto md:grid md:grid-cols-2 md:gap-16 items-center">
          <div>
            <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-4">Know a Great Budtender?</p>
            <h2 className="font-headline text-[clamp(44px,7vw,76px)] leading-[0.88] uppercase tracking-tight text-on-surface mb-6">
              Refer Them.<br /><span className="text-primary">Win a Jacket.</span>
            </h2>
            <p className="font-body text-base text-on-surface-variant leading-relaxed max-w-md">
              Every budtender you refer earns you{' '}
              <strong className="text-on-surface font-semibold">one entry into our monthly draw</strong>. One winner every month takes home a Varsity Jacket.
            </p>
          </div>
          <div className="mt-10 md:mt-0">
            <div className="border border-outline-variant/30 bg-surface-container p-8">
              <div className="flex items-start gap-4 mb-8">
                <img src={IMAGES.varsityJacket} alt="Highsman Varsity Jacket" className="w-20 h-20 flex-shrink-0" style={{objectFit: 'contain', background: '#111'}} />
                <div>
                  <h4 className="font-headline text-2xl uppercase tracking-wider text-on-surface mb-1">Monthly Jacket Draw</h4>
                  <p className="font-body text-sm text-on-surface-variant">Each referral = one entry. No cap.</p>
                </div>
              </div>
              <a href="mailto:budtenders@highsman.com?subject=Referral" className="block w-full bg-primary text-on-primary font-headline text-base uppercase tracking-widest px-8 py-4 hover:opacity-90 transition-opacity text-center">
                Refer a Budtender
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* RICKY SIGN-OFF */}
      <section style={{background: '#000'}}>
        <div className="max-w-6xl mx-auto px-6 md:px-16 py-20">
          <div className="md:grid md:grid-cols-[auto_1fr] md:gap-14 items-center">
            <img src={IMAGES.rickyWilliams} alt="Ricky Williams — Highsman Co-Founder" className="w-28 h-28 object-cover mb-8 md:mb-0 flex-shrink-0" />
            <div>
              <blockquote className="font-headline text-[clamp(24px,3.8vw,44px)] uppercase leading-[1.05] tracking-tight mb-6" style={{color: '#fff'}}>
                &ldquo;Let&apos;s have a legendary launch.{' '}
                <span style={{color: '#F5E100'}}>You&apos;re the reason this works</span>{' '}
                — and we don&apos;t take that lightly.&rdquo;
              </blockquote>
              <p className="font-label text-xs tracking-[0.22em] uppercase" style={{color: 'rgba(255,255,255,0.45)'}}>
                <strong style={{color: '#fff'}}>Ricky Williams</strong> — Highsman Co-Founder
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="bg-surface-container py-20 px-6 md:px-16 border-t border-outline-variant/20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-headline text-[clamp(36px,6vw,58px)] uppercase leading-[0.9] tracking-tight text-on-surface mb-4">
            Questions?<br /><span className="text-primary">We&apos;re Here.</span>
          </h2>
          <p className="font-body text-base text-on-surface-variant mb-10">
            Reach the Highsman team at{' '}
            <a href="mailto:budtenders@highsman.com" className="text-primary hover:underline font-semibold">budtenders@highsman.com</a>
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="mailto:budtenders@highsman.com" className="bg-primary text-on-primary font-headline text-base uppercase tracking-widest px-8 py-4 hover:opacity-90 transition-opacity">Email the Team</a>
            <Link to="/#store-locator" className="border border-outline-variant/50 text-on-surface font-headline text-base uppercase tracking-widest px-8 py-4 hover:bg-surface-container-highest transition-colors">Find Your Store</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <div className="bg-surface-container-lowest py-12 px-6 text-center border-t border-outline-variant/20">
        <img src={IMAGES.sparkGreatnessLogoWhite} alt="Spark Greatness™" className="h-7 mx-auto mb-3 opacity-60" />
        <p className="font-label text-xs tracking-[0.2em] uppercase text-on-surface-variant">© 2026 Highsman. All rights reserved.</p>
      </div>
    </>
  );
}
