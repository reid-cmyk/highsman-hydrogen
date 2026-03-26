import type {MetaFunction} from '@shopify/remix-oxygen';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Ground Game - 7G Flower'}];
};

export default function GroundGame() {
  return (
    <>
      {/* ===== HERO EDITORIAL SECTION ===== */}
      <section className="grid grid-cols-1 md:grid-cols-12 min-h-[921px] bg-surface relative overflow-hidden">
        {/* Left Branding Column */}
        <div className="md:col-span-1 border-r border-outline-variant/20 flex-col justify-center items-center py-12 hidden md:flex">
          <p className="font-headline text-2xl font-bold uppercase tracking-[0.5em] -rotate-90 whitespace-nowrap text-on-surface-variant">
            ELITE PERFORMANCE
          </p>
        </div>

        {/* Main Content Area */}
        <div className="md:col-span-6 flex flex-col justify-center px-8 md:px-16 py-12 z-10">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="bg-primary text-on-primary font-headline text-xl px-4 py-1 font-bold tracking-widest">
              7G READY TO ROLL
            </span>
            <span className="border-2 border-primary text-primary font-headline text-xl px-4 py-1 font-bold tracking-widest uppercase">
              BUDGET FRIENDLY
            </span>
          </div>
          <h1 className="font-headline text-[120px] leading-[0.85] font-bold uppercase mb-6 tracking-tighter">
            GROUND <br />
            GAME
          </h1>
          <p className="font-body text-xl text-on-surface-variant max-w-md mb-12 leading-relaxed">
            Premium indoor-grown flower, pre-ground for the ultimate
            convenience. No trim, no shake&mdash;just pure, high-potency flower
            ready for the play.
          </p>
          <div className="flex flex-col gap-6">
            <div className="flex items-baseline gap-4">
              <span className="font-headline text-7xl font-bold text-white">
                THC: 40%
              </span>
            </div>
            <div className="flex gap-4">
              <button className="bg-primary text-on-primary font-headline text-2xl font-bold uppercase px-12 py-4 hover:bg-primary-container transition-all flex items-center gap-3 group">
                FIND NEAR YOU
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                  location_on
                </span>
              </button>
              <button className="border-2 border-primary text-primary font-headline text-2xl font-bold uppercase px-12 py-4 hover:bg-surface-bright transition-all">
                VIEW LABS
              </button>
            </div>
          </div>
        </div>

        {/* Asymmetric Image Section */}
        <div className="md:col-span-5 relative bg-surface-container-lowest">
          <img
            alt="Ground Game cannabis packaging"
            className="w-full h-full object-contain p-4 md:p-8 scale-110"
            src={IMAGES.groundGameProduct}
          />
          {/* Floating High-Impact Stat */}
          <div className="absolute bottom-12 right-0 bg-surface p-8 z-20 md:-left-12 md:bottom-24 md:h-fit shadow-2xl">
            <div className="flex flex-col">
              <span className="font-headline text-8xl font-bold leading-none text-primary">
                0%
              </span>
              <span className="font-body text-sm uppercase tracking-widest text-on-surface-variant font-bold">
                TRIM OR SHAKE
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRODUCT SPECS BENTO GRID ===== */}
      <section className="bg-surface-container-low px-8 md:px-24 py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Stat Card 1: Triple Infused */}
          <div className="bg-surface p-12 flex flex-col justify-between border-t-4 border-primary">
            <img
              alt="Triple Infused Icon"
              className="w-24 h-24 mb-8"
              src={IMAGES.tripleInfusedIcon}
            />
            <div>
              <h3 className="font-headline text-4xl font-bold uppercase mb-4">
                Triple Infused Flavor &amp; Potency
              </h3>
              <p className="font-body text-on-surface-variant">
                Enhanced with Diamonds, Rosin, and High Terpene Extract for an
                elite experience that hits different.
              </p>
            </div>
          </div>

          {/* Image Card (Large) */}
          <div className="md:col-span-2 relative h-[400px] overflow-hidden">
            <img
              alt="Premium cannabis buds with visible trichomes"
              className="w-full h-full object-cover"
              src={IMAGES.cannabisMacro}
            />
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute bottom-8 left-8">
              <h2 className="font-headline text-6xl font-bold uppercase text-white drop-shadow-lg">
                THE NO-TRIM <br />
                DIFFERENCE
              </h2>
            </div>
          </div>

          {/* Stat Card 2: Strain Profile */}
          <div className="bg-surface-container-highest p-12">
            <h4 className="font-headline text-2xl uppercase tracking-[0.3em] mb-8 text-on-surface-variant">
              STRAIN PROFILE
            </h4>
            <div className="space-y-6">
              {[
                {name: 'LIMONENE', value: '1.2%'},
                {name: 'MYRCENE', value: '0.8%'},
                {name: 'CARYOPHYLLENE', value: '0.5%'},
              ].map((terp) => (
                <div
                  key={terp.name}
                  className="flex justify-between items-end border-b border-outline-variant/30 pb-2"
                >
                  <span className="font-headline text-2xl uppercase">
                    {terp.name}
                  </span>
                  <span className="font-headline text-3xl font-bold">
                    {terp.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Block */}
          <div className="bg-primary text-on-primary p-12 flex flex-col justify-center">
            <h3 className="font-headline text-5xl font-bold uppercase leading-tight mb-6 italic">
              READY FOR <br />
              KICKOFF
            </h3>
            <p className="font-body font-bold text-sm uppercase tracking-tighter">
              Triple infused PRE-GROUND FOR CONVENIENCE. PERFORMANCE FOR THE
              PROS.
            </p>
          </div>

          {/* Editorial Block */}
          <div className="bg-surface p-12 border-l-4 border-primary">
            <span className="font-headline text-sm uppercase tracking-[0.4em] text-on-surface-variant block mb-4">
              THE HIGHSMAN WAY
            </span>
            <p className="font-headline text-3xl font-bold leading-snug uppercase">
              DESIGNED FOR ENTHUSIASTS WHO LIKE TO ROLL THEIR OWN WITHOUT
              SACRIFICE.
            </p>
          </div>
        </div>
      </section>

      {/* ===== FULL-WIDTH MARQUEE STATEMENT ===== */}
      <section className="py-32 bg-surface text-center overflow-hidden border-y border-outline-variant/10">
        <div className="relative flex overflow-x-hidden">
          <div className="animate-marquee whitespace-nowrap">
            <h2 className="font-headline text-[18vw] leading-none font-extrabold uppercase opacity-10 px-4 inline-block">
              READY TO ROLL PERFECTION
            </h2>
            <h2 className="font-headline text-[18vw] leading-none font-extrabold uppercase opacity-10 px-4 inline-block">
              READY TO ROLL PERFECTION
            </h2>
          </div>
        </div>
      </section>
    </>
  );
}
