import type {MetaFunction} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Cart'}];
};

export default function Cart() {
  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center px-8">
      <span className="material-symbols-outlined text-8xl text-on-surface-variant mb-8">
        shopping_cart
      </span>
      <h1 className="font-headline text-8xl font-bold uppercase mb-4">
        YOUR CART
      </h1>
      <p className="text-on-surface-variant font-body text-xl uppercase tracking-widest mb-12">
        Your cart is currently empty.
      </p>
      <a
        href="/"
        className="bg-primary text-on-primary px-16 py-5 font-headline text-3xl font-bold uppercase hover:bg-primary-container transition-colors"
      >
        CONTINUE SHOPPING
      </a>
    </section>
  );
}
