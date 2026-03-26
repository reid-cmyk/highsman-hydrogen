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
      <section className="relative h-[90vh] flex items-end px-12 pb-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            alt="NFL running back in action - Highsman"
            className="w-full h-full object-cover grayscale brightness-50"
            src={IMAGES.heroHomepage}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-transparent" />
        </div>
        <div className="relative z-10 max-w-5xl">
          <h1 className="font-headline text-[10rem] md:text-[14rem] leading-[0.8] font-bold uppercase italic tracking-tighter">
            spark greatness
          </h1>
          <p className="font-body text-xl mt-8 max-w-xl text-on-surface-variant uppercase tracking-[0.2em] leading-tight">
            Premium cannabis for the high-performance lifestyle, founded by NFL
            Legend Ricky Williams.
          </p>
          <div className="mt-12 flex gap-4">
            <Link
              to="/our-strains"
              className="bg-primary text-on-primary px-16 py-5 font-headline text-3xl font-bold uppercase hover:bg-primary-container transition-colors"
            >
              SHOP NOW
            </Link>
          </div>
        </div>
      </section>