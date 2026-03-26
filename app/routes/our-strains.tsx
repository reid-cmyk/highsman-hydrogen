import type {MetaFunction} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Our Strains - The Lineup'}];
};

const STRAINS = [
  {
    name: 'Touchdown Tango Mango',
    desc: 'A tropical explosion of sweet citrus and peak performance. Designed for social clarity and a vibrant cerebral kick that keeps you in the game.',
    type: 'SATIVA DOMINANT',
    bars: 1,
    image: '/images/strain-mango.jpg',
  },
  {
    name: 'Blueberry Blitz',
    desc: 'Precision-engineered for deep recovery. Ripe berry notes collide with a heavy, soothing body high that tackles stress and resets your system.',
    type: 'INDICA LEANING',
    bars: 3,
    image: '/images/strain-blueberry.jpg',
  },
  {
    name: 'Gridiron Grape',
    desc: 'The ultimate hybrid. Sweet, earthy concord grape flavors delivered with a balanced punch that provides focus for the mind and ease for the body.',
    type: 'PERFECT HYBRID',
    bars: 2,
    badge: 'TOP RATED',
    image: '/images/strain-grape.jpg',
  },
  {
    name: 'Wavey Watermelon',
    desc: 'Smooth sailing. This profile offers a refreshing, crisp melon inhale with a floaty, euphoric sensation that keeps you agile and uplifted.',
    type: 'SATIVA LEANING',
    bars: 1,
    image: '/images/strain-watermelon.jpg',
  },
  {
    name: 'Cake Quake',
    desc: 'A tectonic shift in relaxation. Rich, doughy notes with a vanilla finish. Hits like a heavy linebacker, locking you into total physical comfort.',
    type: 'HEAVY INDICA',
    bars: 3,
    image: '/images/strain-cake.jpg',
  },
];

function IntensityBars({count}: {count: number}) {
  return (
    <div className="flex gap-2 mt-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-12 h-1 ${i <= count ? 'bg-primary' : 'bg-outline-variant'}`}
        />
      ))}
    </div>
  );
}

export default function OurStrains() {
  return (
    <>
      {/* ===== HERO SECTION ===== */}
      <section className="relative h-[614px] flex items-center justify-center overflow-hidden bg-surface-container-lowest">
        <div className="absolute inset-0 opacity-40">
          <img
            className="w-full h-full object-cover grayscale"
            alt="Cannabis flower macro"
            src="/images/strains-hero.jpg"
          />
        </div>
        <div className="relative z-10 text-center px-4">
          <h1 className="font-headline text-8xl md:text-[12rem] leading-none font-bold uppercase tracking-tighter text-primary">
            THE LINEUP
          </h1>
          <p className="font-body text-on-surface-variant max-w-xl mx-auto mt-4 text-lg uppercase tracking-widest">
            Premium custom strains. Professional grade. Every play counts.
          </p>
        </div>
      </section>

      {/* ===== STRAIN GRID ===== */}
      <section className="px-8 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-outline-variant/20">
          {STRAINS.map((strain, i) => (
            <div
              key={strain.name}
              className={`${
                i % 2 === 0 ? 'bg-surface-container' : 'bg-surface-container-low'
              } group hover:bg-surface-bright transition-all duration-500 p-8 flex flex-col justify-between min-h-[500px]`}
            >
              <div>
                <div className="mb-8 relative overflow-hidden">
                  <div className="w-full h-64 bg-surface-container-high" />
                  {strain.badge && (
                    <div className="absolute top-4 right-4 bg-primary text-on-primary px-3 py-1 font-headline text-xl font-bold">
                      {strain.badge}
                    </div>
                  )}
                </div>
                <h2 className="font-headline text-5xl font-bold uppercase leading-tight mb-4">
                  {strain.name}
                </h2>
                <p className="font-body text-on-surface-variant text-sm leading-relaxed mb-6">
                  {strain.desc}
                </p>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <span className="font-headline text-primary text-2xl">
                    {strain.type}
                  </span>
                  <IntensityBars count={strain.bars} />
                </div>
                <span className="material-symbols-outlined text-4xl group-hover:translate-x-2 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>
          ))}

          {/* Feature Block: Lab Tested */}
          <div className="bg-primary text-on-primary p-8 flex flex-col justify-center items-center text-center min-h-[500px]">
            <span
              className="material-symbols-outlined text-8xl mb-6"
              style={{fontVariationSettings: '"FILL" 1'}}
            >
              verified
            </span>
            <h3 className="font-headline text-5xl font-bold uppercase mb-4">
              CERTIFIED PERFORMANCE
            </h3>
            <p className="font-body text-sm uppercase tracking-widest max-w-[200px]">
              Triple-tested for purity, potency, and profile accuracy.
            </p>
            <button className="mt-8 border-2 border-on-primary px-8 py-3 font-headline text-2xl uppercase font-bold hover:bg-on-primary hover:text-primary transition-colors">
              VIEW LAB RESULTS
            </button>
          </div>
        </div>
      </section>

      {/* ===== STRAIN BADGES BANNER ===== */}
      <section className="bg-surface-container-highest py-16 px-8 border-y border-outline-variant/30">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-12 opacity-80 grayscale">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 w-20 bg-surface-container flex items-center justify-center"
            >
              <span className="font-headline text-3xl font-bold text-on-surface-variant">
                H
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-32 bg-surface text-center">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-headline text-7xl md:text-9xl font-bold uppercase mb-8 leading-none">
            READY FOR THE KICKOFF?
          </h2>
          <div className="flex flex-col md:flex-row gap-6 justify-center">
            <button className="bg-primary text-on-primary px-12 py-5 font-headline text-3xl font-bold uppercase hover:bg-primary-container transition-all active:scale-95">
              FIND A STORE
            </button>
            <button className="border-2 border-primary text-primary px-12 py-5 font-headline text-3xl font-bold uppercase hover:bg-surface-container-highest transition-all active:scale-95">
              JOIN OUR MAILING LIST
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
