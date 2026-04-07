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

export default function Budtenders() {
  return (
    <>
      {/* HERO */}
      <section className="bg-surface-container-lowest min-h-[75vh] flex flex-col justify-end pb-20 pt-36 px-6 md:px-16 relative overflow-hidden border-b border-outline-variant/20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-container-lowest pointer-events-none z-0" />
        <div className="relative z-10 max-w-5xl">
          <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-8">
            NJ Launch &middot; May 7 – June 7, 2026 &middot; Budtender Championship
          </p>
          <h1 className="font-headline text-[clamp(72px,13vw,136px)] leading-[0.86] uppercase tracking-tight text-on-surface mb-8">
            Today Is
            <br />
            <span className="text-primary">Game Day.</span>
          </h1>
          <p className="font-body text-lg md:text-xl text-on-surface-variant max-w-2xl leading-relaxed mb-12">
            <strong className="text-on-surface font-semibold">
              Ground Game and Triple Threat are live in New Jersey.
            </strong>{' '}
            You&apos;ve been briefed. You know the science. Now it&apos;s time
            to put that knowledge to work on the floor — and we&apos;re going
            to reward you for it.
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="bg-surface-container border border-outline-variant/30 px-5 py-2.5 font-headline text-sm uppercase tracking-[0.12em] text-on-surface">
              Ground Game — 7g Flower
            </span>
            <span className="bg-primary px-5 py-2.5 font-headline text-sm uppercase tracking-[0.12em] text-on-primary">
              Triple Threat — 1.2g Pre-Rolls
            </span>
            <span className="bg-surface-container border border-outline-variant/30 px-5 py-2.5 font-headline text-sm uppercase tracking-[0.12em] text-on-surface">
              May 7 – June 7 &middot; NJ Only
            </span>
          </div>
        </div>
      </section>

      {/* INTRO BAND */}
      <div className="bg-surface-container py-10 px-6 md:px-16 border-b border-outline-variant/20">
        <p className="font-body text-lg text-on-surface-variant max-w-4xl leading-relaxed">
          We&apos;re running the{' '}
          <strong className="text-on-surface font-semibold">
            Highsman Budtender Championship
          </strong>{' '}
          across every NJ store carrying Ground Game and Triple Threat from{' '}
          <strong className="text-on-surface font-semibold">
            May 7th through June 7th
          </strong>
          . The budtenders who sell the most walk away with something{' '}
          <strong className="text-on-surface font-semibold">
            built for champions
          </strong>
          .
        </p>
      </div>

      {/* PRIZES */}
      <section className="bg-surface-container-lowest py-24 px-6 md:px-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16">
            <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-3">
              The Highsman Budtender Championship
            </p>
            <h2 className="font-headline text-[clamp(52px,9vw,88px)] leading-[0.88] uppercase tracking-tight text-on-surface">
              The Prizes
            </h2>
            <div className="w-12 h-0.5 bg-primary mt-6 mb-5" />
            <p className="font-body text-base text-on-surface-variant max-w-lg">
              Sell Ground Game and Triple Threat from May 7th through June 7th.
              The top three performers in NJ take home the following.
            </p>
          </div>

          {/* 1st Prize */}
          <div className="border border-primary/50 bg-surface-container relative overflow-hidden mb-4">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
            <div className="p-8 md:p-12">
              <div className="flex items-center gap-4 mb-8">
                <span className="text-3xl leading-none">🏆</span>
                <span className="font-label text-xs tracking-[0.28em] uppercase" style={{color: '#F5E100'}}>
                  First Prize
                </span>
              </div>
              <div className="md:grid md:grid-cols-[1fr_auto] md:gap-16 items-start">
                <div>
                  <h3 className="font-headline text-[clamp(32px,5vw,54px)] uppercase leading-[0.92] mb-8" style={{color: '#F5E100'}}>
                    Champions Box
                    <br />+ Varsity Jacket
                  </h3>
                  <ul className="space-y-3.5">
                    {PRIZE_ITEMS_FIRST.map(({label, bold}) => (
                      <li key={label} className="flex items-start gap-3 font-body text-base">
                        <span className="text-[10px] mt-1.5 flex-shrink-0" style={{color: '#F5E100'}}>✶</span>
                        <span className={bold ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}>{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-8 md:mt-0 md:w-56 flex-shrink-0">
                  <img src={IMAGES.varsityJacket} alt="Highsman Varsity Jacket" className="w-full object-cover" />
                </div>
              </div>
            </div>
          </div>

          {/* 2nd & 3rd Prize */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-outline-variant/30 bg-surface-container p-8">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl leading-none">🥈</span>
                <span className="font-label text-xs tracking-[0.28em] uppercase" style={{color: '#C0C0C0'}}>Second Prize</span>
              </div>
              <h3 className="font-headline text-[clamp(28px,4vw,40px)] uppercase leading-[0.92] text-on-surface mb-8">Champions Box</h3>
              <ul className="space-y-3">
                {PRIZE_ITEMS_SECOND.map((item) => (
                  <li key={item} className="flex items-start gap-3 font-body text-sm text-on-surface-variant">
                    <span className="text-primary text-[10px] mt-1 flex-shrink-0">✶</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-outline-variant/30 bg-surface-container p-8">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl leading-none">🥉</span>
                <span className="font-label text-xs tracking-[0.28em] uppercase" style={{color: '#CD7F32'}}>Third Prize</span>
              </div>
              <h3 className="font-headline text-[clamp(28px,4vw,40px)] uppercase leading-[0.92] text-on-surface mb-8">Varsity Jacket</h3>
              <ul className="space-y-3 mb-8">
                {['Custom Highsman Letterman Jacket', 'Wear the brand on the floor'].map((item) => (
                  <li key={item} className="flex items-start gap-3 font-body text-sm text-on-surface-variant">
                    <span className="text-primary text-[10px] mt-1 flex-shrink-0">✶</span>
                    {item}
                  </li>
                ))}
              </ul>
              <img src={IMAGES.varsityJacket} alt="Highsman Varsity Jacket" className="w-48 object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* PRIZE IMAGE SHOWCASE */}
      <div className="bg-surface-container-low border-t border-b border-outline-variant/20">
        <img
          src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Game_Day_Prize_Pic.svg?v=1775597075"
          alt="The Highsman Champions Box"
          className="w-full max-w-4xl mx-auto block"
        />
        <p className="text-center py-4 font-label text-xs tracking-[0.22em] uppercase text-on-surface-variant">
          The Champions Box — Everything Inside the Prize
        </p>
      </div>

      {/* GAME DAY BONUS */}
      <section className="py-24 px-6 md:px-16" style={{background: '#F5E100'}}>
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-label text-xs tracking-[0.32em] uppercase mb-4" style={{color: 'rgba(0,0,0,0.5)'}}>
            Bonus · Game Day Boxes · 5 Chances to Win
          </p>
          <h2 className="font-headline text-[clamp(52px,10vw,104px)] leading-[0.86] uppercase tracking-tight mb-10" style={{color: '#000000'}}>
            Win A Trip For 2<br />To A Giants Or<br />Eagles Game
          </h2>
          <div className="mb-10 overflow-hidden" style={{maxHeight: '380px'}}>
            <img
              src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Game_Day_Prize_Pic.svg?v=1775597075"
              alt="Win a trip for 2 to a Giants or Eagles game"
              className="w-full max-w-2xl mx-auto object-cover object-top"
              style={{objectPosition: 'top'}}
            />
          </div>
          <p className="font-body text-lg max-w-xl mx-auto leading-relaxed mb-8" style={{color: 'rgba(0,0,0,0.72)'}}>
            <strong style={{color: '#000000'}}>5 of the Champions Boxes will include tickets for two</strong>{' '}
            to join the Highsman team at an Eagles or Giants game this season.
            Game day with us — on us.<br /><br />
            Competition runs <strong style={{color: '#000000'}}>May 7th through June 7th</strong>.
            Five chances to win. This is the Champions Box you want to find.
          </p>
          <span className="inline-block font-headline text-sm tracking-[0.2em] uppercase px-6 py-3" style={{background: '#000000', color: '#F5E100'}}>
            Eagles · Giants · Competition May 7 – June 7
          </span>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-surface-container py-24 px-6 md:px-16 border-t border-b border-outline-variant/20">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-3">Simple</p>
            <h2 className="font-headline text-[clamp(52px,9vw,88px)] leading-[0.88] uppercase tracking-tight text-on-surface">
              How It Works
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {HOW_STEPS.map(({num, title, body}) => (
              <div key={num} className="text-center">
                <div className="font-headline text-[88px] leading-none text-surface-container-highest mb-3">{num}</div>
                <h3 className="font-headline text-2xl uppercase tracking-wider text-on-surface mb-4">{title}</h3>
                <p className="font-body text-sm text-on-surface-variant leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REFERRAL */}
      <section className="bg-surface-container-lowest py-24 px-6 md:px-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-label text-xs tracking-[0.32em] uppercase text-on-surface-variant mb-4">Know a Great Budtender?</p>
          <h2 className="font-headline text-[clamp(44px,8vw,78px)] leading-[0.88] uppercase tracking-tight text-on-surface mb-6">
            Refer Them.<br />Win a Varsity Jacket.
          </h2>
          <p className="font-body text-base text-on-surface-variant max-w-lg mx-auto leading-relaxed mb-10">
            Every budtender you refer who joins the Highsman team earns you{' '}
            <strong className="text-on-surface font-semibold">one entry into our monthly draw</strong>.
            One winner every month takes home a Highsman Varsity Jacket.
          </p>
          <div className="border border-outline-variant/30 bg-surface-container p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 text-left">
            <span className="text-4xl leading-none">🏈</span>
            <div className="flex-1">
              <h4 className="font-headline text-xl uppercase tracking-wider text-on-surface mb-1">Your Referral Link</h4>
              <p className="font-body text-sm text-on-surface-variant">Share your personal link with your network. The more you refer, the more entries you earn.</p>
            </div>
            <a href="https://highsman.com/budtenders" className="bg-primary text-on-primary font-headline text-base uppercase tracking-widest px-8 py-4 hover:opacity-90 transition-opacity whitespace-nowrap">
              Share Your Link
            </a>
          </div>
        </div>
      </section>

      {/* RICKY SIGN-OFF */}
      <section className="bg-surface-container-low py-20 px-6 md:px-16 border-t border-outline-variant/20">
        <div className="max-w-4xl mx-auto md:grid md:grid-cols-[auto_1fr] md:gap-14 items-center">
          <img src={IMAGES.rickyWilliams} alt="Ricky Williams — Highsman Co-Founder" className="w-24 h-24 object-cover mb-6 md:mb-0 flex-shrink-0" />
          <div>
            <blockquote className="font-headline text-[clamp(22px,3.5vw,38px)] uppercase leading-[1.1] tracking-tight text-on-surface mb-5">
              &ldquo;Let&apos;s have a legendary launch.{' '}
              <span className="text-primary">You&apos;re the reason this works</span>{' '}
              — and we don&apos;t take that lightly.&rdquo;
            </blockquote>
            <p className="font-label text-xs tracking-[0.22em] uppercase text-on-surface-variant">
              <strong className="text-on-surface">Ricky Williams</strong> — Highsman Co-Founder
            </p>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="bg-surface-container py-20 px-6 md:px-16 border-t border-outline-variant/20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-headline text-[clamp(36px,6vw,58px)] uppercase leading-[0.9] tracking-tight text-on-surface mb-4">
            Questions? We&apos;re Here.
          </h2>
          <p className="font-body text-base text-on-surface-variant mb-10">
            Reach the Highsman team directly at{' '}
            <a href="mailto:budtenders@highsman.com" className="text-primary hover:underline font-semibold">
              budtenders@highsman.com
            </a>
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="mailto:budtenders@highsman.com" className="bg-primary text-on-primary font-headline text-base uppercase tracking-widest px-8 py-4 hover:opacity-90 transition-opacity">
              Email the Team
            </a>
            <Link to="/#store-locator" className="border border-outline-variant/50 text-on-surface font-headline text-base uppercase tracking-widest px-8 py-4 hover:bg-surface-container-highest transition-colors">
              Find Your Nearest Store
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER MARK */}
      <div className="bg-surface-container-lowest py-12 px-6 text-center border-t border-outline-variant/20">
        <img src={IMAGES.sparkGreatnessLogoWhite} alt="Spark Greatness" className="h-7 mx-auto mb-3 opacity-60" />
        <p className="font-label text-xs tracking-[0.2em] uppercase text-on-surface-variant">
          © 2026 Highsman. All rights reserved.
        </p>
      </div>
    </>
  );
}
