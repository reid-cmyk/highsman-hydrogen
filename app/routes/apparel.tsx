import {json, type LoaderFunctionArgs, type MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, Link} from '@remix-run/react';
import {Image, Money} from '@shopify/hydrogen';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Apparel - Shop The Collection'}];
};

export async function loader({context}: LoaderFunctionArgs) {
  const {products} = await context.storefront.query(PRODUCTS_QUERY);
  return json({products: products.nodes});
}

export default function Apparel() {
  const {products} = useLoaderData<typeof loader>();

  return (
    <>
      
{/* ===== HERO SECTION ===== */}
      <section className="relative h-[60vh] md:h-[800px] w-full overflow-hidden flex items-end">
        <div className="absolute inset-0 z-0">
          <img
            alt="Highsman Apparel Collection"
            className="w-full h-full object-cover grayscale brightness-75"
            src={IMAGES.apparelHero}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-transparent opacity-80" />
        </div>
        <div className="relative z-10 w-full px-6 md:px-8 pb-12 md:pb-24">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-white/60 font-headline text-lg md:text-2xl tracking-[0.4em] mb-2">
              OFFICIAL MERCH
            </h2>
            <h1 className="text-white font-headline text-4xl md:text-[10rem] leading-[0.85] font-bold uppercase tracking-tighter mb-6 italic">
              SHOP THE <br /> COLLECTION
            </h1>
            <p className="text-white/80 max-w-md font-body text-sm leading-relaxed uppercase tracking-wider">
              Highsman apparel blends athletic heritage with premium street
              culture. Rep the brand on and off the field.
            </p>
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
                className="text-black font-headline text-xl md:text-3xl font-bold tracking-widest uppercase italic"
              >
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRODUCT GRID ===== */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 py-16 md:py-24">
                  {(() => {
            const categories = [
              {
                name: "Headwear",
                filter: (p) => /hat|snapback|trucker|beanie|visor|cap|pom-pom|dad hat/i.test(p.title),
              },
              {
                name: "T-Shirts",
                filter: (p) => /tee|t-shirt|polo/i.test(p.title) && !/hoodie|jacket|jersey/i.test(p.title),
              },
              {
                name: "Hoodies & Outerwear",
                filter: (p) => /hoodie|pullover|zip up|jacket|bomber|varsity|letterman/i.test(p.title),
              },
              {
                name: "Jerseys",
                filter: (p) => /jersey/i.test(p.title),
              },
              {
                name: "Bottoms",
                filter: (p) => /shorts|joggers|pants|fleece shorts|mesh shorts/i.test(p.title),
              },
              {
                name: "Accessories",
                filter: (p) => /sock|towel|tray|pelican|case/i.test(p.title),
              },
            ];

            const categorized = categories.map(cat => ({
              ...cat,
              products: products.filter(cat.filter),
            })).filter(cat => cat.products.length > 0);

            const categorizedIds = new Set(categorized.flatMap(cat => cat.products.map(p => p.id)));
            const uncategorized = products.filter(p => !categorizedIds.has(p.id));

            return (
              <>
                {categorized.map((cat) => (
                  <div key={cat.name} className="mb-16">
                    <div className="flex justify-between items-baseline mb-8 border-b border-white/20 pb-4">
                      <h2 className="font-headline text-2xl md:text-4xl font-black uppercase tracking-tighter">
                        {cat.name}
                      </h2>
                      <span className="font-headline text-sm text-white/50 tracking-widest">
                        {cat.products.length} {cat.products.length === 1 ? "ITEM" : "ITEMS"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {cat.products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </div>
                ))}
                {uncategorized.length > 0 && (
                  <div className="mb-16">
                    <div className="flex justify-between items-baseline mb-8 border-b border-white/20 pb-4">
                      <h2 className="font-headline text-2xl md:text-4xl font-black uppercase tracking-tighter">
                        More Products
                      </h2>
                      <span className="font-headline text-sm text-white/50 tracking-widest">
                        {uncategorized.length} {uncategorized.length === 1 ? "ITEM" : "ITEMS"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {uncategorized.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none">
          <span className="font-headline text-[30rem] font-bold leading-none">
            H
          </span>
        </div>
      </section>
    </>
  );
}

function ProductCard({product}: {product: any}) {
  const image = product.images.nodes[0];
  const price = product.priceRange.minVariantPrice;
  const comparePrice = product.compareAtPriceRange?.minVariantPrice;
  const isOnSale =
    comparePrice &&
    parseFloat(comparePrice.amount) > parseFloat(price.amount);

  return (
    <Link to={`/products/${product.handle}`} className="group block">
      <div className="aspect-[3/4] bg-neutral-100 overflow-hidden relative mb-4">
        {image ? (
          <Image
            data={image}
           
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
            <span className="text-neutral-400 font-headline text-xl">
              NO IMAGE
            </span>
          </div>
        )}
        {isOnSale && (
          <div className="absolute top-3 left-3 bg-red-600 text-white px-3 py-1 font-headline text-xs tracking-widest">
            SALE
          </div>
        )}
      </div>
      <h3 className="font-headline text-sm md:text-lg font-bold uppercase tracking-tight mb-1 group-hover:text-white/70 transition-colors">
        {product.title}
      </h3>
      <div className="flex items-center gap-2">
        <span className="font-headline text-sm md:text-lg">
          <Money data={price} />
        </span>
        {isOnSale && (
          <span className="font-headline text-sm md:text-base text-white/40 line-through">
            <Money data={comparePrice} />
          </span>
        )}
      </div>
    </Link>
  );
}

const PRODUCTS_QUERY = `#graphql
  query AllProducts {
    products(first: 50, sortKey: BEST_SELLING) {
      nodes {
        id
        title
      productType
        handle
        availableForSale
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 1) {
          nodes {
            id
            url
            altText
            width
            height
          }
        }
      }
    }
  }
`;
