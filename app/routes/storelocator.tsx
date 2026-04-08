import {useEffect} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [
    {title: 'Find a Store | HIGHSMAN'},
    {
      name: 'description',
      content:
        'Find an authorized Highsman retailer near you. Locate Hit Sticks, Pre-Rolls, and Ground Game at a dispensary in your area.',
    },
    {property: 'og:title', content: 'Find a Store | HIGHSMAN'},
    {
      property: 'og:description',
      content:
        'Find an authorized Highsman retailer near you. Hit Sticks, Pre-Rolls, and Ground Game at a dispensary near you.',
    },
    {property: 'og:url', content: 'https://highsman.com/storelocator'},
  ];
};

declare global {
  interface Window {
    hoodieEmbedWtbV2: (
      widgetId: string,
      divId: string,
      cookie: string,
    ) => string;
  }
}

export default function StoreLocator() {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://askhoodie.com/assets/askhoodie.host.js';
    s.async = true;
    s.onload = () => {
      if (typeof window.hoodieEmbedWtbV2 === 'function') {
        document.cookie = window.hoodieEmbedWtbV2(
          'ef307616-7713-40b1-9980-dc29c0db39b3',
          'askhoodieDiv',
          document.cookie,
        );
      }
    };
    document.body.appendChild(s);
    return () => {
      if (document.body.contains(s)) document.body.removeChild(s);
    };
  }, []);

  return (
    <main>
      {/* Hero */}
      <section className="bg-black py-16 md:py-24 border-b border-white/10">
        <div className="container mx-auto px-4 md:px-12">
          <p className="font-body text-[#A9ACAF] text-sm uppercase tracking-widest mb-4">
            Highsman by Ricky Williams
          </p>
          <h1 className="font-headline text-5xl md:text-[8rem] font-bold uppercase leading-[0.85] text-white break-words mb-6">
            Find Us Near You
          </h1>
          <p className="font-body text-[#A9ACAF] text-lg uppercase tracking-widest">
            Locate an authorized Highsman retailer near you.
          </p>
        </div>
      </section>

      {/* Store Locator Widget */}
      <section className="py-12 md:py-20 bg-black min-h-[600px]">
        <div className="container mx-auto px-4 md:px-12">
          <div id="askhoodieDiv" />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-black border-t border-white/10 py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="font-headline text-2xl md:text-4xl font-bold uppercase text-white">
              Don&apos;t see your city yet?
            </h2>
            <p className="font-body text-[#A9ACAF] text-base uppercase tracking-wider mt-2">
              We&apos;re expanding fast. New retailers added weekly.
            </p>
          </div>
          <a
            href="/contact"
            className="inline-block bg-white text-black font-headline font-bold uppercase text-sm tracking-widest px-8 py-4 hover:bg-[#A9ACAF] transition-colors"
          >
            Contact Us
          </a>
        </div>
      </section>
    </main>
  );
}
