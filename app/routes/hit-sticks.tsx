import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Hit Sticks'}];
};

export default function HitSticks() {
  return (
    <>
      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-screen md:min-h-[921px] flex flex-col md:flex-row items-center overflow-hidden px-8 md:px-16 py-12 gap-12">

        {/* Product Showcase */}
        <div className="w-full md:w-1/2 z-10">
          <div className="bg-surface-container p-4 flex justify-center items-center overflow-hidden">
            <img
              alt="Highsman Hit Stick"
              className="max-w-full max-h-[600px] w-auto h-auto object-contain"
              src={IMAGES.hitStickProduct}
            />
          </div>
        </div>

        {/* Product Copy */}
        <div className="w-full md:w-1/2 z-10 flex flex-col items-start text-left">
          <span className="uppercase tracking-[0.3em] text-on-surface-variant font-medium text-sm mb-4">
            PERSONAL PERFORMANCE GRADE
          </span>
          <h1 className="font-headline text-5xl md:text-9xl font-bold uppercase leading-[0.85] mb-6">
            HIT
            <br />
            STICK
          </h1>
          <p className="font-body text-on-surface-variant max-w-md mb-8 leading-relaxed">
            A portable and disposable cross between a Pre Roll and a Chillum.
            Designed for elite performance, this is pure flower experience
            engineered for precision and power&mdash;not a vape.
          </p>
          <div className="flex flex-wrap gap-4 mb-10">
            <Link to="/#store-locator" className="bg-primary text-on-primary px-8 py-4 font-headline text-2xl font-semibold uppercase hover:bg-primary-container transition-all active:scale-95 inline-block text-center no-underline">
              FIND A STORE
            </Link>
            <Link to="/our-strains" className="border border-outline-variant px-8 py-4 font-headline text-2xl font-semibold uppercase text-primary hover:bg-surface-container-highest transition-all inline-block text-center no-underline">
              LEARN MORE
            </Link>
          </div>

          {/* High Impact Stats */}
          <div className="grid grid-cols-2 gap-8 w-full border-t border-outline-variant/20 pt-8">
            <div>
              <div className="font-headline text-5xl font-bold text-primary">
                0.5G
              </div>
              <div className="text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                PRECISION DOSAGE
              </div>
            </div>
            <div>
              <div className="font-headline text-5xl font-bold text-primary">
                3x
              </div>
              <div className="text-on-surface-variant text-xs uppercase tracking-widest font-medium">
                INFUSION
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== USE CASE BENTO GRID ===== */}
      <section className="bg-surface-container-low px-8 md:px-16 py-24">
        <h2 className="font-headline text-3xl md:text-6xl font-bold uppercase mb-16 text-center">
          BUILT FOR THE FIELD
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7 bg-surface p-12 flex flex-col justify-between min-h-[400px]">
            <div>
              <span className="material-symbols-outlined text-4xl mb-6 text-primary block">
                bolt
              </span>
              <h3 className="font-headline text-3xl md:text-5xl font-bold uppercase mb-4">
                ON-THE-GO PERSONAL USE
              </h3>
              <p className="text-on-surface-variant max-w-md">
                Slim enough for your pocket, powerful enough for your ritual. The
                perfect companion for transitional moments between the grind and
                the game.
              </p>
            </div>
            <div className="mt-8 text-on-surface-variant text-xs tracking-widest">
              01 / MOBILITY
            </div>
          </div>
          <div className="md:col-span-5 bg-surface-bright p-12 flex flex-col justify-between">
            <div>
              <span className="material-symbols-outlined text-4xl mb-6 text-primary block">
                cloud_done
              </span>
              <h3 className="font-headline text-3xl md:text-5xl font-bold uppercase mb-4">
                WEATHER RESISTANT
              </h3>
              <p className="text-on-surface-variant">
                Built to withstand the elements. Whether it&apos;s
                post-training in the rain or a day in the sun, the Hit Stick
                holds its integrity.
              </p>
            </div>
            <div className="mt-8 text-on-surface-variant text-xs tracking-widest">
              02 / DURABILITY
            </div>
          </div>
          <div className="md:col-span-5 bg-surface-container-highest p-12 flex flex-col justify-between">
            <div>
              <span className="material-symbols-outlined text-4xl mb-6 text-primary block">
                air
              </span>
              <h3 className="font-headline text-3xl md:text-5xl font-bold uppercase mb-4">
                IDEAL AIRFLOW
              </h3>
              <p className="text-on-surface-variant">
                Precision engineered internal dynamics ensure every draw is
                consistent, smooth, and effortless.
              </p>
            </div>
            <div className="mt-8 text-on-surface-variant text-xs tracking-widest">
              03 / ENGINEERING
            </div>
          </div>
          <div className="md:col-span-7 bg-surface p-12 flex flex-col justify-between relative overflow-hidden">
            <div className="z-10">
              <span className="material-symbols-outlined text-4xl mb-6 text-primary block">
                calendar_today
              </span>
              <h3 className="font-headline text-3xl md:text-5xl font-bold uppercase mb-4">
                THE DAY&apos;S USE
              </h3>
              <p className="text-on-surface-variant max-w-md">
                Measured for a full day of elevation. No waste, no excess, just
                the perfect amount to keep you in the zone.
              </p>
            </div>
            <div className="mt-8 text-on-surface-variant text-xs tracking-widest z-10">
              04 / EFFICIENCY
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRIPLE INFUSION SECTION ===== */}
      <section className="px-8 md:px-16 py-24 bg-surface">
        <div className="flex flex-col md:flex-row gap-16 items-center">
          <div className="w-full md:w-1/2">
            <div className="mb-8">
              <img
                alt="Triple Infused Icon"
                className="w-32 h-32 mb-6"
                src={IMAGES.tripleInfusedIcon}
              />
              <h2 className="font-headline text-7xl font-bold uppercase leading-none mb-4">
                FLAVOR &amp; POTENCY
              </h2>
              <h3 className="font-headline text-4xl font-bold uppercase text-outline-variant mb-6">
                TRIPLE INFUSION PROCESS
              </h3>
            </div>
            <p className="text-on-surface-variant mb-12 max-w-lg">
              We don&apos;t just fill it. We craft it. Our proprietary triple
              infusion process combines three distinct tiers of concentrate for
              an unparalleled profile and maximum effect.
            </p>
            <ul className="space-y-12">
              {[
                {
                  num: '01',
                  title: 'THCA DIAMONDS',
                  desc: 'The pure foundation of potency and clarity.',
                },
                {
                  num: '02',
                  title: 'FRESH FROZEN LIVE RESIN',
                  desc: 'Capturing the soul of the plant at peak harvest.',
                },
                {
                  num: '03',
                  title: 'HIGH TERPENE EXTRACT',
                  desc: 'The aromatic finish that defines the experience.',
                },
              ].map((item) => (
                <li key={item.num} className="flex gap-6 items-start">
                  <span className="font-headline text-4xl font-bold text-outline-variant">
                    {item.num}
                  </span>
                  <div>
                    <h4 className="font-headline text-3xl font-bold uppercase text-primary">
                      {item.title}
                    </h4>
                    <p className="text-on-surface-variant text-sm">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-full md:w-1/2 relative h-[300px] md:h-[600px] bg-surface-container-low overflow-hidden">
            <img
              alt="Concentrate Color Macro"
              className="w-full h-full object-cover opacity-90"
              src={IMAGES.concentrateMacro}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent opacity-40" />
            <div className="absolute bottom-12 right-12 text-right">
              <div className="font-headline text-6xl font-bold text-white leading-none">
                ELITE
                <br />
                CRAFT
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== RETAIL DISCOVERY ===== */}
      <section className="bg-surface-container-low py-24">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <h2 className="font-headline text-7xl font-bold uppercase mb-6">
            READY FOR KICKOFF?
          </h2>
          <p className="text-on-surface-variant mb-12 text-lg">
            Highsman products are available at premier retail partners across the
            country. Find your nearest dispensary and elevate your game today.
          </p>
          <div className="bg-surface p-8 flex flex-col md:flex-row items-center gap-6 justify-between">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-3xl text-primary">
                location_on
              </span>
              <div className="text-left">
                <div className="font-headline text-2xl font-bold uppercase">
                  ENTER ZIP CODE
                </div>
                <div className="text-xs text-outline tracking-widest">
                  FIND NEAREST STOCKIST
                </div>
              </div>
            </div>
            <div className="w-full md:w-auto flex">
              <input
                className="bg-surface-container-high border-none font-headline text-2xl px-6 py-4 w-full md:w-48 focus:ring-0 text-white"
                placeholder="90210"
                type="text"
              />
              <button className="bg-primary text-on-primary font-headline text-2xl font-bold px-10 py-4 uppercase hover:bg-primary-container transition-all">
                SEARCH
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
