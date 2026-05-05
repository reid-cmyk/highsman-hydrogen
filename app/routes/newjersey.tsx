import {useState, useEffect} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';
import {IMAGES} from '~/lib/images';

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE — hide global consumer header/footer (internal page)
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ProductFilter = 'all' | 'hit-sticks' | 'ground-game' | 'triple-threat';

interface AssetItem {
  id: string;
  name: string;
  product: 'hit-sticks' | 'ground-game' | 'triple-threat' | 'brand';
  dimensions: string;
  format: string;
  ratio: string; // CSS aspect-ratio value e.g. '1/1', '9/16', '2/1', '8/1'
  isNew?: boolean;
  src: string; // empty string = placeholder shown; fill in URL when asset arrives
}

// ─────────────────────────────────────────────────────────────────────────────
// Image slots
// Drop URLs here as assets arrive from Google Drive.
// Existing product images re-use constants already in ~/lib/images.
// ─────────────────────────────────────────────────────────────────────────────

const NJ_IMAGES = {
  // ── Hero product tiles ─────────────────────────────────────────────────────
  hitSticksHero:     '',                        // TODO: add IMAGES.hitStick once confirmed
  groundGameHero:    IMAGES.groundGameProduct,  // ✓ exists
  tripleThreatsHero: IMAGES.preRollsLineup,     // ✓ exists

  // ── Hit Sticks: Menu Images ────────────────────────────────────────────────
  hitSticksMenuWhite:    '',  // TODO
  hitSticksMenuBlack:    '',  // TODO

  // ── Hit Sticks: Social Media ───────────────────────────────────────────────
  hitSticksSocialSq1:    '',  // TODO — Instagram square, product shot
  hitSticksSocialSq2:    '',  // TODO — Instagram square, lifestyle
  hitSticksSocialStory1: '',  // TODO — Instagram/TikTok story, product shot
  hitSticksSocialStory2: '',  // TODO — Instagram/TikTok story, promotion
  hitSticksFb1:          '',  // TODO — Facebook post, product feature
  hitSticksFb2:          '',  // TODO — Facebook post, in-store promo
  hitSticksTt1:          '',  // TODO — TikTok cover, product shot
  hitSticksTt2:          '',  // TODO — TikTok cover, lifestyle

  // ── Hit Sticks: Dutchie Banners ────────────────────────────────────────────
  hitSticksDutchie1080:  '',  // TODO — 1080×540
  hitSticksDutchie1800:  '',  // TODO — 1800×900

  // ── Hit Sticks: Email Banners ──────────────────────────────────────────────
  hitSticksEmail1:       '',  // TODO — product feature
  hitSticksEmail2:       '',  // TODO — promotional

  // ── Hit Sticks: Digital Ad Sizes ──────────────────────────────────────────
  hitSticksAd728x90:     '',  // TODO — leaderboard
  hitSticksAd300x250:    '',  // TODO — medium rectangle
  hitSticksAd300x600:    '',  // TODO — half page
  hitSticksAd160x600:    '',  // TODO — wide skyscraper

  // ── Ground Game: Menu Images ── ARRIVING FROM GOOGLE DRIVE ────────────────
  groundGameMenuWhite:   '',  // TODO — arriving
  groundGameMenuBlack:   '',  // TODO — arriving

  // ── Ground Game: Social Media ── ARRIVING FROM GOOGLE DRIVE ───────────────
  groundGameSocialSq1:   '',  // TODO — arriving
  groundGameSocialSq2:   '',  // TODO — arriving
  groundGameSocialStory: '',  // TODO — arriving

  // ── Ground Game: Dutchie Banners ──────────────────────────────────────────
  groundGameDutchie1080: '',  // TODO
  groundGameDutchie1800: '',  // TODO — added April 7 (new)

  // ── Ground Game: Email + Ads ───────────────────────────────────────────────
  groundGameEmail:       '',  // TODO
  groundGameAd728x90:    '',  // TODO
  groundGameAd300x250:   '',  // TODO

  // ── Triple Threat (Pre-Rolls): Menu Images ─────────────────────────────────
  tripleThreatsMenu:     '',  // TODO

  // ── Triple Threat: Social Media ── ARRIVING FROM GOOGLE DRIVE ────────────
  tripleThresSocialSq1:  '',  // TODO — new (added April 7)
  tripleThresSocialSq2:  '',  // TODO — new (added April 7)
  tripleThresSocialSq3:  '',  // TODO — new (added April 7)

  // ── Triple Threat: Dutchie Banners ────────────────────────────────────────
  tripleThresDutchie1080: '',  // TODO
  tripleThresDutchie1800: '',  // TODO

  // ── Triple Threat: Email + Ads ────────────────────────────────────────────
  tripleThresEmail:       '',  // TODO
  tripleThresAd728x90:    '',  // TODO
  tripleThresAd300x250:   '',  // TODO
};

// ─────────────────────────────────────────────────────────────────────────────
// Product config (colors + display names)
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_CONFIG = {
  'hit-sticks':    {color: '#F5E400', label: 'Hit Sticks',    gradFrom: '#1a1500'},
  'ground-game':   {color: '#4CAF50', label: 'Ground Game',   gradFrom: '#001a05'},
  'triple-threat': {color: '#CE93D8', label: 'Triple Threat', gradFrom: '#0f001a'},
  'brand':         {color: '#A9ACAF', label: 'Brand',         gradFrom: '#111111'},
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Nav sections
// ─────────────────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {id: 'wholesale',       label: 'Wholesale',        count: 2},
  {id: 'menu-images',     label: 'Menu Images',      count: 5},
  {id: 'merchandising',   label: 'Merchandising',    count: 2},
  {id: 'social-media',    label: 'Social Media',     count: 24},
  {id: 'dutchie-banners', label: 'Dutchie Banners',  count: 8},
  {id: 'email-banners',   label: 'Email Banners',    count: 4},
  {id: 'digital-ads',     label: 'Digital Menu Ads', count: 16},
  {id: 'launch',          label: 'Launch',           count: 3},
  {id: 'brand-assets',    label: 'Brand Assets',     count: 3},
];

// ─────────────────────────────────────────────────────────────────────────────
// Asset data
// ─────────────────────────────────────────────────────────────────────────────

const MENU_ASSETS: AssetItem[] = [
  {id: 'hs-m1', name: 'Hit Sticks — Menu Image — White Background',    product: 'hit-sticks',    dimensions: '800×800', format: 'PNG', ratio: '1/1', src: NJ_IMAGES.hitSticksMenuWhite},
  {id: 'hs-m2', name: 'Hit Sticks — Menu Image — Black Background',    product: 'hit-sticks',    dimensions: '800×800', format: 'PNG', ratio: '1/1', src: NJ_IMAGES.hitSticksMenuBlack},
  {id: 'gg-m1', name: 'Ground Game — Menu Image — White Background',   product: 'ground-game',   dimensions: '800×800', format: 'PNG', ratio: '1/1', src: NJ_IMAGES.groundGameMenuWhite},
  {id: 'gg-m2', name: 'Ground Game — Menu Image — Black Background',   product: 'ground-game',   dimensions: '800×800', format: 'PNG', ratio: '1/1', src: NJ_IMAGES.groundGameMenuBlack},
  {id: 'tt-m1', name: 'Triple Threat — Menu Image — Multi-SKU Lineup', product: 'triple-threat', dimensions: '800×800', format: 'PNG', ratio: '1/1', src: NJ_IMAGES.tripleThreatsMenu},
];

const SOCIAL_ASSETS: AssetItem[] = [
  // Hit Sticks (8)
  {id: 'hs-s1', name: 'Hit Sticks — Instagram Square — Product Shot',  product: 'hit-sticks', dimensions: '1080×1080', format: 'PNG', ratio: '1/1',  src: NJ_IMAGES.hitSticksSocialSq1},
  {id: 'hs-s2', name: 'Hit Sticks — Instagram Square — Lifestyle',     product: 'hit-sticks', dimensions: '1080×1080', format: 'PNG', ratio: '1/1',  src: NJ_IMAGES.hitSticksSocialSq2},
  {id: 'hs-s3', name: 'Hit Sticks — Instagram Story — Product Shot',   product: 'hit-sticks', dimensions: '1080×1920', format: 'PNG', ratio: '9/16', src: NJ_IMAGES.hitSticksSocialStory1},
  {id: 'hs-s4', name: 'Hit Sticks — Instagram Story — Promotion',      product: 'hit-sticks', dimensions: '1080×1920', format: 'PNG', ratio: '9/16', src: NJ_IMAGES.hitSticksSocialStory2},
  {id: 'hs-s5', name: 'Hit Sticks — Facebook Post — Product Feature',  product: 'hit-sticks', dimensions: '1200×630',  format: 'PNG', ratio: '16/9', src: NJ_IMAGES.hitSticksFb1},
  {id: 'hs-s6', name: 'Hit Sticks — Facebook Post — In-Store Promo',   product: 'hit-sticks', dimensions: '1200×630',  format: 'PNG', ratio: '16/9', src: NJ_IMAGES.hitSticksFb2},
  {id: 'hs-s7', name: 'Hit Sticks — TikTok Cover — Product Shot',      product: 'hit-sticks', dimensions: '1080×1920', format: 'PNG', ratio: '9/16', src: NJ_IMAGES.hitSticksTt1},
  {id: 'hs-s8', name: 'Hit Sticks — TikTok Cover — Lifestyle',         product: 'hit-sticks', dimensions: '1080×1920', format: 'PNG', ratio: '9/16', src: NJ_IMAGES.hitSticksTt2},
  // Ground Game (3 — arriving from Google Drive)
  {id: 'gg-s1', name: 'Ground Game — Instagram Square — Product Shot', product: 'ground-game', dimensions: '1080×1080', format: 'PNG', ratio: '1/1',  src: NJ_IMAGES.groundGameSocialSq1},
  {id: 'gg-s2', name: 'Ground Game — Instagram Square — Lifestyle',    product: 'ground-game', dimensions: '1080×1080', format: 'PNG', ratio: '1/1',  src: NJ_IMAGES.groundGameSocialSq2},
  {id: 'gg-s3', name: 'Ground Game — Instagram Story — Product Shot',  product: 'ground-game', dimensions: '1080×1920', format: 'PNG', ratio: '9/16', src: NJ_IMAGES.groundGameSocialStory},
  // Triple Threat (3 new — arriving from Google Drive)
  {id: 'tt-s1', name: 'Triple Threat — Instagram Square — Product Shot', product: 'triple-threat', dimensions: '1080×1080', format: 'PNG', ratio: '1/1', isNew: true, src: NJ_IMAGES.tripleThresSocialSq1},
  {id: 'tt-s2', name: 'Triple Threat — Instagram Square — Lifestyle',    product: 'triple-threat', dimensions: '1080×1080', format: 'PNG', ratio: '1/1', isNew: true, src: NJ_IMAGES.tripleThresSocialSq2},
  {id: 'tt-s3', name: 'Triple Threat — Instagram Square — Multi-SKU',    product: 'triple-threat', dimensions: '1080×1080', format: 'PNG', ratio: '1/1', isNew: true, src: NJ_IMAGES.tripleThresSocialSq3},
];

const DUTCHIE_ASSETS: AssetItem[] = [
  {id: 'hs-d1', name: 'Hit Sticks — Dutchie Banner — 1080×540',   product: 'hit-sticks',    dimensions: '1080×540', format: 'PNG', ratio: '2/1', src: NJ_IMAGES.hitSticksDutchie1080},
  {id: 'hs-d2', name: 'Hit Sticks — Dutchie Banner — 1800×900',   product: 'hit-sticks',    dimensions: '1800×900', format: 'PNG', ratio: '2/1', src: NJ_IMAGES.hitSticksDutchie1800},
  {id: 'gg-d1', name: 'Ground Game — Dutchie Banner — 1080×540',  product: 'ground-game',   dimensions: '1080×540', format: 'PNG', ratio: '2/1', src: NJ_IMAGES.groundGameDutchie1080},
  {id: 'gg-d2', name: 'Ground Game — Dutchie Banner — 1800×900',  product: 'ground-game',   dimensions: '1800×900', format: 'PNG', ratio: '2/1', isNew: true, src: NJ_IMAGES.groundGameDutchie1800},
  {id: 'tt-d1', name: 'Triple Threat — Dutchie Banner — 1080×540', product: 'triple-threat', dimensions: '1080×540', format: 'PNG', ratio: '2/1', src: NJ_IMAGES.tripleThresDutchie1080},
  {id: 'tt-d2', name: 'Triple Threat — Dutchie Banner — 1800×900', product: 'triple-threat', dimensions: '1800×900', format: 'PNG', ratio: '2/1', src: NJ_IMAGES.tripleThresDutchie1800},
  {id: 'al-d1', name: 'All Products — Dutchie Banner — Brand Awareness 1080×540', product: 'brand', dimensions: '1080×540', format: 'PNG', ratio: '2/1', src: ''},
  {id: 'al-d2', name: 'All Products — Dutchie Banner — Brand Awareness 1800×900', product: 'brand', dimensions: '1800×900', format: 'PNG', ratio: '2/1', src: ''},
];

const EMAIL_ASSETS: AssetItem[] = [
  {id: 'hs-e1', name: 'Hit Sticks — Email Banner — Product Feature', product: 'hit-sticks',    dimensions: '600×200', format: 'PNG', ratio: '3/1', src: NJ_IMAGES.hitSticksEmail1},
  {id: 'hs-e2', name: 'Hit Sticks — Email Banner — Promotional',     product: 'hit-sticks',    dimensions: '600×200', format: 'PNG', ratio: '3/1', src: NJ_IMAGES.hitSticksEmail2},
  {id: 'gg-e1', name: 'Ground Game — Email Banner — Product Feature', product: 'ground-game',  dimensions: '600×200', format: 'PNG', ratio: '3/1', src: NJ_IMAGES.groundGameEmail},
  {id: 'tt-e1', name: 'Triple Threat — Email Banner — Product Feature', product: 'triple-threat', dimensions: '600×200', format: 'PNG', ratio: '3/1', src: NJ_IMAGES.tripleThresEmail},
];

const AD_SIZES = [
  {
    id: 'leaderboard',
    label: '728×90 Leaderboard',
    assets: [
      {id: 'hs-a-728', name: 'Hit Sticks — Digital Ad — 728×90 Leaderboard',       product: 'hit-sticks'    as const, dimensions: '728×90',  format: 'PNG', ratio: '728/90', src: NJ_IMAGES.hitSticksAd728x90},
      {id: 'gg-a-728', name: 'Ground Game — Digital Ad — 728×90 Leaderboard',      product: 'ground-game'   as const, dimensions: '728×90',  format: 'PNG', ratio: '728/90', src: NJ_IMAGES.groundGameAd728x90},
      {id: 'tt-a-728', name: 'Triple Threat — Digital Ad — 728×90 Leaderboard',    product: 'triple-threat' as const, dimensions: '728×90',  format: 'PNG', ratio: '728/90', src: NJ_IMAGES.tripleThresAd728x90},
      {id: 'al-a-728', name: 'All Products — Digital Ad — 728×90 Leaderboard',     product: 'brand'         as const, dimensions: '728×90',  format: 'PNG', ratio: '728/90', src: ''},
    ] as AssetItem[],
  },
  {
    id: 'medium-rect',
    label: '300×250 Medium Rectangle',
    assets: [
      {id: 'hs-a-300', name: 'Hit Sticks — Digital Ad — 300×250 Medium Rectangle',    product: 'hit-sticks'    as const, dimensions: '300×250', format: 'PNG', ratio: '6/5', src: NJ_IMAGES.hitSticksAd300x250},
      {id: 'gg-a-300', name: 'Ground Game — Digital Ad — 300×250 Medium Rectangle',   product: 'ground-game'   as const, dimensions: '300×250', format: 'PNG', ratio: '6/5', src: NJ_IMAGES.groundGameAd300x250},
      {id: 'tt-a-300', name: 'Triple Threat — Digital Ad — 300×250 Medium Rectangle', product: 'triple-threat' as const, dimensions: '300×250', format: 'PNG', ratio: '6/5', src: NJ_IMAGES.tripleThresAd300x250},
      {id: 'al-a-300', name: 'All Products — Digital Ad — 300×250 Medium Rectangle',  product: 'brand'         as const, dimensions: '300×250', format: 'PNG', ratio: '6/5', src: ''},
    ] as AssetItem[],
  },
  {
    id: 'half-page',
    label: '300×600 Half Page',
    assets: [
      {id: 'hs-a-600', name: 'Hit Sticks — Digital Ad — 300×600 Half Page',    product: 'hit-sticks'    as const, dimensions: '300×600', format: 'PNG', ratio: '1/2', src: NJ_IMAGES.hitSticksAd300x600},
      {id: 'gg-a-600', name: 'Ground Game — Digital Ad — 300×600 Half Page',   product: 'ground-game'   as const, dimensions: '300×600', format: 'PNG', ratio: '1/2', src: ''},
      {id: 'tt-a-600', name: 'Triple Threat — Digital Ad — 300×600 Half Page', product: 'triple-threat' as const, dimensions: '300×600', format: 'PNG', ratio: '1/2', src: ''},
      {id: 'al-a-600', name: 'All Products — Digital Ad — 300×600 Half Page',  product: 'brand'         as const, dimensions: '300×600', format: 'PNG', ratio: '1/2', src: ''},
    ] as AssetItem[],
  },
  {
    id: 'wide-skyscraper',
    label: '160×600 Wide Skyscraper',
    assets: [
      {id: 'hs-a-160', name: 'Hit Sticks — Digital Ad — 160×600 Wide Skyscraper',    product: 'hit-sticks'    as const, dimensions: '160×600', format: 'PNG', ratio: '4/15', src: NJ_IMAGES.hitSticksAd160x600},
      {id: 'gg-a-160', name: 'Ground Game — Digital Ad — 160×600 Wide Skyscraper',   product: 'ground-game'   as const, dimensions: '160×600', format: 'PNG', ratio: '4/15', src: ''},
      {id: 'tt-a-160', name: 'Triple Threat — Digital Ad — 160×600 Wide Skyscraper', product: 'triple-threat' as const, dimensions: '160×600', format: 'PNG', ratio: '4/15', src: ''},
      {id: 'al-a-160', name: 'All Products — Digital Ad — 160×600 Wide Skyscraper',  product: 'brand'         as const, dimensions: '160×600', format: 'PNG', ratio: '4/15', src: ''},
    ] as AssetItem[],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | NJ Retail Partner Resources'}];
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function AssetCard({asset}: {asset: AssetItem}) {
  const config = PRODUCT_CONFIG[asset.product];
  const hasImage = Boolean(asset.src);

  return (
    <div className="relative group bg-surface-container border border-outline-variant/20 hover:border-primary/60 transition-all flex flex-col overflow-hidden">
      {asset.isNew && (
        <span className="absolute top-2.5 left-2.5 z-10 bg-primary text-on-primary font-headline text-[11px] font-bold tracking-widest px-2 py-0.5">
          NEW
        </span>
      )}

      {/* Thumbnail */}
      <div className="relative overflow-hidden w-full" style={{aspectRatio: asset.ratio}}>
        {hasImage ? (
          <img
            src={asset.src}
            alt={asset.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center"
            style={{background: `linear-gradient(135deg, ${config.gradFrom}, #0a0a0a)`}}
          >
            <span className="material-symbols-outlined text-4xl opacity-25" style={{color: config.color}}>
              image
            </span>
            <span className="font-headline text-lg font-bold uppercase leading-tight" style={{color: config.color}}>
              {config.label}
            </span>
            <span
              className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border rounded-sm"
              style={{color: config.color, borderColor: `${config.color}60`}}
            >
              {asset.dimensions}
            </span>
          </div>
        )}

        {/* Hover download overlay */}
        <div className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/90 to-transparent pt-10 pb-3 px-3 flex gap-2">
          <a
            href={asset.src || '#'}
            target="_blank"
            rel="noreferrer"
            download
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-on-primary font-headline text-xs font-bold uppercase tracking-wide py-2 no-underline"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Download
          </a>
          <a
            href={asset.src || '#'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center px-3 py-2 bg-surface-bright border border-outline-variant/40 text-on-surface-variant no-underline hover:border-primary/60 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
          </a>
        </div>
      </div>

      {/* Card body */}
      <div className="px-3 py-2.5 border-t border-outline-variant/20 flex-1">
        <p className="text-sm font-semibold text-white leading-snug mb-2">{asset.name}</p>
        <div className="flex flex-wrap gap-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm"
            style={{background: `${config.color}18`, color: config.color}}
          >
            {config.label}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm bg-surface-container-highest text-on-surface-variant">
            {asset.dimensions}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm bg-surface-container-highest text-on-surface-variant">
            {asset.format}
          </span>
        </div>
      </div>
    </div>
  );
}

function DocCard({icon, name, desc, href = '#'}: {icon: string; name: string; desc: string; href?: string}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 bg-surface-container border border-outline-variant/20 hover:border-primary/60 hover:bg-surface-container-high p-5 no-underline text-white transition-all"
    >
      <div
        className="w-11 h-11 flex items-center justify-center rounded-md flex-shrink-0"
        style={{background: 'rgba(245,228,0,0.1)'}}
      >
        <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-headline text-base font-bold uppercase tracking-wide">{name}</p>
        <p className="text-sm text-on-surface-variant mt-0.5">{desc}</p>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors flex-shrink-0">
        open_in_new
      </span>
    </a>
  );
}

function UsageTip({children}: {children: React.ReactNode}) {
  return (
    <div className="flex items-start gap-3 bg-surface-container border border-outline-variant/20 border-l-4 border-l-primary p-4 mb-7">
      <span className="material-symbols-outlined text-primary text-lg flex-shrink-0 mt-0.5">lightbulb</span>
      <p className="text-sm text-on-surface-variant leading-relaxed">{children}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  desc,
  downloadLabel,
  onDownload,
}: {
  eyebrow: string;
  title: React.ReactNode;
  desc: string;
  downloadLabel?: string;
  onDownload?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
      <div>
        <p className="font-headline text-xs font-bold tracking-[0.3em] text-primary uppercase mb-1">{eyebrow}</p>
        <h2 className="font-headline text-4xl md:text-6xl font-bold uppercase leading-[0.9]">{title}</h2>
        <p className="text-sm text-on-surface-variant mt-2 max-w-lg">{desc}</p>
      </div>
      <button
        onClick={onDownload}
        className="flex-shrink-0 flex items-center gap-2 bg-primary text-on-primary font-headline text-sm font-bold uppercase tracking-wide px-5 py-3 hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined text-base">download</span>
        {downloadLabel}
      </button>
    </div>
  );
}

function Subsection({
  product,
  count,
  children,
}: {
  product: 'hit-sticks' | 'ground-game' | 'triple-threat';
  count: number;
  children: React.ReactNode;
}) {
  const config = PRODUCT_CONFIG[product];
  return (
    <div className="mb-10 last:mb-0">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-outline-variant/20">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: config.color}} />
        <span className="font-headline text-lg font-bold uppercase tracking-wider">{config.label}</span>
        <span className="text-sm text-on-surface-variant ml-auto font-semibold">
          {count} {count === 1 ? 'image' : 'assets'}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export default function NewJersey() {
  const [activeFilter, setActiveFilter] = useState<ProductFilter>('all');
  const [activeSizeTab, setActiveSizeTab] = useState('leaderboard');
  const [activeSection, setActiveSection] = useState('wholesale');
  const [toast, setToast] = useState<string | null>(null);

  // Sticky section nav: track active section with IntersectionObserver
  useEffect(() => {
    const els = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      {rootMargin: '-30% 0px -60% 0px', threshold: 0},
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const downloadAll = (label: string) =>
    showToast(`Preparing download for ${label}…`);

  // Visibility helpers
  const sectionVisible = (product: string) =>
    activeFilter === 'all' || activeFilter === product;

  const visibleAssets = (assets: AssetItem[]) =>
    assets.filter(
      (a) => activeFilter === 'all' || a.product === activeFilter || a.product === 'brand',
    );

  // Filter button config
  const filterButtons: {value: ProductFilter; label: string; dot?: string}[] = [
    {value: 'all',           label: 'All Products'},
    {value: 'hit-sticks',    label: 'Hit Sticks',    dot: '#F5E400'},
    {value: 'ground-game',   label: 'Ground Game',   dot: '#4CAF50'},
    {value: 'triple-threat', label: 'Triple Threat', dot: '#CE93D8'},
  ];

  return (
    <>
      {/* ── Partner Strip ──────────────────────────────────────────────────── */}
      <div className="bg-primary text-on-primary flex items-center justify-between px-6 py-2 font-headline text-[13px] font-bold tracking-[0.15em] uppercase">
        <Link
          to="/wholesale"
          className="flex items-center gap-1 text-on-primary hover:opacity-70 transition-opacity no-underline"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Wholesale Portal
        </Link>
        <span className="hidden md:block">NJ Retail Partner Resources · Launch 2026</span>
        <a
          href="mailto:marketing@highsman.com"
          className="flex items-center gap-1 text-on-primary hover:opacity-70 transition-opacity no-underline"
        >
          <span className="material-symbols-outlined text-sm">mail</span>
          marketing@highsman.com
        </a>
      </div>

      {/* ── Sticky Section Nav ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-surface border-b border-outline-variant/20 overflow-x-auto">
        <div className="flex items-center min-w-max px-8">
          {NAV_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`flex items-center gap-1.5 font-headline text-xs font-bold tracking-[0.12em] uppercase px-4 py-3.5 whitespace-nowrap border-b-2 transition-all no-underline ${
                activeSection === section.id
                  ? 'text-primary border-primary'
                  : 'text-on-surface-variant border-transparent hover:text-white'
              }`}
            >
              {section.label}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeSection === section.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {section.count}
              </span>
            </a>
          ))}
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 px-8 md:px-12 py-16 border-b border-outline-variant/20 bg-surface">
        {/* Left: headline + filter */}
        <div>
          <p className="font-headline text-xs font-bold tracking-[0.25em] text-primary uppercase mb-3">
            Retail Partner Resources
          </p>
          <h1 className="font-headline text-7xl md:text-[110px] font-bold uppercase leading-[0.85] mb-2">
            New<br />Jersey
          </h1>
          <p className="font-headline text-3xl md:text-4xl font-bold uppercase text-primary tracking-wide mb-5">
            Digital Asset Pack
          </p>
          <p className="text-base text-on-surface-variant leading-relaxed max-w-md mb-7">
            Your team. Our assets. Let&rsquo;s move product.
            <br />
            Everything sized and ready to drop into Dutchie, iHeartJane, and
            your social feeds&nbsp;— no design work needed.
          </p>

          {/* Updated badge */}
          <div className="inline-flex items-center gap-2.5 text-xs text-on-surface-variant border border-outline-variant/20 bg-surface-container px-3 py-2 rounded mb-8">
            <span className="bg-primary text-on-primary font-headline text-xs font-bold tracking-wide px-2 py-0.5">
              Updated
            </span>
            April 7, 2026&nbsp; ·&nbsp; 3 new assets added
          </div>

          {/* Product filter */}
          <div className="flex flex-wrap gap-2">
            {filterButtons.map((f) => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                className={`flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wide px-4 py-2.5 border transition-all ${
                  activeFilter === f.value
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-transparent text-on-surface-variant border-outline-variant/30 hover:border-white/60 hover:text-white'
                }`}
              >
                {f.dot && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{background: f.dot}}
                  />
                )}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: stats grid + product tiles */}
        <div className="flex flex-col gap-px">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-outline-variant/20 border border-outline-variant/20">
            {[
              {num: '24', label: 'Social Assets'},
              {num: '8',  label: 'Dutchie Banners'},
              {num: '16', label: 'Digital Menu Ads'},
              {num: '4',  label: 'Email Banners'},
              {num: '5',  label: 'Menu Images'},
              {num: '62', label: 'Total Assets'},
            ].map((stat) => (
              <div key={stat.label} className="bg-surface-container-low p-5">
                <span className="font-headline text-4xl font-bold text-white leading-none block">
                  {stat.num}
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          {/* Product tiles */}
          <div className="grid grid-cols-3 gap-px bg-outline-variant/20 border border-outline-variant/20 border-t-0">
            {[
              {name: 'Hit Sticks',    format: '0.5g · Personal',    color: '#F5E400', src: NJ_IMAGES.hitSticksHero,      filter: 'hit-sticks'    as ProductFilter},
              {name: 'Ground Game',   format: '7g · Ready to Roll', color: '#4CAF50', src: NJ_IMAGES.groundGameHero,     filter: 'ground-game'   as ProductFilter},
              {name: 'Triple Threat', format: '1.2g · Pre-Roll',    color: '#CE93D8', src: NJ_IMAGES.tripleThreatsHero,  filter: 'triple-threat' as ProductFilter},
            ].map((tile) => (
              <button
                key={tile.name}
                onClick={() =>
                  setActiveFilter(activeFilter === tile.filter ? 'all' : tile.filter)
                }
                className={`bg-surface-container-low p-3 text-center cursor-pointer hover:bg-surface-container-high transition-colors ${
                  activeFilter === tile.filter
                    ? 'outline outline-2 outline-primary -outline-offset-2'
                    : ''
                }`}
              >
                {tile.src ? (
                  <img
                    src={tile.src}
                    alt={tile.name}
                    className="w-full h-20 object-contain mb-2 block"
                  />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-4xl opacity-20">inventory_2</span>
                  </div>
                )}
                <p className="font-headline text-sm font-bold uppercase" style={{color: tile.color}}>
                  {tile.name}
                </p>
                <p className="text-xs text-on-surface-variant">{tile.format}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── What's New ─────────────────────────────────────────────────────── */}
      <div className="bg-surface px-8 md:px-12 pt-10">
        <div className="max-w-2xl mx-auto border border-outline-variant/20 bg-surface-container p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">new_releases</span>
            <span className="font-headline text-base font-bold uppercase tracking-wider">
              What&rsquo;s New
            </span>
            <span className="text-xs text-on-surface-variant ml-auto">Last updated: April 7, 2026</span>
          </div>
          <ul className="space-y-2.5">
            {[
              {icon: 'add_circle', text: 'Added 3 new Triple Threat social images (Images 11–13)'},
              {icon: 'add_circle', text: 'Added Ground Game Dutchie Banner 1800×900'},
              {icon: 'update',     text: 'Updated Wholesale Menu — pricing effective May 7'},
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-primary text-base flex-shrink-0">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 · WHOLESALE & SELL SHEETS
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="wholesale" className="px-8 md:px-12 py-16 border-b border-outline-variant/20">
        <SectionHeader
          eyebrow="Section 1"
          title={<>Wholesale &amp;<br />Sell Sheets</>}
          desc="Pricing, sell sheets, and budtender training materials. Start here for everything your team needs to onboard Highsman."
          downloadLabel="Download All (2)"
          onDownload={() => downloadAll('Wholesale & Sell Sheets')}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DocCard
            icon="request_quote"
            name="Wholesale Menu"
            desc="NJ pricing, SKUs, MOQs · Updated May 7, 2026"
          />
          <DocCard
            icon="school"
            name="Budtender Education Folder"
            desc="Training decks, product guides, sell scripts"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 · RETAIL MENU IMAGES
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        id="menu-images"
        className="px-8 md:px-12 py-16 border-b border-outline-variant/20 bg-surface-container-low"
      >
        <SectionHeader
          eyebrow="Section 2"
          title={<>Retail Menu<br />Images</>}
          desc="Product images sized for Dutchie, iHeartJane, and other digital menus."
          downloadLabel="Download All (5)"
          onDownload={() => downloadAll('Menu Images')}
        />
        <UsageTip>
          <strong>Usage:</strong> All images are exported at 2× resolution for retina displays.
          Dutchie recommends square images at 800×800px minimum. iHeartJane accepts both square
          and landscape.
        </UsageTip>
        {(['hit-sticks', 'ground-game', 'triple-threat'] as const).map((product) => {
          const assets = MENU_ASSETS.filter((a) => a.product === product);
          if (!assets.length || !sectionVisible(product)) return null;
          return (
            <Subsection key={product} product={product} count={assets.length}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {assets.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            </Subsection>
          );
        })}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 · RETAIL MERCHANDISING
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="merchandising" className="px-8 md:px-12 py-16 border-b border-outline-variant/20">
        <SectionHeader
          eyebrow="Section 3"
          title={<>Retail<br />Merchandising</>}
          desc="In-store guidelines, look books, and ready-to-copy product descriptions for your menu."
          downloadLabel="Download All (2)"
          onDownload={() => downloadAll('Merchandising')}
        />
        <div className="border-l-4 border-primary bg-surface-container p-6 mb-7">
          <p className="font-headline text-xs font-bold tracking-[0.3em] text-primary uppercase mb-2">
            About Highsman — Copy for Your Menu
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Positioned at the intersection of sports and cannabis, Highsman is the official lifestyle
            brand of Ricky Williams. Built on the belief that cannabis and athletic performance share
            common ground — discipline, focus, recovery, and ritual — Highsman delivers premium
            products for people who take both seriously.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DocCard
            icon="auto_stories"
            name="Merchandising Look Book"
            desc="In-store display guidelines, planogram, brand standards"
          />
          <DocCard
            icon="description"
            name="Product & Strain Descriptions"
            desc="Ready-to-use copy for Dutchie, Jane, and your own menu"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 · SOCIAL MEDIA POSTS
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        id="social-media"
        className="px-8 md:px-12 py-16 border-b border-outline-variant/20 bg-surface-container-low"
      >
        <SectionHeader
          eyebrow="Section 4"
          title={<>Social Media<br />Posts</>}
          desc="Co-brandable content for Instagram, Facebook, and TikTok. Post as-is or add your dispensary's logo."
          downloadLabel="Download All (24)"
          onDownload={() => downloadAll('Social Media')}
        />
        <UsageTip>
          <strong>Co-branding tip:</strong> Tag <strong>@highsman</strong> in your caption and
          we&rsquo;ll reshare to our audience. Suggested hashtags: #HighsmanNJ #SparkGreatness
          #NJCannabis
        </UsageTip>
        {(['hit-sticks', 'ground-game', 'triple-threat'] as const).map((product) => {
          const assets = SOCIAL_ASSETS.filter((a) => a.product === product);
          if (!assets.length || !sectionVisible(product)) return null;
          return (
            <Subsection key={product} product={product} count={assets.length}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {assets.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            </Subsection>
          );
        })}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 · DUTCHIE BANNERS
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="dutchie-banners" className="px-8 md:px-12 py-16 border-b border-outline-variant/20">
        <SectionHeader
          eyebrow="Section 5"
          title={<>Dutchie<br />Banners</>}
          desc="Banner ads sized for Dutchie and iHeartJane homepage placements."
          downloadLabel="Download All (8)"
          onDownload={() => downloadAll('Dutchie Banners')}
        />
        <UsageTip>
          <strong>Placement:</strong> Use 1080×540 for standard Dutchie homepage banners. 1800×900
          for featured/hero placement. Assets are retina-ready at 2×.
        </UsageTip>
        {(['hit-sticks', 'ground-game', 'triple-threat'] as const).map((product) => {
          const assets = DUTCHIE_ASSETS.filter((a) => a.product === product);
          if (!assets.length || !sectionVisible(product)) return null;
          return (
            <Subsection key={product} product={product} count={assets.length}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {assets.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            </Subsection>
          );
        })}
        {/* Brand/all-products banners always visible */}
        {visibleAssets(DUTCHIE_ASSETS).filter((a) => a.product === 'brand').length > 0 && (
          <Subsection product="hit-sticks" count={2}>
            {/* reuse any subsection header style; 'brand' banners shown under their own label below */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleAssets(DUTCHIE_ASSETS)
                .filter((a) => a.product === 'brand')
                .map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
            </div>
          </Subsection>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 6 · EMAIL BANNERS
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        id="email-banners"
        className="px-8 md:px-12 py-16 border-b border-outline-variant/20 bg-surface-container-low"
      >
        <SectionHeader
          eyebrow="Section 6"
          title={<>Email<br />Banners</>}
          desc="Header images for your email newsletter and promotional sends."
          downloadLabel="Download All (4)"
          onDownload={() => downloadAll('Email Banners')}
        />
        <UsageTip>
          <strong>Specs:</strong> 600px wide, designed to render cleanly on desktop and mobile email
          clients. Export as PNG for best quality or JPG to reduce file size in bulk sends.
        </UsageTip>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleAssets(EMAIL_ASSETS).map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 7 · DIGITAL MENU ADS
      ══════════════════════════════════════════════════════════════════════ */}
      <section id="digital-ads" className="px-8 md:px-12 py-16 border-b border-outline-variant/20">
        <SectionHeader
          eyebrow="Section 7"
          title={<>Digital<br />Menu Ads</>}
          desc="Display ad units sized for digital menu boards, dispensary websites, and programmatic placements."
          downloadLabel="Download All (16)"
          onDownload={() => downloadAll('Digital Menu Ads')}
        />

        {/* Size tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {AD_SIZES.map((size) => (
            <button
              key={size.id}
              onClick={() => setActiveSizeTab(size.id)}
              className={`font-headline text-sm font-bold uppercase tracking-wide px-4 py-2 border transition-all ${
                activeSizeTab === size.id
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 hover:text-white hover:border-outline-variant'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>

        {AD_SIZES.filter((s) => s.id === activeSizeTab).map((sizeGroup) => (
          <div key={sizeGroup.id} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleAssets(sizeGroup.assets).map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        ))}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 8 · LAUNCH
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        id="launch"
        className="px-8 md:px-12 py-16 border-b border-outline-variant/20"
      >
        <SectionHeader
          eyebrow="Section 8"
          title={<>Launch<br />Deal</>}
          desc="Ground Game 7G + Triple Threat 1.2G launch promo. Front-loaded wholesale support, May 14 – June 13, 2026."
        />
        <UsageTip>
          <strong>Launch order window:</strong> April 28 – May 8. Place the launch PO through{' '}
          <strong>highsman.com/njmenu</strong> to get the reduced wholesale price. Menu proof of the
          live deal due by May 16 (48h after launch).
        </UsageTip>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DocCard
            icon="receipt_long"
            name="Partner Terms"
            desc="Front-load math, conditions, proof requirements, FAQ"
            href="/njwholesalepromo"
          />
          <DocCard
            icon="shopping_cart"
            name="Place Launch Order"
            desc="NJ wholesale menu — order through here for the front-load"
            href="/njmenu"
          />
          <DocCard
            icon="campaign"
            name="Consumer Promo Page"
            desc="What shoppers see — share with your team & in-store"
            href="/njlaunch"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 9 · BRAND ASSETS
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        id="brand-assets"
        className="px-8 md:px-12 py-16 border-b border-outline-variant/20 bg-surface-container-low"
      >
        <SectionHeader
          eyebrow="Section 9"
          title={<>Brand<br />Assets</>}
          desc="Logos, brand guidelines, and official assets for co-marketing and approved brand use."
          downloadLabel="Download All (3)"
          onDownload={() => downloadAll('Brand Assets')}
        />
        <UsageTip>
          <strong>Usage rules:</strong> Logos may only be used in approved co-marketing contexts. Do
          not stretch, recolor, or alter the Highsman wordmark. When in doubt, email{' '}
          <strong>marketing@highsman.com</strong>.
        </UsageTip>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DocCard
            icon="workspace_premium"
            name="Highsman Logo Pack"
            desc="PNG, SVG, EPS on black, white, and transparent"
          />
          <DocCard
            icon="palette"
            name="Brand Guidelines"
            desc="Color palette, typography, usage rules"
          />
          <DocCard
            icon="photo_library"
            name="Photography Assets"
            desc="Lifestyle and product photography for editorial use"
          />
        </div>
      </section>

      {/* ── Support CTA ────────────────────────────────────────────────────── */}
      <section className="px-8 md:px-12 py-24 text-center bg-surface">
        <h2 className="font-headline text-5xl md:text-7xl font-bold uppercase mb-3">Need Help?</h2>
        <p className="text-base text-on-surface-variant mb-10 max-w-md mx-auto">
          Your Highsman rep is standing by. Reach out for custom assets, co-op requests, or help
          getting your placements set up.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="mailto:marketing@highsman.com"
            className="flex items-center justify-center gap-2 bg-primary text-on-primary font-headline text-xl font-bold uppercase px-8 py-4 hover:opacity-90 transition-opacity no-underline"
          >
            <span className="material-symbols-outlined">mail</span>
            Email Your Rep
          </a>
          <Link
            to="/wholesale"
            className="flex items-center justify-center gap-2 border-2 border-primary text-primary font-headline text-xl font-bold uppercase px-8 py-4 hover:bg-primary/10 transition-colors no-underline"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            Wholesale Portal
          </Link>
        </div>
      </section>

      {/* ── Floating Contact Button ─────────────────────────────────────────── */}
      <a
        href="mailto:marketing@highsman.com"
        className="fixed bottom-7 right-7 z-50 flex items-center gap-2 bg-primary text-on-primary font-headline text-sm font-bold uppercase tracking-wide px-5 py-3.5 hover:-translate-y-0.5 transition-transform no-underline"
        style={{boxShadow: '0 4px 24px rgba(245,228,0,0.30)'}}
      >
        <span className="material-symbols-outlined text-base">chat</span>
        Contact Rep
      </a>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-2.5 bg-surface-container border border-primary text-white font-medium text-sm px-5 py-3 shadow-xl pointer-events-none whitespace-nowrap">
          <span className="material-symbols-outlined text-primary text-base">download</span>
          {toast}
        </div>
      )}
    </>
  );
}
