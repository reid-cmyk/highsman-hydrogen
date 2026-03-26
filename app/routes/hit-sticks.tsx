import type {MetaFunction} from '@shopify/remix-oxygen';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Hit Sticks'}];
};

export default function HitSticks() {
  return (
    <>
      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[921px] flex flex-col md:flex-row items-center overflow-hidden px-8 md:px-16 py-12 gap-12">
        {/* Background Text Aesthetic */}
        <div className="absolute top-20 -left-10 opacity-5 select-none pointer-events-none hidden lg:block">
          <h2 className="font-headline text-[25rem] leading-none font-bold uppercase">
            HIT STICK
          </h2>
        </div>
        