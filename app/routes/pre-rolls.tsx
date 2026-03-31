import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | 1.2G Triple Infused Pre-Rolls'}];
};

export default function PreRolls() {
  return (
    <>
      {/* ===== HERO: EDITORIAL SPLIT ===== */}
      <section className="relative w-full min-h-screen md:min-h-[921px] grid grid-cols-1 md:grid-cols-12 bg-surface">
        <div className="md:col-span-7 relative overflow-hidden order-2 md:order-1 bg-[#2D1B69]">
          <img
            alt="Highsman 1.2g Triple Infused lineup"
            className="absolute inset-0 w-full h-full object-cover transition-transform"
            src={IMAGES.preRollsLineup}
          />


        </div>
        <div className="md:col-span-5 flex flex-col justify-center p-8 md:p-16 space-y-8 bg-surface-container-low order-1 md:order-2">
          <div className="space-y-2">
            <span className="font-headline text-primary text-2xl tracking-[0.3em] uppercase">
              Product Profile
            </span>
            <h1 className="font-headline text-4xl md:text-8xl leading-[0.85] uppercase font-bold text-primary">
              1.2G TRIPLE INFUSED PRE-ROLLS
            </h1>
          </div>
          <div className="space-y-4">
            <p className="text-on-surface-variant text-lg max-w-md leading-relaxed">
              Engineered for performance. Our Triple Infused sticks combine
              premium whole flower with a precision blend of ultra-pure
              concentrates.
            </p>
            <p className="font-headline text-2xl text-primary uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">
                groups
              </span>
              Great for Sharing &bull; 20% More Volume
            </p>
          </div>
          <div className="flex flex-col gap-4 pt-4">
            <Link to="/#store-locator" className="bg-primary text-on-primary px-6 py-3 md:px-10 md:py-5 font-headline text-xl md:text-3xl uppercase font-semibold flex items-center justify-between group hover:bg-primary-container transition-all">
              FIND NEAR YOU
              <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">
                location_on
              </span>
            </button>
            <div className="flex justify-between items-center text-on-surface-variant font-headline text-xl">
              <span>THC RANGE: 38% - 44%</span>
              <span className="material-symbols-outlined">verified</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== THE INFUSION TRIO: BENTO STYLE ===== */}
      <section className="px-8 md:px-16 py-24 bg-surface space-y-16">
        <div className="flex flex-col md:flex-row justify-between items-end gap-12 border-b border-outline-variant pb-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <img
              alt="Triple Infused Logo"
              className="h-32 md:h-40"
              src={IMAGES.tripleInfusedIcon}
            />
            <h2 className="font-headline text-3xl md:text-8xl uppercase leading-none">
              TRIPLE INFUSED FLAVOR &amp; POTENCY
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
          {[
            {
              title: 'THC-A DIAMONDS',
              desc: 'Pure THCa crystalline diamonds for immediate high-velocity impact. Maximum clarity, maximum power.',
              bg: 'bg-surface-container-high',
              image: IMAGES.thcaDiamonds,
            },
            {
              title: 'LIVE RESIN',
              desc: "Fresh Frozen Live Resin preserving the full spectrum of the plant's biological profile and terpenes.",
              bg: 'bg-surface-bright',
              image: IMAGES.liveResin,
            },
            {
              title: 'HTE EXTRACT',
              desc: 'High Terpene Extract for complex flavor architecture and sustained aromatic intensity.',
              bg: 'bg-surface-container-high',
              image: IMAGES.hteExtract,
            },
          ].map((item) => (
            <div
              key={item.title}
              className={`${item.bg} p-12 space-y-6 flex flex-col justify-between aspect-auto md:aspect-square`}
            >
              <div className="w-full h-48 mb-6 overflow-hidden bg-surface-container"><img alt={item.title} className="w-full h-full object-cover" src={item.image} /></div>
              <div className="space-y-4">
                <h3 className="font-headline text-3xl md:text-5xl uppercase text-primary">
                  {item.title}
                </h3>
                <p className="text-on-surface-variant">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FLAVOR ROSTER: ASYMMETRIC EDITORIAL ===== */}
      <section className="bg-surface-container-lowest py-24">
        <div className="px-8 md:px-16 mb-16 flex justify-between items-end">
          <h2 className="font-headline text-4xl md:text-9xl uppercase tracking-tighter">
            SIGNATURE ROSTER
          </h2>
          <div className="hidden md:block font-headline text-3xl uppercase text-primary pb-4">
            Full 1.2G Form Factor
          </div>
        </div>
        <div className="flex flex-col">
          {[
            {
              num: '01',
              name: 'BLUEBERRY BLITZ',
              type: 'Indica | Berry \u2022 Pine \u2022 Diesel',
              tag: 'High Potency Recovery',
            },
            {
              num: '02',
              name: 'GRIDIRON GRAPE',
              type: 'Hybrid | Sweet \u2022 Earthy \u2022 Funk',
              tag: 'The Ultimate Social Burn',
            },
            {
              num: '03',
              name: 'TOUCHDOWN TANGO MANGO',
              type: 'Sativa | Citrus \u2022 Zest \u2022 Gas',
              tag: 'Day Game Energy',
            },
            {
              num: '04',
              name: 'WAVY WATERMELON',
              type: 'Indica-Dom | Cool \u2022 Spice \u2022 Herbal',
              tag: 'Post-Game Relaxation',
            },
            {
              num: '05',
              name: 'CAKE QUAKE',
              type: 'Hybrid | Sour \u2022 Skunk \u2022 Cream',
              tag: 'Maximum Impact Sharing',
            },
          ].map((flavor, i) => (
            <div
              key={flavor.num}
              className={`group ${i === 0 ? 'border-y' : 'border-b'} border-outline-variant hover:bg-surface-container-high transition-colors py-12 px-8 md:px-16 flex flex-col md:flex-row items-center justify-between cursor-pointer`}
            >
              <div className="flex items-center gap-12 w-full md:w-auto">
                <span className="font-headline text-4xl text-outline-variant group-hover:text-primary">
                  {flavor.num}
                </span>
                <h3 className="font-headline text-2xl md:text-7xl uppercase">
                  {flavor.name}
                </h3>
              </div>
              <div className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity text-right">
                <div className="font-headline text-2xl uppercase tracking-widest text-primary">
                  {flavor.type}
                </div>
                <div className="text-xs uppercase tracking-tighter text-on-surface-variant">
                  {flavor.tag}
                </div>
              </div>
              <span className="material-symbols-outlined text-4xl group-hover:rotate-45 transition-transform">
                north_east
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== SECONDARY IMAGERY ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 h-auto md:h-[600px] w-full">
        <div className="relative overflow-hidden">
          <img
            alt="Highsman Product Showcase"
            className="w-full h-full object-cover"
            src={IMAGES.preRollsLineup}
          />
          <div className="absolute inset-0 bg-surface/40 mix-blend-multiply" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-primary text-on-primary p-6 font-headline text-4xl uppercase font-bold transform -rotate-12">
              GREAT FOR SHARING
            </div>
          </div>
        </div>
        <div className="bg-surface-container-high p-8 md:p-16 flex flex-col justify-center items-start space-y-6">
          <h3 className="font-headline text-6xl uppercase leading-tight">
            THE ELITE STANDARD
          </h3>
          <p className="text-on-surface-variant text-lg leading-relaxed">
            Every Highsman Triple Infused pre roll is lab-tested for purity and
            potency. We use zero trim, zero shake. Only hand-selected whole
            flower and artisanal concentrates. Now with 20% more content.
          </p>
          <div className="flex flex-wrap gap-4">
            {['NO TRIM', 'NO SHAKE', 'WHOLE FLOWER'].map((tag) => (
              <div
                key={tag}
                className="border border-outline p-4 font-headline text-2xl uppercase"
              >
                {tag}
              </div>
            ))}
            <div className="bg-primary text-on-primary p-4 font-headline text-2xl uppercase font-bold">
              1.2G VOLUME
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="bg-primary text-on-primary py-32 px-8 text-center relative overflow-hidden">
        <div className="relative z-10 max-w-4xl mx-auto space-y-12">
          <h2 className="font-headline text-4xl md:text-[10rem] leading-[0.8] uppercase font-bold tracking-tighter">
            GET IN THE GAME.
          </h2>
          <p className="font-headline text-3xl uppercase tracking-widest">
            Experience the 1.2g Difference.
          </p>
          <div className="flex flex-col md:flex-row gap-6 justify-center">
            <button className="bg-on-primary text-primary px-6 py-4 md:px-12 md:py-6 font-headline text-xl md:text-4xl uppercase font-bold hover:bg-surface-container-highest transition-all">
              FIND A STORE
            </button>
            <button className="border-4 border-on-primary text-on-primary px-6 py-4 md:px-12 md:py-6 font-headline text-xl md:text-4xl uppercase font-bold hover:bg-on-primary hover:text-primary transition-all">
              VIEW LAB RESULTS
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
