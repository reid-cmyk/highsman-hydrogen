import {json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher} from '@remix-run/react';
import {CartForm, Image, Money} from '@shopify/hydrogen';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Cart'}];
};

export async function action({request, context}: ActionFunctionArgs) {
  const {cart} = context;
  const formData = await request.formData();
  const {action, inputs} = CartForm.getFormInput(formData);

  let result: any;

  switch (action) {
    case CartForm.ACTIONS.LinesAdd:
      result = await cart.addLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesUpdate:
      result = await cart.updateLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesRemove:
      result = await cart.removeLines(inputs.lineIds);
      break;
    default:
      result = {cart: null, errors: [{message: 'Invalid action'}]};
  }

  const cartId = result.cart?.id;
  const headers = cartId ? cart.setCartId(cartId) : new Headers();

  // After adding from a product page, redirect to /cart so the customer
  // lands on the populated cart with explicit Checkout / Continue Shopping
  // options. Update and Remove actions stay where they are (typically the
  // /cart page itself) and let the route's loader revalidate in place.
  if (action === CartForm.ACTIONS.LinesAdd) {
    return redirect('/cart', {headers});
  }

  return json(
    {cart: result.cart, errors: result.errors},
    {status: 200, headers},
  );
}

export async function loader({context}: LoaderFunctionArgs) {
  const cart = await context.cart.get();
  return json({cart});
}

export default function Cart() {
  const {cart} = useLoaderData<typeof loader>();
  // Hydrogen's default cart query fragment returns lines as a GraphQL
  // connection (edges/node), not the newer `nodes` shortcut. Support both
  // shapes so this works regardless of which fragment is configured.
  const lines =
    cart?.lines?.nodes ??
    cart?.lines?.edges?.map((edge: any) => edge.node) ??
    [];
  const isEmpty = lines.length === 0;

  if (isEmpty) {
    return (
      <section className="min-h-[60vh] flex flex-col items-center justify-center px-6 md:px-8">
        <span className="material-symbols-outlined text-6xl md:text-8xl text-on-surface-variant mb-8">
          shopping_cart
        </span>
        <h1 className="font-headline text-4xl md:text-8xl font-bold uppercase mb-4 text-center">
          YOUR CART
        </h1>
        <p className="text-on-surface-variant font-body text-lg md:text-xl uppercase tracking-widest mb-12">
          Your cart is currently empty.
        </p>
        <a
          href="/apparel"
          className="bg-white text-black px-12 py-4 font-headline text-xl md:text-2xl font-bold uppercase hover:bg-gray-200 transition-all tracking-widest"
        >
          SHOP APPAREL
        </a>
      </section>
    );
  }

  const subtotal = cart?.cost?.subtotalAmount;
  // Append return_to so Shopify's hosted checkout knows where to send the
  // customer when they click "Continue Shopping" mid-checkout, and where to
  // redirect after a completed purchase. Without this, Shopify defaults to
  // the Online Store channel's primary domain (the raw myshopify subdomain),
  // which lives on a different host than the Hydrogen storefront.
  // Experimental — Shopify documents return_url for post-purchase redirects;
  // mid-checkout Continue Shopping behavior is undocumented. If this turns
  // out to do nothing, it's still a no-op (Shopify ignores unknown params).
  const baseCheckoutUrl = cart?.checkoutUrl;
  const checkoutUrl = baseCheckoutUrl
    ? `${baseCheckoutUrl}${baseCheckoutUrl.includes('?') ? '&' : '?'}return_to=${encodeURIComponent('https://highsman.com/apparel')}`
    : null;

  return (
    <section className="max-w-4xl mx-auto px-6 md:px-8 py-8 md:py-16">
      <h1 className="font-headline text-4xl md:text-6xl font-bold uppercase mb-8 md:mb-12 tracking-tight">
        YOUR CART
      </h1>

      <div className="divide-y divide-white/10">
        {lines.map((line: any) => (
          <CartLineItem key={line.id} line={line} />
        ))}
      </div>

      {/* Cart Summary */}
      <div className="mt-8 md:mt-12 border-t border-white/20 pt-8">
        <div className="flex justify-between items-center mb-8">
          <span className="font-headline text-2xl uppercase tracking-widest">
            Subtotal
          </span>
          <span className="font-headline text-3xl font-bold">
            {subtotal && <Money data={subtotal} />}
          </span>
        </div>
        <p className="text-white/50 font-body text-sm mb-6 uppercase tracking-wider">
          Shipping and taxes calculated at checkout.
        </p>
        <div className="flex flex-col md:flex-row gap-4">
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              className="flex-1 bg-white text-black text-center py-4 font-headline text-xl font-bold uppercase tracking-[0.2em] hover:bg-gray-200 transition-all"
            >
              CHECKOUT
            </a>
          )}
          <a
            href="/apparel"
            className="flex-1 border border-white/30 text-center py-4 font-headline text-xl font-bold uppercase tracking-[0.2em] hover:bg-white/5 transition-all"
          >
            CONTINUE SHOPPING
          </a>
        </div>
      </div>
    </section>
  );
}

function CartLineItem({line}: {line: any}) {
  const {merchandise, quantity, cost} = line;
  const product = merchandise.product;
  const image = merchandise.image;

  return (
    <div className="flex gap-4 md:gap-6 py-6">
      {/* Image */}
      <a href={`/products/${product.handle}`} className="w-24 md:w-32 flex-shrink-0">
        <div className="aspect-square bg-neutral-100 overflow-hidden">
          {image && (
            <Image
              data={image}
              aspectRatio="1/1"
              sizes="128px"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      </a>

      {/* Details */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <a href={`/products/${product.handle}`}>
            <h3 className="font-headline text-lg md:text-xl font-bold uppercase tracking-tight hover:text-white/70 transition-colors">
              {product.title}
            </h3>
          </a>
          <p className="text-white/50 font-body text-sm uppercase tracking-widest mt-1">
            {merchandise.title !== 'Default Title' ? merchandise.title : ''}
          </p>
        </div>

        <div className="flex items-center justify-between mt-4">
          {/* Quantity Controls */}
          <div className="flex items-center gap-1">
            <UpdateCartButton lines={[{id: line.id, quantity: Math.max(0, quantity - 1)}]}>
              <span className="w-8 h-8 flex items-center justify-center border border-white/20 hover:bg-white/10 text-lg">
                &minus;
              </span>
            </UpdateCartButton>
            <span className="w-10 text-center font-headline text-lg">
              {quantity}
            </span>
            <UpdateCartButton lines={[{id: line.id, quantity: quantity + 1}]}>
              <span className="w-8 h-8 flex items-center justify-center border border-white/20 hover:bg-white/10 text-lg">
                +
              </span>
            </UpdateCartButton>
          </div>

          {/* Price */}
          <span className="font-headline text-lg md:text-xl font-bold">
            <Money data={cost.totalAmount} />
          </span>
        </div>
      </div>

      {/* Remove */}
      <RemoveCartButton lineIds={[line.id]} />
    </div>
  );
}

function UpdateCartButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: {id: string; quantity: number}[];
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      <button type="submit">{children}</button>
    </CartForm>
  );
}

function RemoveCartButton({lineIds}: {lineIds: string[]}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button
        type="submit"
        className="text-white/30 hover:text-white/70 transition-colors font-headline text-xs uppercase tracking-widest"
      >
        &times;
      </button>
    </CartForm>
  );
}
