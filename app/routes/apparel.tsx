import type {MetaFunction} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Apparel - Game Day Collection'}];
};

const PRODUCTS = [
  {
    name: 'VARSITY "H" JACKET',
    material: 'PREMIUM WOOL & LEATHER',
    price: '$245.00',
    badge: 'NEW DROP',
  },
  {
    name: 'SIDELINE HOODIE',
    material: 'HEAVYWEIGHT FLEECE',
    price: '$110.00',
  },
  {
    name: 'GRIDIRON JOGGERS',
    material: 'RELAXED TAPER FIT',
    price: '$95.00',
  },
  {
    name: 'BOX LOGO TEE',
    material: '100% ORGANIC COTTON',
    price: '$45.00',
  },
  {
    name: 'OFF-SEASON BEANIE',
    material: 'RIBBED MERINO WOOL',
    price: '$35.00',
  },
  {
    name: 'PERFORMANCE SOCKS',
    material: 'COMPRESSION TECH / 2-PACK',
    price: '$22.00',
  },
];

export default function Apparel() {
  return (
    <>
      {/* ===== HERO SECTION ===== */}
      <section className="relative h-[921px] w-full overflow-hidden flex items-end">
        <div className="absolute inset-0 z-0">
          <img
            alt="Highsman Varsity Jacket Model"
            className="w-full h-full object-cover grayscale brightness-75"
            src="/images/apparel-hero.jpg"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-transparent opacity-80" />
        </div>
        <div className="relative z-10 w-full px-8 pb-16 md:pb-24">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-white/60 font-headline text-2xl tracking-[0.4em] mb-2">
              LIMITED EDITION
            </h2>
            <h1 className="text-white font-headline text-8xl md:text-[12rem] leading-[0.85] font-bold uppercase tracking-tighter mb-8 italic">
              GAME DAY
              <br />
              COLLECTION
            </h1>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <button className="bg-white text-black px-12 py-4 font-headline text-2xl font-bold tracking-widest hover:bg-gray-200 transition-all uppercase">
                SHOP THE LOOK
              </button>
              <p className="text-white/80 max-w-md font-body text-sm leading-relaxed uppercase tracking-wider">
                Engineered for those who thrive in the spotlight. Highsman
                apparel blends athletic heritage with premium street culture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BRAND STRIP ===== */}
      <section className="bg-white py-6 overflow-hidden">
        <div className="flex whitespace-nowrap">
          <div className="flex space-x-12 px-4 animate-marquee">
            {[
              'SPARK GREATNESS',
              '/',
              'HIGHSMAN ELITE',
              '/',
              'GAME DAY READY',
              '/',
              'SPARK GREATNESS',
              '/',
              'HIGHSMAN ELITE',
            ].map((text, i) => (
              <span
                key={i}
                className="text-black font-headline text-3xl font-bold tracking-widest uppercase italic"
              >
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRODUCT GRID ===== */}
      <section className="max-w-7xl mx-auto px-8 py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-20 gap-x-8">
          {/* First 3 products */}
          {PRODUCTS.slice(0, 3).map((product) => (
            <ProductCard key={product.name} {...product} />
          ))}

          {/* Editorial Break */}
          <div className="col-span-1 md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8 my-12">
            <div className="h-[600px] overflow-hidden">
              <img
                alt="Lifestyle editorial"
                className="w-full h-full object-cover grayscale"
                src="/images/apparel-lifestyle-2.jpg"
              />
            </div>
            <div className="flex flex-col justify-center items-start p-12 bg-white text-black">
              <span className="font-headline text-2xl tracking-[0.4em] mb-4 text-gray-500 uppercase">
                THE MANIFESTO
              </span>
              <h2 className="font-headline text-6xl font-bold leading-tight mb-6 uppercase">
                BUILT FOR THE RECOVERY AS MUCH AS THE RUSH.
              </h2>
              <p className="font-body text-lg mb-8 max-w-sm">
                Every piece is designed with elite craftsmanship to ensure you
                look as good off the clock as you do on it.
              </p>
              <button className="border-2 border-black px-10 py-3 font-headline text-2xl font-bold tracking-widest hover:bg-black hover:text-white transition-all uppercase">
                OUR STORY
              </button>
            </div>
          </div>

          {/* Last 3 products */}
          {PRODUCTS.slice(3).map((product) => (
            <ProductCard key={product.name} {...product} />
          ))}
        </div>
      </section>

      {/* ===== SIGNATURE QUOTE ===== */}
      <section className="w-full bg-white text-black py-32 px-8 overflow-hidden relative">
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <span className="font-headline text-4xl font-bold tracking-[0.5em] mb-8 block uppercase">
            SPARK GREATNESS.
          </span>
          <p className="font-headline text-6xl md:text-9xl font-bold leading-[0.9] uppercase italic tracking-tighter">
            THE GRIND ISN&apos;T
            <br />
            GIVEN. IT&apos;S EARNED.
          </p>
        </div>
        <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none">
          <span className="font-headline text-[30rem] font-bold leading-none">
            H
          </span>
        </div>
      </section>
    </>
  );
}

function ProductCard({
  name,
  material,
  price,
  badge,
}: {
  name: string;
  material: string;
  price: string;
  badge?: string;
}) {
  return (
    <div className="group">
      <div className="aspect-[4/5] bg-neutral-900 overflow-hidden relative mb-6">
        <div className="w-full h-full bg-surface-container-high grayscale-hover transition-transform duration-700 group-hover:scale-105" />
        {badge && (
          <div className="absolute top-4 left-4 bg-black text-white px-3 py-1 font-headline text-lg tracking-widest">
            {badge}
          </div>
        )}
      </div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-headline text-3xl font-bold uppercase tracking-tight">
            {name}
          </h3>
          <p className="text-white/50 font-body text-xs uppercase tracking-widest">
            {material}
          </p>
        </div>
        <span className="font-headline text-2xl font-bold">{price}</span>
      </div>
      <button className="w-full border border-white/20 hover:bg-white hover:text-black transition-all py-3 font-headline text-xl tracking-[0.2em] uppercase">
        ADD TO CART
      </button>
    </div>
  );
}
