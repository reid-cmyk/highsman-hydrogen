import {Link} from '@remix-run/react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Spark Greatness'}];
};

export default function Homepage() {
  return (
    <>
      {/* ===== HERO SECTION ===== */}
      <section className="relative h-[90vh] flex items-end px-4 pb-12 md:px-12 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            alt="NFL running back in action - Highsman"
            className="w-full h-full object-cover grayscale brightness-50"
            src={IMAGES.heroHomepage}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-transparent" />
        </div>
        <div className="relative z-10 max-w-5xl">
          <h1 className="font-headline text-5xl md:text-[14rem] leading-[0.8] font-bold uppercase italic tracking-tighter">
            spark greatness
          </h1>
          <p className="font-body text-sm md:text-xl mt-8 max-w-xl text-on-surface-variant uppercase tracking-[0.2em] leading-tight">
            Premium cannabis for the high-performance lifestyle, founded by NFL
            Legend Ricky Williams.
          </p>
          <div className="mt-12 flex gap-4">
            <Link
              to="/our-strains"
              className="bg-primary text-on-primary px-8 py-3 md:px-16 md:py-5 font-headline text-xl md:text-3xl font-bold uppercase hover:bg-primary-container transition-colors"
            >
              SHOP NOW
            </Link>
          </div>
        </div>
      </section>

      {/* ===== TRIPLE INFUSION HALLMARK ===== */}
      <section className="bg-white text-black py-12 px-4 md:py-20 md:px-12 overflow-hidden relative">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="w-full md:w-1/2">
              <h2 className="font-headline text-4xl md:text-8xl font-black uppercase leading-[0.85] mb-6">
                TRIPLE <br />
                INFUSED <br />
                FLAVOR &amp; <br />
                POTENCY.
              </h2>
              <div className="space-y-4">
                {[
                  {
                    title: 'THCA DIAMONDS',
                    desc: 'The ultimate potency multiplier.',
                  },
                  {
                    title: 'FRESH FROZEN LIVE RESIN',
                    desc: 'Captured at peak harvest for full spectrum effect.',
                  },
                  {
                    title: 'HIGH TERPENE EXTRACT',
                    desc: 'Pure flavor and entourage precision.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 border-l-4 border-black pl-6"
                  >
                    <div>
                      <h4 className="font-headline text-xl md:text-3xl font-bold uppercase">
                        {item.title}
                      </h4>
                      <p className="font-body text-sm uppercase tracking-wider">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full md:w-1/2 relative flex justify-center">
              <img
                alt="Triple Infused Icon"
                className="w-2/3 h-auto object-contain"
                src={IMAGES.tripleInfusedIcon}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRODUCT GRID (ASYMMETRIC) ===== */}
      <section className="bg-surface-container-low py-16 px-4 md:py-32 md:px-12">
        <div className="grid grid-cols-12 gap-6">
          {/* Hit Stick */}
          <div className="col-span-12 md:col-span-7 bg-surface-container h-[350px] md:h-[600px] relative group overflow-hidden">
            <img
              className="absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-105 object-contain"
              src={IMAGES.hitStickProduct}
              alt="Hit Stick product"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-500" />
            <div className="absolute bottom-12 left-12">
              <span className="bg-white text-black px-3 py-1 font-headline text-xl font-bold uppercase mb-4 inline-block">
                Engineered Airflow
              </span>
              <h2 className="font-headline text-4xl md:text-8xl font-bold uppercase leading-none">
                HIT STICK
              </h2>
              <p className="font-body text-sm tracking-widest uppercase mt-4 text-primary max-w-sm">
                A 0.5G dispos-a-bowl. A cross between a Pre Roll and a Chillum.
                Engineered for elite performance.
              </p>
              <Link
                to="/hit-sticks"
                className="mt-8 bg-white text-black px-6 py-3 md:px-12 md:py-4 font-headline text-lg md:text-2xl font-bold uppercase inline-block"
              >
                EXPLORE GEAR
              </Link>
            </div>
          </div>

          {/* 1.2G Pre-Rolls */}
          <div className="col-span-12 md:col-span-5 bg-surface-container-high h-[350px] md:h-[600px] flex flex-col justify-end p-12 relative overflow-hidden group">
            <img
              alt="1.2g Pre-Rolls"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              src={IMAGES.preRollsProduct}
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-500" />
            <div className="relative z-10">
              <span className="font-headline text-4xl border-b-2 border-primary pb-2 uppercase text-primary italic font-bold">
                20% Larger Free
              </span>
              <h2 className="font-headline text-4xl md:text-7xl font-bold uppercase leading-tight mt-6 mb-4">
                1.2G PRE ROLLS
              </h2>
              <p className="font-body text-white text-sm uppercase tracking-widest mb-8 leading-relaxed">
                DESIGNED FOR THE SOCIAL SESSION. MORE VOLUME, TRIPLE INFUSION,
                BUILT FOR SHARING.
              </p>
              <Link
                to="/pre-rolls"
                className="font-headline text-3xl font-bold uppercase underline decoration-4 underline-offset-8"
              >
                VIEW THE LINEUP
              </Link>
            </div>
          </div>

          {/* Ground Game */}
          <div className="col-span-12 mt-6 relative h-[350px] md:h-[500px] overflow-hidden group">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                alt="7g Ground Game Flower"
                className="w-[70%] h-[70%] object-cover transition-transform duration-700 group-hover:scale-110"
                src={IMAGES.groundGameProduct}
              />
            </div>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10 flex h-full items-center justify-between px-4 md:px-16">
              <div className="max-w-xl">
                <span className="font-headline text-xl md:text-4xl text-primary font-bold uppercase mb-2 block">
                  7G Ready To Roll
                </span>
                <h2 className="font-headline text-5xl md:text-[9rem] font-bold uppercase leading-[0.8] mb-4">
                  GROUND <br />
                  GAME
                </h2>
                <p className="font-body text-white uppercase text-sm tracking-[0.2em]">
                  ECONOMY OF SCALE. PREMIUM QUALITY. THE CORE OF THE HIGHSMAN
                  ROSTER.
                </p>
              </div>
              <div className="flex flex-col items-end gap-6">
                <div className="font-headline text-[6rem] md:text-[12rem] font-extrabold text-stroke absolute hidden md:block right-10 top-1/2 -translate-y-1/2 select-none pointer-events-none uppercase">
                  FLOWER
                </div>
                <Link
                  to="/ground-game"
                  className="bg-primary text-on-primary px-8 py-4 md:px-20 md:py-8 font-headline text-xl md:text-4xl font-bold uppercase hover:bg-white hover:text-black transition-all relative z-10"
                >
                  7G BAG
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== APPAREL COLLECTION ===== */}
      <section className="relative h-[80vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            alt="Highsman Apparel Lifestyle"
            className="w-full h-full object-cover grayscale"
            src={IMAGES.apparelLifestyle}
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="container mx-auto px-12 relative z-10 text-center">
          <h2 className="font-headline text-4xl md:text-[10rem] font-black uppercase leading-[0.85] mb-6 text-white">
            THE APPAREL <br />
            COLLECTION
          </h2>
          <p className="font-body text-xl md:text-2xl uppercase tracking-[0.2em] mb-12 text-primary max-w-3xl mx-auto">
            GEAR UP FOR GREATNESS. EXCLUSIVE HIGHSMAN VARSITY JACKETS, HOODIES,
            AND MORE.
          </p>
          <Link
            to="/apparel"
            className="inline-block bg-white text-black px-8 py-4 md:px-16 md:py-6 font-headline text-xl md:text-4xl font-bold uppercase hover:bg-primary-container transition-all"
          >
            SHOP NOW
          </Link>
        </div>
      </section>

      {/* ===== RICKY WILLIAMS SPOTLIGHT ===== */}
      <section className="bg-surface py-16 md:py-32 overflow-hidden border-t border-outline-variant/10">
        <div className="container mx-auto px-4 md:px-12 flex flex-col md:flex-row items-center gap-10 md:gap-20">
          <div className="w-full md:w-1/2 relative">
            <div className="absolute -top-10 -left-10 text-[20rem] font-headline font-black text-surface-container-highest opacity-10 select-none leading-none">
              34
            </div>
            <img
              alt="Portrait of Ricky Williams"
              className="relative z-10 w-full aspect-[4/5] object-cover grayscale"
              src={IMAGES.rickyWilliams}
            />
          </div>
          <div className="w-full md:w-1/2">
            <h3 className="font-headline text-2xl text-primary tracking-widest uppercase mb-4">
              THE FOUNDER
            </h3>
            <h2 className="font-headline text-5xl md:text-8xl font-bold uppercase leading-[0.9] mb-8">
              RICKY <br />
              WILLIAMS
            </h2>
            <p className="font-body text-on-surface-variant text-lg leading-relaxed mb-10 max-w-lg">
              Highsman is more than a brand&mdash;it&apos;s a mindset. Inspired
              by the resilience and mental clarity found on and off the field,
              Ricky Williams created Highsman to empower elite performers to
              reach their peak state through premium cannabis.
            </p>
            <button className="border-2 border-primary text-primary px-6 py-3 md:px-12 md:py-4 font-headline text-lg md:text-2xl font-bold uppercase hover:bg-white hover:text-black transition-all">
              READ THE STORY
            </button>
          </div>
        </div>
      </section>

      {/* ===== THE LINEUP STRAINS BAR ===== */}
      <div className="bg-white border-y border-black overflow-hidden whitespace-nowrap py-12 md:py-20 flex-col flex items-center">
        <h2 className="font-headline text-4xl md:text-8xl font-black uppercase text-black mb-12 tracking-tighter">
          THE LINEUP
        </h2>
        <div className="flex w-full">
          <img
            alt="Strains Banner"
            className="w-full h-auto object-contain block"
            src={IMAGES.strainsBanner}
          />
        </div>
        <div className="mt-12">
          <Link
            to="/our-strains"
            className="bg-black text-white px-8 py-3 md:px-16 md:py-5 font-headline text-xl md:text-3xl font-bold uppercase hover:bg-neutral-800 transition-colors inline-block"
          >
            VIEW THE LINEUP
          </Link>
        </div>
      </div>

      {/* ===== STORE LOCATOR ===== */}
      <section className="py-16 md:py-32 bg-surface-container-lowest border-t border-outline-variant/10">
        <div className="container mx-auto px-4 md:px-12">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2">
              <h2 className="font-headline text-4xl md:text-[10rem] font-bold uppercase italic leading-[0.8] mb-8">
                find us near you
              </h2>
              <p className="font-body text-on-surface-variant text-xl uppercase tracking-widest mb-12">
                LOCATE AN AUTHORIZED HIGHSMAN RETAILER NEAR YOU.
              </p>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row items-stretch border border-primary/20">
                  <div className="flex-grow bg-surface p-6 flex items-center">
                    <span className="material-symbols-outlined text-primary mr-4 text-3xl">
                      my_location
                    </span>
                    <input
                      className="bg-transparent border-none text-white font-headline text-xl md:text-4xl focus:ring-0 placeholder:text-on-surface-variant/30 w-full uppercase"
                      placeholder="ZIP CODE OR CITY"
                      type="text"
                    />
                  </div>
                  <button className="bg-primary text-on-primary px-8 py-4 md:px-16 md:py-6 font-headline text-xl md:text-4xl font-bold uppercase hover:bg-primary-container transition-all">
                    SEARCH
                  </button>
                </div>
                <button className="flex items-center justify-center gap-2 font-headline text-xl uppercase tracking-widest text-on-surface-variant hover:text-white transition-colors py-4">
                  <span className="material-symbols-outlined">map</span>
                  VIEW FULL STORE MAP
                </button>
              </div>
            </div>
            <div className="w-full lg:w-1/2 h-[300px] md:h-[600px] bg-surface-container relative">
              <div className="absolute inset-0 bg-[#1a1a1a] flex items-center justify-center overflow-hidden">
                <div className="relative z-10 flex flex-col items-center">
                  <span className="material-symbols-outlined text-white text-8xl mb-4">
                    location_on
                  </span>
                  <p className="font-headline text-3xl font-bold uppercase tracking-widest">
                    MAP INTERFACE
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATS SECTION ===== */}
      <section className="bg-[#0E0E0E] py-24 border-t border-outline-variant/20">
        <div className="container mx-auto px-4 md:px-12 grid grid-cols-2 md:grid-cols-4 gap-12">
          {[
            {value: '100%', label: 'Indoor Cultivated'},
            {value: '5', label: 'Elite Strains'},
            {value: '3X', label: 'Infused Potency'},
            {value: '6', label: 'States Nationwide'},
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center text-center"
            >
              <span className="font-headline text-5xl md:text-8xl font-bold text-primary leading-none">
                {stat.value}
              </span>
              <span className="font-label text-on-surface-variant uppercase tracking-widest text-xs mt-2">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
