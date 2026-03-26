import type {MetaFunction} from '@shopify/remix-oxygen';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | 1.2G Triple Infused Pre-Rolls'}];
};

export default function PreRolls() {
  return (
    <>
      {/* ===== HERO: EDITORIAL SPLIT ===== */}
      <section className="relative w-full min-h-[921px] grid grid-cols-1 md:grid-cols-12 bg-surface">