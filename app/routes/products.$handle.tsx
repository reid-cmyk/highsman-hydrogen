import {json, type LoaderFunctionArgs, type MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData} from '@remix-run/react';
import {Image, Money, CartForm} from '@shopify/hydrogen';
import {useState} from 'react';

export const meta: MetaFunction<typeof loader> = ({data}) => {
  return [{title: `HIGHSMAN | ${data?.product?.title ?? 'Product'}`}];
};

export async function loader({params, context}: LoaderFunctionArgs) {
  const {handle} = params;
  if (!handle) throw new Response('Not Found', {status: 404});

  const {product} = await context.storefront.query(PRODUCT_QUERY, {
    variables: {handle},
  });
  if (!product) throw new Response('Not Found', {status: 404});
  return json({product});
}

export default function Product() {
  const {product} = useLoaderData<typeof loader>();
  const [selectedVariant, setSelectedVariant] = useState(
    product.variants.nodes[0],
  );
  const [selectedImage, setSelectedImage] = useState(0);
  const images = product.images.nodes;

  return (
    <section className="max-w-7xl mx-auto px-6 md:px-8 py-8 md:py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
        {/* Image Gallery */}
        <div>
          <div className="aspect-square bg-neutral-100 overflow-hidden mb-4">
            {images[selectedImage] ? (
              <Image
                data={images[selectedImage]}
                aspectRatio="1/1"
                sizes="(min-width: 768px) 50vw, 100vw"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
                <span className="text-neutral-400 font-headline text-2xl">NO IMAGE</span>
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(0, 4).map((img: any, i: number) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(i)}
                  className={`aspect-square bg-neutral-100 overflow-hidden border-2 ${
                    i === selectedImage ? 'border-white' : 'border-transparent'
                  }`}
                >
                  <Image
                    data={img}
                    aspectRatio="1/1"
                    sizes="12vw"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex flex-col justify-center">
          <h1 className="font-headline text-3xl md:text-6xl font-bold uppercase tracking-tight mb-4">
            {product.title}
          </h1>

          <div className="flex items-center gap-3 mb-8">
            <span className="font-headline text-2xl md:text-4xl font-bold">
              <Money data={selectedVariant.price} />
            </span>
            {selectedVariant.compareAtPrice &&
              parseFloat(selectedVariant.compareAtPrice.amount) >
                parseFloat(selectedVariant.price.amount) && (
                <span className="font-headline text-xl text-white/40 line-through">
                  <Money data={selectedVariant.compareAtPrice} />
                </span>
              )}
          </div>

          {/* Variant Selector - all variants selectable for dropship */}
          {product.variants.nodes.length > 1 && (
            <div className="mb-8">
              <h3 className="font-headline text-sm uppercase tracking-[0.3em] text-white/60 mb-3">
                {product.options[0]?.name || 'Size'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {product.variants.nodes.map((variant: any) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`px-4 py-2 border font-headline text-sm uppercase tracking-widest transition-all ${
                      variant.id === selectedVariant.id
                        ? 'bg-white text-black border-white'
                        : 'border-white/30 hover:border-white'
                    }`}
                  >
                    {variant.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add to Cart - always enabled for dropship products */}
          <CartForm
            route="/cart"
            action={CartForm.ACTIONS.LinesAdd}
            inputs={{
              lines: [
                {
                  merchandiseId: selectedVariant.id,
                  quantity: 1,
                },
              ],
            }}
          >
            <button
              type="submit"
              className="w-full py-4 font-headline text-xl md:text-2xl font-bold uppercase tracking-[0.2em] transition-all bg-white text-black hover:bg-gray-200"
            >
              ADD TO CART
            </button>
          </CartForm>

          {/* Description */}
          {product.description && (
            <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="font-headline text-sm uppercase tracking-[0.3em] text-white/60 mb-3">
                DESCRIPTION
              </h3>
              <p className="font-body text-white/70 leading-relaxed">
                {product.description}
              </p>
            </div>
          )}

          {/* Back link */}
          <a
            href="/apparel"
            className="mt-8 inline-flex items-center gap-2 text-white/50 hover:text-white font-headline text-sm uppercase tracking-widest transition-colors"
          >
            &larr; BACK TO SHOP
          </a>
        </div>
      </div>
    </section>
  );
}

const PRODUCT_QUERY = `#graphql
  query Product($handle: String!) {
    product(handle: $handle) {
      id
      title
      handle
      description
      availableForSale
      options {
        name
        values
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      images(first: 10) {
        nodes {
          id
          url
          altText
          width
          height
        }
      }
      variants(first: 50) {
        nodes {
          id
          title
          availableForSale
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;
