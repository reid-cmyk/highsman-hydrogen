import {useState, useRef, useCallback, useMemo, useEffect} from 'react';
import type {MetaFunction, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useFetcher, useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// META
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'NJ Wholesale Menu | Highsman'},
  {
    description:
      'New Jersey wholesale menu — Hit Sticks, Triple Threat Pre-Rolls, and Ground Game. Order direct from Highsman.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS
// ─────────────────────────────────────────────────────────────────────────────

const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  goldDark: '#D4C700',
  green: '#4CAF50',
  purple: '#CE93D8',
  surface: '#111111',
  surfaceHigh: '#1A1A1A',
  surfaceContainer: '#222222',
  border: 'rgba(169,172,175,0.20)',
  textMuted: 'rgba(255,255,255,0.6)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE CDN
// ─────────────────────────────────────────────────────────────────────────────

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';

// Maps strain name → image filename key
const STRAIN_IMAGE_KEY: Record<string, string> = {
  'Wavey Watermelon': 'Watermelon',
  'Gridiron Grape': 'Grape',
  'Blueberry Blitz': 'Blueberry',
  'Touchdown Tango Mango': 'Mango',
  'Cake Quake': 'Quake',
};

type ImageType = 'PreRoll_Menu' | 'Pouch' | 'HitStickSingle';

// Exact filenames for the Hit Stick Singles product shots in Shopify
const HIT_STICK_SINGLE_KEY: Record<string, string> = {
  'Wavey Watermelon': 'Wavy_Watermelon',
  'Gridiron Grape': 'Gridiron_Grape',
  'Blueberry Blitz': 'Blueberry_Blitz',
  'Touchdown Tango Mango': 'Touchdown_Tango_Mango',
  'Cake Quake': 'Cake_Quake',
};

function strainImage(strainName: string, imageType: ImageType): string {
  if (imageType === 'HitStickSingle') {
    const key = HIT_STICK_SINGLE_KEY[strainName] || strainName.replace(/ /g, '_');
    return `${CDN}/Hit_Stick_Menu_Image_-_${key}.png`;
  }
  const key = STRAIN_IMAGE_KEY[strainName] || 'Watermelon';
  return `${CDN}/Highsman_${imageType}_${key}.png`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DATA
// ─────────────────────────────────────────────────────────────────────────────

type StrainType = 'Sativa' | 'Hybrid' | 'Indica';

interface Strain {
  name: string;
  type: StrainType;
  thc: string;
  sku?: string;
}

interface ProductLine {
  id: string;
  name: string;
  subtitle: string;
  weight: string;
  format: string;
  caseSize: number;
  wholesale: number;
  casePrice: number;
  rrp: number;
  color: string;
  icon: string;
  imageType: ImageType;
  fixedImageUrl?: string; // single image used for all strains in this line
  imageBg?: string;       // background color behind the product image (e.g. '#fff' for images with baked-in light bg)
  thcDisplay?: string;    // overrides per-strain THC (e.g. "50%+")
  strains: Strain[];
  discount?: {label: string; percent: number}; // optional active discount
}

// Base strains (no SKU — used for non-Hit-Stick lines)
const STRAINS: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%'},
];

// Hit Stick Singles — Case (24)
const STRAINS_HS_SINGLE: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%', sku: 'C-NJ-HSINF-WW'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%', sku: 'C-NJ-HSINF-GG'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%', sku: 'C-NJ-HSINF-BB'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%', sku: 'C-NJ-HSINF-TM'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%', sku: 'C-NJ-HSINF-CQ'},
];

// Hit Stick Power Packs — Black Tin 5-Pack, Case (6)
const STRAINS_HS_POWERPACK: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%', sku: 'C-NJ-HSTIN-WW'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%', sku: 'C-NJ-HSTIN-GG'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%', sku: 'C-NJ-HSTIN-BB'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%', sku: 'C-NJ-HSTIN-TM'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%', sku: 'C-NJ-HSTIN-CQ'},
];

// Fly High Tins — 5-Pack, Case (6)
const STRAINS_HS_FLYHIGH: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%', sku: 'C-NJ-HSTINFH-WW'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%', sku: 'C-NJ-HSTINFH-GG'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%', sku: 'C-NJ-HSTINFH-BB'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%', sku: 'C-NJ-HSTINFH-TM'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%', sku: 'C-NJ-HSTINFH-CQ'},
];

// Triple Threat Pre-Roll — Case (12)
const STRAINS_TT: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%', sku: 'C-NJ-HSTT-WW'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%', sku: 'C-NJ-HSTT-GG'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%', sku: 'C-NJ-HSTT-BB'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%', sku: 'C-NJ-HSTT-TM'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%', sku: 'C-NJ-HSTT-CQ'},
];

// Ground Game — Case (6)
const STRAINS_GG: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%', sku: 'C-NJ-HSGG-WW'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%', sku: 'C-NJ-HSGG-GG'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%', sku: 'C-NJ-HSGG-BB'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%', sku: 'C-NJ-HSGG-TM'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%', sku: 'C-NJ-HSGG-CQ'},
];

const PRODUCT_LINES: ProductLine[] = [
  {
    id: 'hit-sticks-single',
    name: 'Hit Sticks',
    subtitle: 'Singles',
    weight: '0.5g (500mg)',
    format: 'Infused Mini Pre-Roll',
    caseSize: 24,
    wholesale: 7.0,
    casePrice: 168.0,
    rrp: 13.99,
    color: BRAND.gold,
    icon: 'local_fire_department',
    imageType: 'HitStickSingle' as ImageType,
    thcDisplay: '50%+',
    strains: STRAINS_HS_SINGLE,
  },
  {
    id: 'hit-sticks-5pack',
    name: 'Hit Sticks',
    subtitle: 'Power Packs',
    weight: '2.5g (5 x 0.5g)',
    format: 'Infused Mini Pre-Roll 5-Pack',
    caseSize: 6,
    wholesale: 30.0,
    casePrice: 180.0,
    rrp: 59.99,
    color: BRAND.gold,
    icon: 'local_fire_department',
    imageType: 'Pouch' as ImageType,
    fixedImageUrl: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_9.png',
    thcDisplay: '50%+',
    strains: STRAINS_HS_POWERPACK,
  },
  {
    id: 'fly-high-tins',
    name: 'Fly High Tins',
    subtitle: 'Limited Edition',
    weight: '2.5g (5 x 0.5g)',
    format: 'Limited Edition Tin 5-Pack',
    caseSize: 6,
    wholesale: 30.0,
    casePrice: 180.0,
    rrp: 59.99,
    color: BRAND.gold,
    icon: 'workspace_premium',
    imageType: 'Pouch' as ImageType,
    fixedImageUrl: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_10.png',
    imageBg: '#FFFFFF',
    thcDisplay: '50%+',
    strains: STRAINS_HS_FLYHIGH,
  },
  {
    id: 'triple-threat',
    name: 'Triple Threat',
    subtitle: 'Pre-Roll',
    weight: '1.2g',
    format: 'Infused Pre-Roll',
    caseSize: 12,
    wholesale: 14.5,
    casePrice: 174.0,
    rrp: 29.0,
    color: BRAND.gold,
    icon: 'sports_mma',
    imageType: 'PreRoll_Menu' as ImageType,
    thcDisplay: '45%+',
    strains: STRAINS_TT,
  },
  {
    id: 'ground-game',
    name: 'Ground Game',
    subtitle: 'Ready to Roll',
    weight: '7g',
    format: 'Milled Flower',
    caseSize: 6,
    wholesale: 45.0,
    casePrice: 270.0,
    rrp: 90.0,
    color: BRAND.gold,
    icon: 'grass',
    imageType: 'Pouch' as ImageType,
    thcDisplay: '40%+',
    strains: STRAINS_GG,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BUDTENDER SAMPLE RULES
// ─────────────────────────────────────────────────────────────────────────────

interface SampleRule {
  id: string;
  productId: string;
  label: string;         // display name
  unit: string;          // what the sample is (e.g. "Hit Stick Single")
  every: number;         // 1 sample per N cases
  color: string;
  icon: string;
  sampleSkus?: Record<string, string>; // strain name → Zoho sample SKU
}

const SAMPLE_RULES: SampleRule[] = [
  {
    id: 'sample-hit-stick-single',
    productId: 'hit-sticks-single',
    label: 'Hit Stick Single',
    unit: '1 single unit per case',
    every: 1,
    color: BRAND.gold,
    icon: 'local_fire_department',
    sampleSkus: {
      'Blueberry Blitz': 'C-S-NJ-HSINF-BB',
      'Cake Quake': 'C-S-NJ-HSINF-CQ',
      'Gridiron Grape': 'C-S-NJ-HSINF-GG',
      'Touchdown Tango Mango': 'C-S-NJ-HSINF-TM',
      'Wavey Watermelon': 'C-S-NJ-HSINF-WW',
    },
  },
  {
    id: 'sample-power-pack',
    productId: 'hit-sticks-5pack',
    label: 'Hit Stick Individual',
    unit: '1 individual unit per Power Pack case',
    every: 1,
    color: BRAND.gold,
    icon: 'local_fire_department',
    sampleSkus: {
      'Blueberry Blitz': 'C-S-NJ-HSINF-BB',
      'Cake Quake': 'C-S-NJ-HSINF-CQ',
      'Gridiron Grape': 'C-S-NJ-HSINF-GG',
      'Touchdown Tango Mango': 'C-S-NJ-HSINF-TM',
      'Wavey Watermelon': 'C-S-NJ-HSINF-WW',
    },
  },
  {
    id: 'sample-fly-high-tin',
    productId: 'fly-high-tins',
    label: 'Hit Stick Individual (Fly High Tin)',
    unit: '1 individual unit per Tin case',
    every: 1,
    color: '#FF6B35',
    icon: 'workspace_premium',
    sampleSkus: {
      'Blueberry Blitz': 'C-S-NJ-HSINF-BB',
      'Cake Quake': 'C-S-NJ-HSINF-CQ',
      'Gridiron Grape': 'C-S-NJ-HSINF-GG',
      'Touchdown Tango Mango': 'C-S-NJ-HSINF-TM',
      'Wavey Watermelon': 'C-S-NJ-HSINF-WW',
    },
  },
  {
    id: 'sample-triple-threat',
    productId: 'triple-threat',
    label: 'Triple Threat Pre-Roll',
    unit: '1 sample per 2 cases',
    every: 2,
    color: BRAND.purple,
    icon: 'sports_mma',
    sampleSkus: {
      'Blueberry Blitz': 'C-S-NJ-HSTT-BB',
      'Cake Quake': 'C-S-NJ-HSTT-CQ',
      'Gridiron Grape': 'C-S-NJ-HSTT-GG',
      'Touchdown Tango Mango': 'C-S-NJ-HSTT-TM',
      'Wavey Watermelon': 'C-S-NJ-HSTT-WW',
    },
  },
  {
    id: 'sample-ground-game',
    productId: 'ground-game',
    label: 'Ground Game Bag',
    unit: '1 sample per 4 cases',
    every: 4,
    color: BRAND.green,
    icon: 'grass',
    sampleSkus: {
      'Blueberry Blitz': 'C-S-NJ-HSGG-BB',
      'Cake Quake': 'C-S-NJ-HSGG-CQ',
      'Gridiron Grape': 'C-S-NJ-HSGG-GG',
      'Touchdown Tango Mango': 'C-S-NJ-HSGG-TM',
      'Wavey Watermelon': 'C-S-NJ-HSGG-WW',
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CART STATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CartItem {
  productId: string;
  strainName: string;
  cases: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', {style: 'currency', currency: 'USD'});
}

function applyDiscount(price: number, discount?: {percent: number}): number {
  if (!discount) return price;
  return price * (1 - discount.percent / 100);
}

function cartKey(productId: string, strainName: string): string {
  return `${productId}__${strainName}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NJ DISPENSARY DIRECTORY (from Zoho CRM — instant client-side search)
// ─────────────────────────────────────────────────────────────────────────────

const NJ_DISPENSARIES: Array<{id: string; name: string; city: string | null; phone: string | null}> = [
  {id:'6699615000013586001',name:'4TwentySomewhere',city:'Hewitt',phone:'(973) 506-4503'},
  {id:'6699615000005120038',name:'A-Z Supply',city:'Bloomfield',phone:null},
  {id:'6699615000001563114',name:'A21 Dispensary',city:'Scotch Plains',phone:'8482195891'},
  {id:'6699615000001563115',name:'Altitude Cannabis - Toms River',city:'Toms River',phone:'8482237265'},
  {id:'6699615000001563116',name:'Andover Cannabis',city:'Andover',phone:'4016174470'},
  {id:'6699615000001563117',name:'Aunt Mary\'s',city:'Flemington',phone:'9082570421'},
  {id:'6699615000013803047',name:'Authorized Dealer',city:'North Bergen',phone:'201.303.2999'},
  {id:'6699615000013433003',name:'Authorized Dealer - Jersey City',city:'Jersey City',phone:'(201) 482-9675'},
  {id:'6699615000013433004',name:'Authorized Dealer - North Bergen',city:'North Bergen',phone:'(201) 293-5668'},
  {id:'6699615000013433005',name:'Authorized Dealer - Willingboro',city:'Willingboro',phone:'(609) 781-1956'},
  {id:'6699615000002149001',name:'Benedict\'s Supply',city:'Jersey City',phone:null},
  {id:'6699615000006512141',name:'Beyond Hello',city:'Little Ferry',phone:null},
  {id:'6699615000001563118',name:'Bleachers - Somerset',city:'Somerset',phone:'8482522083'},
  {id:'6699615000011217064',name:'BLKBRN Dispensary',city:'Highland Park',phone:'8482021963'},
  {id:'6699615000001563120',name:'Bloc - Ewing',city:'Ewing',phone:'6093697913'},
  {id:'6699615000001563121',name:'Bloc - Somerset',city:'Somerset',phone:'6093697913'},
  {id:'6699615000001563122',name:'Bloc - Waretown',city:'Ocean Township',phone:'6093697913'},
  {id:'6699615000001563119',name:'Bloc Dispensary',city:null,phone:'6093697913'},
  {id:'6699615000001745725',name:'BluLight Cannabis',city:'Woodbury Heights',phone:'8562214000'},
  {id:'6699615000001745727',name:'BluLight Cannabis - Gloucester City',city:'Gloucester City',phone:'8562214000'},
  {id:'6699615000011680079',name:'BluLight Cannabis - Woodbury Heights',city:'Woodbury Heights',phone:null},
  {id:'6699615000001745726',name:'BluLight Cannabis - Woodbury Heights',city:'Woodbury Heights',phone:'8562214000'},
  {id:'6699615000001563123',name:'Botera NJ (Union)',city:'Union',phone:'2076180417'},
  {id:'6699615000005592720',name:'Botera NJ - Harrison',city:'Harrison',phone:null},
  {id:'6699615000005923033',name:'Bridge City Collective',city:'Somerset',phone:null},
  {id:'6699615000001745728',name:'Bud 2 Bloom',city:'Netcong',phone:'8627460420'},
  {id:'6699615000005592671',name:'Bud City NJ',city:'Newton',phone:'(973) 440-5945'},
  {id:'6699615000001745729',name:'Bud It Up LLC',city:'Englishtown',phone:'8482339344'},
  {id:'6699615000001745730',name:'Buddy\'s Dispensary',city:'Andover',phone:'9734405577'},
  {id:'6699615000006903019',name:'Budzooka',city:'Elizabeth',phone:'(908) 380-2414'},
  {id:'6699615000007452001',name:'CANFECTIONS NJ, INC',city:'Ewing',phone:null},
  {id:'6699615000001745731',name:'Canna Bar',city:'Matawan',phone:'7326298278'},
  {id:'6699615000001745732',name:'Cannabis Clubhouse',city:'Sussex',phone:'8623516021'},
  {id:'6699615000001563124',name:'Cannabist',city:null,phone:'8568345244'},
  {id:'6699615000001563125',name:'Cannabist - Deptford',city:'Deptford',phone:'8568345244'},
  {id:'6699615000001563126',name:'Cannabist - Vineland',city:'Vineland',phone:'6099821929'},
  {id:'6699615000008070220',name:'Cannaboy Treehouse',city:'South Orange',phone:'973 302-9020'},
  {id:'6699615000005120758',name:'CannaVibes',city:'Elmwood Park',phone:'(201) 292-4489'},
  {id:'6699615000001563127',name:'Canopy Crossroad - Red Bank',city:'Red Bank',phone:'7324385880'},
  {id:'6699615000008070526',name:'Casa Verde Wellness',city:'Dover',phone:'(973) 343-2322'},
  {id:'6699615000001563128',name:'Castaway Cannabis',city:'Delanco',phone:'8565443029'},
  {id:'6699615000014277035',name:'Citi Roots LLC',city:'Kingston',phone:'(609) 924-4585'},
  {id:'6699615000001563129',name:'Conservatory Cannabis Co',city:'Egg Harbor Township',phone:'3027571923'},
  {id:'6699615000001563130',name:'Cottonmouth Dispensary - Runnemede',city:'Runnemede',phone:'8565357368'},
  {id:'6699615000001563132',name:'Curaleaf - Bordentown',city:'Bordentown',phone:'6094002455'},
  {id:'6699615000001563133',name:'Curaleaf - Edgewater Park',city:'Edgewater Park',phone:'6092327690'},
  {id:'6699615000001563131',name:'Curaleaf New Jersey',city:null,phone:'6094002455'},
  {id:'6699615000001912018',name:'Dank Poet',city:'Washington',phone:'9084509900'},
  {id:'6699615000013625005',name:'Do-Canna',city:'Maplewood',phone:'(973) 327-2027'},
  {id:'6699615000001563134',name:'Doobiez',city:'West Milford',phone:'9735064166'},
  {id:'6699615000001563135',name:'Earth and Ivy',city:'New Brunswick',phone:'6198611296'},
  {id:'6699615000001745733',name:'Eastern Green',city:'Voorhees Township',phone:'8562053257'},
  {id:'6699615000001563136',name:'Elevated by the Cannabosslady',city:'Maplewood',phone:'9174165455'},
  {id:'6699615000001563137',name:'Enlighten Health and Wellness LLC',city:'Marlton',phone:'8564494332'},
  {id:'6699615000001745734',name:'Everest Dispensary',city:'Atlantic City',phone:'6097839333'},
  {id:'6699615000009244028',name:'Evergreen Natures Remedy',city:'Butler',phone:null},
  {id:'6699615000001563138',name:'Evolve - Bordentown',city:'Bordentown',phone:'9732291171'},
  {id:'6699615000001563139',name:'Feels of Green',city:'Newton',phone:'9734443079'},
  {id:'6699615000011822234',name:'Fresh - Eatontown',city:'Eatontown',phone:'(732) 440-7702'},
  {id:'6699615000014357116',name:'G2 Dispensary',city:'Rockaway',phone:'9735922708'},
  {id:'6699615000005676085',name:'Garfield Gardens',city:'Garfield',phone:'(973) 755-5420'},
  {id:'6699615000011211001',name:'Gas and Grass NJ',city:'Lake Hopatcong',phone:null},
  {id:'6699615000001563140',name:'Ginger Hale Dispensary',city:'Oaklyn',phone:'6094714180'},
  {id:'6699615000001745735',name:'Got Your Six of New Jersey',city:'Princeton',phone:'7324442060'},
  {id:'6699615000012499485',name:'GW Leaf DBA Indoor Treez (New Jersey)',city:'Fort Lee',phone:'2014292284'},
  {id:'6699615000001745736',name:'Gynsyng',city:'Merchantville',phone:'9082750385'},
  {id:'6699615000001563141',name:'Hackettstown Dispensary',city:'Hackettstown',phone:'9088870080'},
  {id:'6699615000013144001',name:'Happy Leaf',city:'Somerdale',phone:'(856) 545-7024'},
  {id:'6699615000001563142',name:'Hashery LLC - Hackensack',city:'Hackensack',phone:'9089478590'},
  {id:'6699615000001563143',name:'Hashstoria - Newark',city:'Newark',phone:'8623212436'},
  {id:'6699615000007595079',name:'Hazy Harvest',city:'Jersey City',phone:'(551) 359-9161'},
  {id:'6699615000001563144',name:'Healing Side - Atlantic City',city:'Atlantic City',phone:'3477683096'},
  {id:'6699615000001745737',name:'Hello High',city:'Hammonton',phone:'6095674444'},
  {id:'6699615000006835349',name:'Herb\'s Premium Dispensary',city:'Somerset',phone:'7325228893'},
  {id:'6699615000001563145',name:'High Profile',city:null,phone:'5089309876'},
  {id:'6699615000001563146',name:'High Profile - Lakehurst',city:'Lakehurst',phone:'5089309876'},
  {id:'6699615000001563147',name:'High Profile - Somerdale',city:'Somerdale',phone:'5089309876'},
  {id:'6699615000005120365',name:'High Rollers Dispensary',city:'Atlantic City',phone:'(609) 246-6823'},
  {id:'6699615000001563148',name:'High Street - Hackettstown',city:'Hackettstown',phone:'5089309876'},
  {id:'6699615000001563149',name:'Holistic Re-Leaf',city:'Rockaway',phone:'9734536645'},
  {id:'6699615000011602752',name:'Holistic Solutions',city:'Waterford',phone:'(267) 230-1230'},
  {id:'6699615000001745738',name:'Honey Buzz Farms',city:'Atlantic City',phone:'6099575658'},
  {id:'6699615000002151085',name:'Honey Grove',city:'Clementon',phone:'8565043138'},
  {id:'6699615000002149029',name:'Honey Stash',city:'Metuchen',phone:null},
  {id:'6699615000001745739',name:'HoneyGrove',city:'Clementon',phone:'8565043138'},
  {id:'6699615000001993083',name:'The Honorable Plant',city:'Highlands',phone:'7323346545'},
  {id:'6699615000013467002',name:'HudHaus',city:'North Bergen',phone:'(877) 483-4287'},
  {id:'6699615000012730092',name:'Illicit Gardens - Secaucus NJ',city:'Secaucus',phone:'(732) 714-4037'},
  {id:'6699615000001563150',name:'Indigo Dispensary',city:'Brooklawn',phone:'6099201818'},
  {id:'6699615000008618046',name:'J & J Cannabis Dispensary',city:'Oak Ridge',phone:'(973) 200-0705'},
  {id:'6699615000011822472',name:'Jane\'s Joint',city:'Gibbsboro',phone:'(856) 433-4482'},
  {id:'6699615000001563151',name:'Jersey Meds',city:'Pennington',phone:'8564657728'},
  {id:'6699615000001563152',name:'Jersey Roots Dispensary',city:'West Milford',phone:'2013139721'},
  {id:'6699615000001563153',name:'Joyleaf Recreational Weed Dispensary - Roselle',city:'Roselle',phone:'8335695323'},
  {id:'6699615000001563154',name:'Kind Kush',city:'Rockaway',phone:'2013165708'},
  {id:'6699615000005120800',name:'La Vida Gardens',city:'Belleville',phone:'(973) 259-6736'},
  {id:'6699615000013636003',name:'Liberty Cannabis - North Brunswick',city:'North Brunswick',phone:'(848) 800-4795'},
  {id:'6699615000013625004',name:'Liberty Cannabis - Secaucus',city:'Secaucus',phone:'(201) 431-4781'},
  {id:'6699615000001563155',name:'Mass Grown - Mount Holly',city:'Mount Holly',phone:'6095564476'},
  {id:'6699615000002056159',name:'Mind Lift Dispensary',city:'Plainfield',phone:null},
  {id:'6699615000001563156',name:'MMD - New Jersey',city:'Jersey City',phone:'8058505995'},
  {id:'6699615000001563157',name:'Molly Ann Farms',city:'Haledon',phone:'(973) 315-4900'},
  {id:'6699615000001745740',name:'Monteverde NJ',city:'Red Bank',phone:'7327044575'},
  {id:'6699615000001745741',name:'Mountain Dispensary',city:'Vernon Township',phone:'9732877034'},
  {id:'6699615000001563158',name:'Mountain View Farmacy',city:'Oak Ridge',phone:'7322325593'},
  {id:'6699615000001563159',name:'MPX NJ',city:null,phone:null},
  {id:'6699615000001563160',name:'MPX NJ - Atlantic City',city:'Atlantic City',phone:'6096167770'},
  {id:'6699615000001563161',name:'MPX NJ - Gloucester',city:'Sicklerville',phone:'8482922764'},
  {id:'6699615000001563162',name:'MPX NJ - Pennsauken',city:'Pennsauken Township',phone:'8482065060'},
  {id:'6699615000001563163',name:'New Era Dispensary',city:'South Bound Brook',phone:'7327099842'},
  {id:'6699615000001563164',name:'Nirvana Dispensary - Mount Laurel',city:'Mount Laurel',phone:'5515803644'},
  {id:'6699615000001563165',name:'NJ Leaf',city:'Freehold',phone:'7327629155'},
  {id:'6699615000001745742',name:'NJ Pure',city:'Edgewater Park',phone:'2345657873'},
  {id:'6699615000005592019',name:'Northeast Alternatives - Hamilton',city:'Hamilton Township',phone:null},
  {id:'6699615000001563166',name:'Nova Farms - Woodbury',city:'Woodbury',phone:'7743130763'},
  {id:'6699615000011822139',name:'Ohm Theory',city:'Elmwood Park',phone:'973-454-3717'},
  {id:'6699615000001745743',name:'One Green Leaf Dispensary',city:'Gibbsboro',phone:'8563442879'},
  {id:'6699615000001745744',name:'Plantabis',city:'Rahway',phone:'7324810002'},
  {id:'6699615000014309056',name:'Plantopia LLC',city:'Englishtown',phone:null},
  {id:'6699615000001563168',name:'Premo',city:'Keyport',phone:'2019054199'},
  {id:'6699615000013629003',name:'Public Cannabis - Absecon',city:'Absecon',phone:'(609) 241-0447'},
  {id:'6699615000001563167',name:'Puffin Store NJ',city:'New Brunswick',phone:'8335071500'},
  {id:'6699615000001563169',name:'Pure Blossom',city:'Pennington',phone:'7329843906'},
  {id:'6699615000011212048',name:'Quality Cannabliss',city:'Gloucester Township',phone:null},
  {id:'6699615000001563170',name:'ROOTS - Willingboro',city:'Willingboro',phone:'8566498416'},
  {id:'6699615000012519037',name:'Rush Budz',city:'South Bound Brook',phone:'7323140099'},
  {id:'6699615000001745745',name:'RushBudz Dispensary',city:'South Bound Brook',phone:'7323140099'},
  {id:'6699615000001563171',name:'Ruuted',city:'Englishtown',phone:'8609444518'},
  {id:'6699615000005592623',name:'Salt Air Botanicals',city:'Atlantic City',phone:'(609) 200-1584'},
  {id:'6699615000007702005',name:'Sea and Leaf',city:'North Cape May',phone:null},
  {id:'6699615000013795002',name:'Shipwreck\'d',city:'Neptune City',phone:'(732) 481-3136'},
  {id:'6699615000001563172',name:'Shore House Canna',city:'Cape May',phone:'2158286057'},
  {id:'6699615000001745746',name:'SilverLeaf Wellness',city:'Somerset',phone:'7326559842'},
  {id:'6699615000010149092',name:'Silverleaf Wellness',city:'Somerset',phone:null},
  {id:'6699615000002149057',name:'Simply Pure',city:'Ewing Township',phone:null},
  {id:'6699615000011822201',name:'Somerset Green',city:'Somerset',phone:'(732) 354-0003'},
  {id:'6699615000001563173',name:'Soul Flora',city:'Newfoundland',phone:'9734094319'},
  {id:'6699615000014347179',name:'SoulFlora',city:'West Milford',phone:null},
  {id:'6699615000001745747',name:'Sparkology',city:'Franklin Park',phone:'7324193330'},
  {id:'6699615000001745748',name:'Story Cannabis NJ',city:'Springfield',phone:'9084308689'},
  {id:'6699615000001563174',name:'Taste of Earth',city:'Buena',phone:'8563008783'},
  {id:'6699615000001563175',name:'The Apothecarium',city:'Phillipsburg',phone:null},
  {id:'6699615000001563176',name:'The Apothecarium - Lodi',city:'Lodi',phone:'8629102420'},
  {id:'6699615000001563177',name:'The Apothecarium - Maplewood',city:'Maplewood',phone:'9739961420'},
  {id:'6699615000001563178',name:'The Apothecarium - Phillipsburg',city:'Phillipsburg',phone:'9087777420'},
  {id:'6699615000001563179',name:'The Botanist',city:null,phone:'6094578141'},
  {id:'6699615000001563180',name:'The Botanist - Atlantic County Delivery Hub',city:'Atlantic City',phone:'6094578141'},
  {id:'6699615000001563181',name:'The Botanist - Egg Harbor Township',city:'Egg Harbor Township',phone:'6093351028'},
  {id:'6699615000001563182',name:'The Botanist - Williamstown',city:'Williamstown',phone:'6093351028'},
  {id:'6699615000001563183',name:'The Cannabis Place - New Jersey',city:'Jersey City',phone:'8444201542'},
  {id:'6699615000001563184',name:'The Dispensary of NJ',city:null,phone:'9082082912'},
  {id:'6699615000001563185',name:'The Dispensary of Saddle Brook',city:'Saddle Brook',phone:'9082082912'},
  {id:'6699615000001563186',name:'The Dispensary of Somerset NJ',city:'Somerset',phone:'9082082912'},
  {id:'6699615000001563187',name:'The Dispensary of Union NJ',city:'Union',phone:'9082082912'},
  {id:'6699615000005676133',name:'The Frosted Nug',city:'Red Bank',phone:null},
  {id:'6699615000005676138',name:'The Frosted Nug - Carneys Point',city:'Penns Grove',phone:null},
  {id:'6699615000005676143',name:'The Frosted Nug - Red Bank',city:'Red Bank',phone:null},
  {id:'6699615000001745749',name:'The Public Garden',city:'Bloomfield',phone:'8624024366'},
  {id:'6699615000001563188',name:'The Social Leaf',city:'Toms River',phone:'7323586800'},
  {id:'6699615000001563189',name:'The Station - Hoboken',city:'Hoboken',phone:'9082854569'},
  {id:'6699615000001745750',name:'The THC Shop',city:'Atlantic City',phone:'6402327467'},
  {id:'6699615000001563190',name:'Theory Wellness - Trenton',city:'Trenton',phone:'5185671513'},
  {id:'6699615000012912002',name:'Toke Lane',city:'Trenton',phone:'8556685843'},
  {id:'6699615000001563191',name:'Tree House Co-op Dispensary',city:'Voorhees',phone:'4105887636'},
  {id:'6699615000009109009',name:'Twisted Hat Canna',city:'Carneys Point',phone:null},
  {id:'6699615000001745751',name:'Uforia',city:'Jersey City',phone:'2014209333'},
  {id:'6699615000005955025',name:'Uma Flowers NJ',city:'Morristown',phone:'(862) 260-4115'},
  {id:'6699615000001745752',name:'Unity Rd',city:'Somerset',phone:'7324127210'},
  {id:'6699615000001745753',name:'Valley Wellness LLC',city:'Raritan',phone:'9084296680'},
  {id:'6699615000012521002',name:'Vigor',city:'Matawan',phone:'732-510-0400'},
  {id:'6699615000001563192',name:'Village - Hoboken',city:'Hoboken',phone:'2019326522'},

];

// ─────────────────────────────────────────────────────────────────────────────
// LOADER — Fetch LeafLink inventory server-side
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const LEAFLINK_COMPANY_ID = 24087;

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;

  const inventory: Record<string, number> = {};

  if (!apiKey) {
    console.warn('[njmenu] LEAFLINK_API_KEY not configured — inventory unavailable');
    return json({inventory});
  }

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const url = `${LEAFLINK_API_BASE}/products/?seller=${LEAFLINK_COMPANY_ID}&fields_include=id,sku,available_inventory,listing_state&page_size=100&page=${page}`;
      const res = await fetch(url, {
        headers: {Authorization: `Token ${apiKey}`},
      });

      if (!res.ok) break;
      const data = await res.json();
      if (!data.results || data.results.length === 0) break;

      for (const product of data.results) {
        if (!product.sku) continue;
        // If listing_state is not "Available", treat as 0 stock
        const available = product.listing_state === 'Available'
          ? Math.max(0, Math.floor(parseFloat(product.available_inventory ?? '0')))
          : 0;
        inventory[product.sku] = available;
      }

      hasMore = !!data.next;
      page++;
    }
  } catch (err: any) {
    console.error('[njmenu] Inventory fetch error:', err.message);
  }

  return json(
    {inventory},
    {headers: {'Cache-Control': 'public, max-age=300, s-maxage=300'}},
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function NJMenu() {
  const {inventory} = useLoaderData<typeof loader>();

  // Helper: check if a strain SKU is in stock (available > 0)
  // Returns true if no inventory data exists (graceful fallback)
  const isInStock = useCallback(
    (sku?: string): boolean => {
      if (!sku) return true; // no SKU means not tracked
      if (!(sku in inventory)) return true; // not in LeafLink = show as available
      return inventory[sku] > 0;
    },
    [inventory],
  );

  // Suppress Klaviyo popup — this is a B2B wholesale page, not consumer-facing
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-popup';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Account / Shop Identification ──────────────────────────────────────────
  const accountFetcher = useFetcher<{accounts: Array<{id: string; name: string; city: string | null; phone: string | null}>; error?: string}>();
  const createAccountFetcher = useFetcher<{ok: boolean; account?: {id: string; name: string; city: string | null; phone: string | null}; error?: string}>();
  const [accountQuery, setAccountQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<{id: string; name: string; city: string | null; phone: string | null} | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [newAccountError, setNewAccountError] = useState<string | null>(null);
  const [useLiveSearch, setUseLiveSearch] = useState(true); // try API first
  // Address autocomplete state (Google Places)
  const [addressQuery, setAddressQuery] = useState('');
  const [addressPredictions, setAddressPredictions] = useState<Array<{placeId: string; description: string; mainText: string; secondaryText: string}>>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<{display: string; street: string; city: string; state: string; zip: string} | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressDropdownRef = useRef<HTMLDivElement>(null);
  const accountInputRef = useRef<HTMLInputElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Debounced live search — try Zoho API first
  useEffect(() => {
    if (accountQuery.length < 2 || selectedAccount || !useLiveSearch) return;
    const timer = setTimeout(() => {
      accountFetcher.load(`/api/accounts?q=${encodeURIComponent(accountQuery)}`);
    }, 200);
    return () => clearTimeout(timer);
  }, [accountQuery, selectedAccount, useLiveSearch]);

  // If API returns "CRM not configured" error, fall back to static list permanently
  useEffect(() => {
    if (accountFetcher.data?.error === 'CRM not configured') {
      setUseLiveSearch(false);
    }
  }, [accountFetcher.data]);

  // Compute results: live API results when available, static fallback otherwise
  const accountResults = useMemo(() => {
    if (accountQuery.length < 2 || selectedAccount) return [];

    // If live search is active and we have API results, use those
    if (useLiveSearch && accountFetcher.data?.accounts && !accountFetcher.data?.error) {
      return accountFetcher.data.accounts;
    }

    // Fallback: instant client-side filter on the embedded list
    const q = accountQuery.toLowerCase();
    return NJ_DISPENSARIES.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.city && d.city.toLowerCase().includes(q)),
    ).slice(0, 15);
  }, [accountQuery, selectedAccount, useLiveSearch, accountFetcher.data]);

  const isSearching = useLiveSearch && accountFetcher.state === 'loading';

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(e.target as Node) &&
        accountInputRef.current &&
        !accountInputRef.current.contains(e.target as Node)
      ) {
        setShowAccountDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle create-account response
  useEffect(() => {
    if (createAccountFetcher.state === 'idle' && createAccountFetcher.data) {
      if (createAccountFetcher.data.ok && createAccountFetcher.data.account) {
        setSelectedAccount(createAccountFetcher.data.account);
        setShowNewAccountForm(false);
        setNewAccountError(null);
        setToast(`Welcome, ${createAccountFetcher.data.account.name}! You can now place your order.`);
      } else if (createAccountFetcher.data.error) {
        setNewAccountError(createAccountFetcher.data.error);
      }
    }
  }, [createAccountFetcher.state, createAccountFetcher.data]);

  // Debounced address autocomplete via Google Places API (server-side proxy)
  useEffect(() => {
    if (addressQuery.length < 3 || selectedAddress) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(addressQuery)}`);
        if (!res.ok) return;
        const data = await res.json();
        setAddressPredictions(data.predictions || []);
        setShowAddressDropdown((data.predictions || []).length > 0);
      } catch { /* silent fail */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [addressQuery, selectedAddress]);

  // Resolve a Google Place prediction to a structured address
  const selectPlacePrediction = async (prediction: {placeId: string; description: string}) => {
    setAddressLoading(true);
    setShowAddressDropdown(false);
    setAddressQuery(prediction.description);
    try {
      const res = await fetch(`/api/places?placeId=${encodeURIComponent(prediction.placeId)}`);
      if (!res.ok) throw new Error('Details fetch failed');
      const data = await res.json();
      if (data.address) {
        setSelectedAddress(data.address);
        setAddressQuery(data.address.display);
      } else {
        // Fallback: use the prediction text as display
        setSelectedAddress({display: prediction.description, street: '', city: '', state: 'NJ', zip: ''});
      }
    } catch {
      setSelectedAddress({display: prediction.description, street: '', city: '', state: 'NJ', zip: ''});
    } finally {
      setAddressLoading(false);
    }
  };

  // Close address dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(e.target as Node)) {
        setShowAddressDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Cart & Order State ───────────────────────────────────────────────────
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [showCart, setShowCart] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(
    'hit-sticks-single',
  );
  const [orderNote, setOrderNote] = useState('');
  const [sampleStrains, setSampleStrains] = useState<Record<string, string>>({});
  const cartRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // Cart operations
  const updateCart = useCallback(
    (productId: string, strainName: string, delta: number) => {
      setCart((prev) => {
        const key = cartKey(productId, strainName);
        const existing = prev[key];
        const newCases = Math.max(0, (existing?.cases ?? 0) + delta);
        if (newCases === 0) {
          const next = {...prev};
          delete next[key];
          return next;
        }
        return {
          ...prev,
          [key]: {productId, strainName, cases: newCases},
        };
      });
    },
    [],
  );

  const setCases = useCallback(
    (productId: string, strainName: string, cases: number) => {
      setCart((prev) => {
        const key = cartKey(productId, strainName);
        if (cases <= 0) {
          const next = {...prev};
          delete next[key];
          return next;
        }
        return {
          ...prev,
          [key]: {productId, strainName, cases},
        };
      });
    },
    [],
  );

  const clearCart = useCallback(() => setCart({}), []);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.cases, 0),
    [cartItems],
  );

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const product = PRODUCT_LINES.find((p) => p.id === item.productId);
      if (!product) return sum;
      const unitPrice = applyDiscount(product.casePrice, product.discount);
      return sum + unitPrice * item.cases;
    }, 0);
  }, [cartItems]);

  // Compute earned budtender samples from cart
  const earnedSamples = useMemo(() => {
    return SAMPLE_RULES.map((rule) => {
      const totalCases = cartItems
        .filter((i) => i.productId === rule.productId)
        .reduce((sum, i) => sum + i.cases, 0);
      const qty = Math.floor(totalCases / rule.every);
      return {...rule, qty};
    }).filter((s) => s.qty > 0);
  }, [cartItems]);

  const totalSamples = useMemo(
    () => earnedSamples.reduce((sum, s) => sum + s.qty, 0),
    [earnedSamples],
  );

  // ── LeafLink Order Sync ─────────────────────────────────────────────────
  const [leaflinkStatus, setLeaflinkStatus] = useState<'idle' | 'sending' | 'success' | 'error' | 'skipped'>('idle');
  const [leaflinkMessage, setLeaflinkMessage] = useState<string | null>(null);

  const submitToLeafLink = useCallback(() => {
    if (!selectedAccount || cartItems.length === 0) return;

    // Build line items for LeafLink API
    const items = cartItems.map((item) => {
      const product = PRODUCT_LINES.find((p) => p.id === item.productId);
      if (!product) return null;
      const strain = product.strains.find((s) => s.name === item.strainName);
      if (!strain?.sku) return null;
      const unitPrice = applyDiscount(product.wholesale, product.discount);
      return {
        sku: strain.sku,
        quantity: item.cases * product.caseSize, // total units, not cases
        unitPrice,
      };
    }).filter(Boolean);

    if (items.length === 0) {
      setLeaflinkStatus('skipped');
      setLeaflinkMessage('No LeafLink-eligible products in cart');
      return;
    }

    setLeaflinkStatus('sending');
    setLeaflinkMessage(null);

    fetch('/api/leaflink-order', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        dispensaryName: selectedAccount.name,
        dispensaryId: selectedAccount.id,
        items,
        notes: orderNote.trim() || undefined,
      }),
    })
      .then((res) => res.json())
      .then((data: any) => {
        if (data.ok) {
          if (data.skipped) {
            setLeaflinkStatus('skipped');
            setLeaflinkMessage(data.message || 'No products synced to LeafLink');
          } else {
            setLeaflinkStatus('success');
            const matchNote = data.customerMatched
              ? `Matched to "${data.customerName}"`
              : 'Customer not matched — order created without buyer';
            setLeaflinkMessage(
              `LeafLink order ${data.orderNumber} created! ${data.itemsSynced} item(s) synced. ${matchNote}`,
            );
          }
        } else {
          setLeaflinkStatus('error');
          setLeaflinkMessage(data.error || 'Failed to create LeafLink order');
        }
      })
      .catch((err) => {
        setLeaflinkStatus('error');
        setLeaflinkMessage('Network error — LeafLink order not sent');
        console.error('[njmenu] LeafLink submission error:', err);
      });
  }, [selectedAccount, cartItems, orderNote]);

  // Build mailto order
  const buildOrderEmail = useCallback(() => {
    const lines: string[] = [
      'NEW JERSEY WHOLESALE ORDER',
      '═══════════════════════════════════════',
      '',
    ];

    // Include account/shop info if selected
    if (selectedAccount) {
      lines.push(`DISPENSARY: ${selectedAccount.name}`);
      if (selectedAccount.city) lines.push(`LOCATION: ${selectedAccount.city}, NJ`);
      if (selectedAccount.phone) lines.push(`PHONE: ${selectedAccount.phone}`);
      lines.push(`ZOHO ID: ${selectedAccount.id}`);
      lines.push('');
    }

    let total = 0;
    cartItems.forEach((item) => {
      const product = PRODUCT_LINES.find((p) => p.id === item.productId);
      if (!product) return;
      const unitPrice = applyDiscount(product.casePrice, product.discount);
      const lineTotal = unitPrice * item.cases;
      total += lineTotal;
      const strain = product.strains.find((s) => s.name === item.strainName);
      const skuTag = strain?.sku ? ` [${strain.sku}]` : '';
      lines.push(
        `${product.name} ${product.subtitle} — ${item.strainName}${skuTag}`,
      );
      lines.push(
        `  ${item.cases} case${item.cases > 1 ? 's' : ''} × ${formatCurrency(unitPrice)}/case = ${formatCurrency(lineTotal)}`,
      );
      lines.push(
        `  (${item.cases * product.caseSize} units @ ${formatCurrency(applyDiscount(product.wholesale, product.discount))}/unit)`,
      );
      if (product.discount) {
        lines.push(`  💰 ${product.discount.label} applied`);
      }
      lines.push('');
    });

    lines.push('═══════════════════════════════════════');
    lines.push(`ESTIMATED TOTAL: ${formatCurrency(total)}`);
    lines.push('');

    // Budtender samples
    if (earnedSamples.length > 0) {
      lines.push('───────────────────────────────────────');
      lines.push('FREE BUDTENDER SAMPLES INCLUDED:');
      earnedSamples.forEach((s) => {
        const strain = sampleStrains[s.id] || 'STRAIN TBD';
        const rule = SAMPLE_RULES.find((r) => r.id === s.id);
        const sampleSku = rule?.sampleSkus?.[strain] || '';
        lines.push(`  • ${s.qty}x ${s.label} — ${strain}${sampleSku ? ` (${sampleSku})` : ''}`);
      });
      lines.push('');
    }

    if (orderNote.trim()) {
      lines.push(`NOTE: ${orderNote.trim()}`);
      lines.push('');
    }
    lines.push('Please confirm availability and delivery timeline.');

    const shopName = selectedAccount?.name || 'Unknown Shop';
    const subject = encodeURIComponent(
      `Highsman NJ Order — ${shopName} — ${new Date().toLocaleDateString()}`,
    );
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:njsales@highsman.com?subject=${subject}&body=${body}`;
  }, [cartItems, orderNote, earnedSamples, sampleStrains, selectedAccount]);

  const getCasesForItem = (productId: string, strainName: string): number => {
    return cart[cartKey(productId, strainName)]?.cases ?? 0;
  };

  return (
    <>
      {/* ── Global Styles ──────────────────────────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');

        .font-headline { font-family: 'Teko', sans-serif; }
        .font-body { font-family: 'Barlow Semi Condensed', sans-serif; }

        .nj-menu * { box-sizing: border-box; }
        .nj-menu { font-family: 'Barlow Semi Condensed', sans-serif; color: #fff; background: #0A0A0A; min-height: 100vh; -webkit-font-smoothing: antialiased; }

        .nj-menu input[type="number"]::-webkit-inner-spin-button,
        .nj-menu input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .nj-menu input[type="number"] { -moz-appearance: textfield; }

        .nj-menu a { text-decoration: none; }

        .nj-menu select { -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23ffffff' d='M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; }
        .nj-menu select option { background: #1A1A1A; color: #fff; padding: 8px 12px; }

        .nj-menu .strain-row { transition: background 0.15s ease; }
        .nj-menu .strain-row:hover { background: rgba(255,255,255,0.03); }

        .nj-menu .product-card { transition: border-color 0.2s ease; }

        .nj-menu .strain-img {
          transition: transform 0.25s ease;
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
        }
        .nj-menu .strain-row:hover .strain-img { transform: scale(1.06); }

        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .slide-up { animation: slideUp 0.25s ease-out; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }

        /* Minimal stepper */
        .stepper-btn {
          width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
          font-family: 'Barlow Semi Condensed', sans-serif; font-weight: 600; font-size: 20px;
          cursor: pointer; transition: all 0.15s ease; border: none; user-select: none;
        }
        .stepper-btn:hover { opacity: 0.8; }

        /* Select reset */
        .nj-menu select { -webkit-appearance: none; appearance: none; }
      `,
        }}
      />

      <div className="nj-menu">
        {/* ── Top Bar ────────────────────────────────────────────────────── */}
        <nav
          className="flex items-center justify-between px-6 md:px-10 py-3"
          style={{background: '#000', borderBottom: '1px solid rgba(255,255,255,0.08)'}}
        >
          <Link
            to="/wholesale"
            className="font-body text-xs font-600 tracking-[0.12em] uppercase"
            style={{color: 'rgba(255,255,255,0.65)'}}
          >
            &larr; Wholesale Portal
          </Link>
          <a
            href="mailto:njsales@highsman.com"
            className="font-body text-xs font-600 tracking-[0.12em] uppercase"
            style={{color: 'rgba(255,255,255,0.65)'}}
          >
            njsales@highsman.com
          </a>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <header style={{background: '#000'}}>
          <div className="max-w-5xl mx-auto px-6 md:px-10 pt-16 pb-16 md:pt-24 md:pb-20">
            {/* Logo */}
            <div className="mb-14 md:mb-20">
              <img
                src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
                alt="Highsman"
                style={{height: 48, width: 'auto'}}
              />
            </div>

            {/* Split layout: text left, hero image right */}
            <div className="md:grid md:items-center" style={{gridTemplateColumns: '1fr 1fr', gap: '48px'}}>
              <div>
                {/* Title block */}
                <p
                  className="font-body text-sm font-600 tracking-[0.2em] uppercase mb-5"
                  style={{color: BRAND.gold}}
                >
                  New Jersey &middot; Wholesale
                </p>
                <h1
                  className="font-headline font-700 uppercase leading-[0.82] mb-6"
                  style={{fontSize: 'clamp(64px, 11vw, 130px)', letterSpacing: '-0.02em'}}
                >
                  Product<br />Menu
                </h1>
                <p
                  className="font-body text-lg md:text-xl leading-relaxed max-w-lg mb-10"
                  style={{color: 'rgba(255,255,255,0.55)', fontWeight: 400}}
                >
                  Select quantities and send your order directly. Or download the spreadsheet for offline ordering.
                  <br /><strong style={{color: '#fff', fontWeight: 700}}>All orders will be processed through Leaflink.</strong>
                </p>

                {/* CTAs — clean, no icons */}
                <div className="flex flex-wrap gap-4">
                  <a
                    href="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Menu_-_4.15.xlsx?v=1776303798"
                    download="Highsman_Menu_NJ.xlsx"
                    className="font-headline text-base font-600 uppercase tracking-[0.15em] px-9 py-4 transition-opacity hover:opacity-80"
                    style={{
                      border: `1.5px solid ${BRAND.gold}`,
                      color: BRAND.gold,
                    }}
                  >
                    Download Order Form
                  </a>
                  <button
                    onClick={() => {
                      setShowCart(true);
                      setTimeout(
                        () => cartRef.current?.scrollIntoView({behavior: 'smooth'}),
                        100,
                      );
                    }}
                    className="font-headline text-base font-600 uppercase tracking-[0.15em] px-9 py-4 transition-opacity hover:opacity-90 cursor-pointer"
                    style={{
                      background: BRAND.gold,
                      color: '#000',
                      border: 'none',
                    }}
                  >
                    View Order ({cartCount})
                  </button>
                </div>
              </div>

              {/* Hero product image — hidden on small mobile, visible md+ */}
              <div className="hidden md:block" style={{maxWidth: 620, flexShrink: 0}}>
                <img
                  src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Hero_Image_NJ_Menu.png?v=1776306734"
                  alt="Highsman Hit Stick — Triple Infused, all 5 strains"
                  className="w-full h-auto"
                  style={{filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))'}}
                />
              </div>
            </div>

            {/* Mobile hero image — stacked below CTAs */}
            <div className="md:hidden" style={{maxWidth: 520, margin: '40px auto 0'}}>
              <img
                src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Hero_Image_NJ_Menu.png?v=1776306734"
                alt="Highsman Hit Stick — Triple Infused, all 5 strains"
                className="w-full h-auto"
                style={{filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))'}}
              />
            </div>
          </div>

          {/* Divider line */}
          <div style={{height: 1, background: 'rgba(255,255,255,0.08)'}} />
        </header>

        {/* ── Account / Shop Identification ─────────────────────────────── */}
        <div className="max-w-5xl mx-auto px-6 md:px-10 pt-12 md:pt-16">
          <div
            className="relative"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '24px 28px',
            }}
          >
            <label
              className="font-body text-xs font-600 tracking-[0.2em] uppercase mb-3 block"
              style={{color: BRAND.gold}}
              htmlFor="account-search"
            >
              Your Dispensary
            </label>

            {selectedAccount ? (
              /* ── Selected state ─────────────────────────────────────── */
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-headline text-xl md:text-2xl font-600 uppercase tracking-wide" style={{color: '#fff'}}>
                    {selectedAccount.name}
                  </p>
                  <p className="font-body text-sm mt-1" style={{color: 'rgba(255,255,255,0.55)'}}>
                    {selectedAccount.city ? `${selectedAccount.city}, NJ` : 'NJ'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedAccount(null);
                    setAccountQuery('');
                    setTimeout(() => accountInputRef.current?.focus(), 50);
                  }}
                  className="font-body text-xs font-600 uppercase tracking-[0.15em] px-4 py-2 cursor-pointer transition-opacity hover:opacity-80"
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.6)',
                    borderRadius: 4,
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              /* ── Search state ───────────────────────────────────────── */
              <div className="relative">
                <input
                  ref={accountInputRef}
                  id="account-search"
                  type="text"
                  value={accountQuery}
                  onChange={(e) => {
                    setAccountQuery(e.target.value);
                    setShowAccountDropdown(e.target.value.length >= 2);
                    setShowNewAccountForm(false);
                  }}
                  onFocus={() => {
                    if (accountQuery.length >= 2) setShowAccountDropdown(true);
                  }}
                  placeholder="Start typing your dispensary name…"
                  autoComplete="off"
                  className="w-full font-body text-base md:text-lg"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '14px 16px',
                    color: '#fff',
                    outline: 'none',
                  }}
                />
                {isSearching && (
                  <div
                    className="absolute right-4 top-1/2 -translate-y-1/2 font-body text-xs"
                    style={{color: 'rgba(255,255,255,0.4)'}}
                  >
                    Searching…
                  </div>
                )}

                {/* ── Dropdown results ────────────────────────────────── */}
                {showAccountDropdown && accountResults.length > 0 && !showNewAccountForm && (
                  <div
                    ref={accountDropdownRef}
                    className="absolute left-0 right-0 z-50 mt-2 overflow-hidden"
                    style={{
                      background: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                      maxHeight: 320,
                      overflowY: 'auto',
                    }}
                  >
                    {accountResults.map((acct) => (
                      <button
                        key={acct.id}
                        onClick={() => {
                          setSelectedAccount(acct);
                          setAccountQuery(acct.name);
                          setShowAccountDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 cursor-pointer transition-colors"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          color: '#fff',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,228,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                      >
                        <span className="font-body text-sm font-600">{acct.name}</span>
                        {acct.city && (
                          <span className="font-body text-xs ml-2" style={{color: 'rgba(255,255,255,0.45)'}}>
                            {acct.city}, NJ
                          </span>
                        )}
                      </button>
                    ))}
                    {/* Add New option at bottom of results */}
                    <button
                      onClick={() => {
                        setShowAccountDropdown(false);
                        setShowNewAccountForm(true);
                      }}
                      className="w-full text-left px-4 py-3 cursor-pointer font-body text-sm font-600"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderTop: '1px solid rgba(255,255,255,0.12)',
                        color: BRAND.gold,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,228,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      + Add New Dispensary
                    </button>
                  </div>
                )}

                {/* No results — prominent Add New option */}
                {showAccountDropdown && !showNewAccountForm && accountQuery.length >= 2 && accountResults.length === 0 && (
                  <div
                    className="absolute left-0 right-0 z-50 mt-2 px-4 py-3"
                    style={{
                      background: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6,
                    }}
                  >
                    <p className="font-body text-sm mb-3" style={{color: 'rgba(255,255,255,0.5)'}}>
                      No dispensary found for "{accountQuery}"
                    </p>
                    <button
                      onClick={() => {
                        setShowAccountDropdown(false);
                        setShowNewAccountForm(true);
                      }}
                      className="font-headline text-sm font-600 uppercase tracking-[0.15em] px-5 py-2.5 cursor-pointer transition-opacity hover:opacity-85"
                      style={{background: BRAND.gold, color: '#000', border: 'none', borderRadius: 4}}
                    >
                      + Add New Dispensary
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── New Dispensary Registration Form ──────────────────────── */}
            {showNewAccountForm && !selectedAccount && (
              <div
                className="mt-4"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '20px 24px',
                }}
              >
                <div className="flex items-center justify-between mb-5">
                  <p className="font-headline text-base font-600 uppercase tracking-[0.12em]" style={{color: '#fff'}}>
                    Register New Dispensary
                  </p>
                  <button
                    onClick={() => {
                      setShowNewAccountForm(false);
                      setNewAccountError(null);
                    }}
                    className="font-body text-xs uppercase tracking-wider cursor-pointer"
                    style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)'}}
                  >
                    Cancel
                  </button>
                </div>

                <createAccountFetcher.Form method="post" action="/api/accounts" className="space-y-4">
                  {/* Dispensary Name */}
                  <div>
                    <label className="font-body text-xs font-600 tracking-wider uppercase block mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                      Dispensary Name *
                    </label>
                    <input
                      name="dispensaryName"
                      type="text"
                      required
                      defaultValue={accountQuery}
                      placeholder="e.g. Green Leaf NJ"
                      className="w-full font-body text-sm"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        padding: '10px 14px',
                        color: '#fff',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Contact Name + Job Role — side by side on desktop */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-body text-xs font-600 tracking-wider uppercase block mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                        Contact Name *
                      </label>
                      <input
                        name="contactName"
                        type="text"
                        required
                        placeholder="First Last"
                        className="w-full font-body text-sm"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 4,
                          padding: '10px 14px',
                          color: '#fff',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label className="font-body text-xs font-600 tracking-wider uppercase block mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                        Job Role
                      </label>
                      <select
                        name="jobRole"
                        className="w-full font-body text-sm"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 4,
                          padding: '10px 14px',
                          color: '#fff',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          appearance: 'none' as any,
                        }}
                      >
                        <option value="" style={{background: '#1A1A1A', color: '#fff'}}>Select role…</option>
                        <option value="Owner" style={{background: '#1A1A1A', color: '#fff'}}>Owner</option>
                        <option value="General Manager" style={{background: '#1A1A1A', color: '#fff'}}>General Manager</option>
                        <option value="Buyer / Purchasing" style={{background: '#1A1A1A', color: '#fff'}}>Buyer / Purchasing</option>
                        <option value="Dispensary Manager" style={{background: '#1A1A1A', color: '#fff'}}>Dispensary Manager</option>
                        <option value="Budtender" style={{background: '#1A1A1A', color: '#fff'}}>Budtender</option>
                        <option value="Other" style={{background: '#1A1A1A', color: '#fff'}}>Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Phone + Email — side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="font-body text-xs font-600 tracking-wider uppercase block mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                        Phone
                      </label>
                      <input
                        name="phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        className="w-full font-body text-sm"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 4,
                          padding: '10px 14px',
                          color: '#fff',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label className="font-body text-xs font-600 tracking-wider uppercase block mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                        Email *
                      </label>
                      <input
                        name="email"
                        type="email"
                        required
                        placeholder="you@dispensary.com"
                        className="w-full font-body text-sm"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 4,
                          padding: '10px 14px',
                          color: '#fff',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* Address with autocomplete */}
                  <div className="relative">
                    <label className="font-body text-xs font-600 tracking-wider uppercase block mb-1.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                      Dispensary Address
                    </label>
                    <input
                      type="text"
                      value={selectedAddress ? selectedAddress.display : addressQuery}
                      onChange={(e) => {
                        setAddressQuery(e.target.value);
                        setSelectedAddress(null);
                        if (e.target.value.length < 3) setShowAddressDropdown(false);
                      }}
                      onFocus={() => {
                        if (addressPredictions.length > 0 && !selectedAddress) setShowAddressDropdown(true);
                      }}
                      placeholder="Start typing address…"
                      autoComplete="off"
                      className="w-full font-body text-sm"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: `1px solid ${selectedAddress ? 'rgba(245,228,0,0.3)' : 'rgba(255,255,255,0.15)'}`,
                        borderRadius: 4,
                        padding: '10px 14px',
                        color: '#fff',
                        outline: 'none',
                      }}
                    />
                    {/* Hidden fields for form submission */}
                    <input type="hidden" name="street" value={selectedAddress?.street || ''} />
                    <input type="hidden" name="city" value={selectedAddress?.city || ''} />
                    <input type="hidden" name="state" value={selectedAddress?.state || 'NJ'} />
                    <input type="hidden" name="zip" value={selectedAddress?.zip || ''} />

                    {showAddressDropdown && addressPredictions.length > 0 && (
                      <div
                        ref={addressDropdownRef}
                        className="absolute left-0 right-0 z-50 mt-1 overflow-hidden"
                        style={{
                          background: '#1A1A1A',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 4,
                          maxHeight: 220,
                          overflowY: 'auto',
                        }}
                      >
                        {addressPredictions.map((pred) => (
                          <button
                            key={pred.placeId}
                            type="button"
                            onClick={() => selectPlacePrediction(pred)}
                            className="w-full text-left px-4 py-2.5 cursor-pointer font-body text-sm"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              color: '#fff',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,228,0,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            }}
                          >
                            <span style={{color: '#fff'}}>{pred.mainText}</span>
                            {pred.secondaryText && (
                              <span style={{color: 'rgba(255,255,255,0.5)', marginLeft: 6, fontSize: '0.85em'}}>{pred.secondaryText}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {addressLoading && (
                      <div className="font-body text-xs mt-1" style={{color: 'rgba(255,255,255,0.4)'}}>
                        Loading address…
                      </div>
                    )}
                  </div>

                  {/* Error message */}
                  {newAccountError && (
                    <p className="font-body text-sm" style={{color: '#ef4444'}}>{newAccountError}</p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={createAccountFetcher.state === 'submitting'}
                    className="font-headline text-sm font-600 uppercase tracking-[0.15em] px-8 py-3.5 cursor-pointer transition-opacity hover:opacity-90"
                    style={{
                      background: BRAND.gold,
                      color: '#000',
                      border: 'none',
                      borderRadius: 4,
                      opacity: createAccountFetcher.state === 'submitting' ? 0.6 : 1,
                    }}
                  >
                    {createAccountFetcher.state === 'submitting' ? 'Creating Account…' : 'Register & Start Ordering'}
                  </button>
                </createAccountFetcher.Form>
              </div>
            )}

            {!selectedAccount && !showNewAccountForm && (
              <p className="font-body text-xs mt-3" style={{color: 'rgba(255,255,255,0.35)'}}>
                Select your shop so we can attach your account to this order.{' '}
                <button
                  onClick={() => setShowNewAccountForm(true)}
                  className="underline cursor-pointer"
                  style={{background: 'transparent', border: 'none', color: BRAND.gold, fontSize: 'inherit'}}
                >
                  New dispensary? Register here.
                </button>
              </p>
            )}
          </div>
        </div>

        {/* ── Product Lines ──────────────────────────────────────────────── */}
        <div ref={menuRef} className="max-w-5xl mx-auto px-6 md:px-10 py-16 md:py-24">

          {/* Section label */}
          <p
            className="font-body text-xs font-600 tracking-[0.25em] uppercase mb-16"
            style={{color: 'rgba(255,255,255,0.6)'}}
          >
            Product Catalog &mdash; {PRODUCT_LINES.length} Lines &middot; {PRODUCT_LINES.reduce((n, p) => n + p.strains.length, 0)} SKUs
          </p>

          {/* Product Cards */}
          {PRODUCT_LINES.map((product) => {
            const isExpanded = expandedProduct === product.id;
            const discountedWholesale = applyDiscount(product.wholesale, product.discount);
            const discountedCase = applyDiscount(product.casePrice, product.discount);
            const marginPct = Math.round(((product.rrp - discountedWholesale) / product.rrp) * 100);
            const headerThumb = product.fixedImageUrl ?? strainImage(product.strains[0].name, product.imageType);

            return (
              <section
                key={product.id}
                className="product-card mb-1"
                style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}
              >
                {/* Product Header */}
                <button
                  onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                  className="w-full flex items-center gap-6 md:gap-10 py-8 md:py-10 text-left"
                  style={{background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'}}
                >
                  {/* Product image */}
                  <div
                    className="flex-shrink-0 hidden md:flex items-center justify-center"
                    style={{width: 80, height: 80, background: product.imageBg ?? 'transparent'}}
                  >
                    <img src={headerThumb} alt={product.name} style={{width: 80, height: 80, objectFit: 'contain'}} />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-headline font-600 uppercase leading-[0.9] tracking-tight" style={{fontSize: 'clamp(28px, 5vw, 48px)'}}>
                      {product.name} <span style={{color: BRAND.gold}}>{product.subtitle}</span>
                    </h2>
                    <p className="font-body text-sm mt-2" style={{color: 'rgba(255,255,255,0.6)'}}>
                      {product.weight} &middot; {product.format} &middot; Case of {product.caseSize}
                    </p>
                  </div>

                  {/* Key numbers — clean typography, no boxes */}
                  <div className="hidden md:flex items-center gap-10 flex-shrink-0">
                    <div className="text-right">
                      <span className="font-headline text-3xl font-600 block leading-none" style={{color: '#fff'}}>
                        {formatCurrency(discountedWholesale)}
                      </span>
                      <span className="font-body text-xs" style={{color: 'rgba(255,255,255,0.6)'}}>per unit wholesale</span>
                    </div>
                    <div className="text-right">
                      <span className="font-headline text-3xl font-600 block leading-none" style={{color: BRAND.gold}}>
                        {marginPct}%
                      </span>
                      <span className="font-body text-xs" style={{color: 'rgba(255,255,255,0.6)'}}>retail margin</span>
                    </div>
                    <span
                      className="font-headline text-2xl font-300 transition-transform"
                      style={{color: 'rgba(255,255,255,0.55)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease'}}
                    >
                      &#8964;
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="fade-in pb-10">
                    {/* Pricing strip — horizontal, minimal */}
                    <div className="flex flex-wrap gap-x-10 gap-y-2 mb-8 pl-0 md:pl-[120px]">
                      {[
                        {l: 'Unit', v: formatCurrency(discountedWholesale)},
                        {l: `Case of ${product.caseSize}`, v: formatCurrency(discountedCase)},
                        {l: 'RRP', v: formatCurrency(product.rrp)},
                        {l: 'Margin', v: `${marginPct}%`, gold: true},
                      ].map((d) => (
                        <div key={d.l} className="flex items-baseline gap-2">
                          <span className="font-body text-xs font-500 uppercase tracking-[0.15em]" style={{color: 'rgba(255,255,255,0.55)'}}>{d.l}</span>
                          <span className="font-headline text-lg font-600" style={{color: (d as any).gold ? BRAND.gold : '#fff'}}>{d.v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Discount callout */}
                    {product.discount && (
                      <div className="mb-6 pl-0 md:pl-[120px]">
                        <p className="font-body text-sm" style={{color: '#ff6b35'}}>
                          {product.discount.label} &mdash; {product.discount.percent}% off.
                          Was {formatCurrency(product.wholesale)}/unit, now <strong>{formatCurrency(discountedWholesale)}/unit</strong>
                        </p>
                      </div>
                    )}

                    {/* Quick order — subtle */}
                    <div className="flex items-center gap-3 mb-6 pl-0 md:pl-[120px]">
                      <span className="font-body text-xs font-500 tracking-[0.15em] uppercase" style={{color: 'rgba(255,255,255,0.55)'}}>Quick</span>
                      <button
                        onClick={() => product.strains.forEach((s) => { if (getCasesForItem(product.id, s.name) > 0) updateCart(product.id, s.name, -1); })}
                        className="font-headline text-sm font-600 uppercase tracking-[0.1em] px-5 py-2.5 cursor-pointer transition-opacity hover:opacity-70"
                        style={{background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)'}}
                      >
                        −1 Each
                      </button>
                      <button
                        onClick={() => product.strains.forEach((s) => updateCart(product.id, s.name, 1))}
                        className="font-headline text-sm font-600 uppercase tracking-[0.1em] px-5 py-2.5 cursor-pointer transition-opacity hover:opacity-90"
                        style={{background: BRAND.gold, border: 'none', color: '#000'}}
                      >
                        +1 Each
                      </button>
                    </div>

                    {/* Strain table header */}
                    <div
                      className="hidden md:grid items-center gap-4 px-0 md:pl-[120px] pb-3 mb-0 font-body text-[10px] font-600 tracking-[0.2em] uppercase"
                      style={{color: 'rgba(255,255,255,0.65)', gridTemplateColumns: '1fr 80px 70px 56px 120px'}}
                    >
                      <span>Strain</span>
                      <span>Type</span>
                      <span>THC</span>
                      <span>SKU</span>
                      <span className="text-right">Cases</span>
                    </div>

                    {/* Strain Rows */}
                    <div>
                      {product.strains.map((strain) => {
                        const cases = getCasesForItem(product.id, strain.name);
                        const imgSrc = product.fixedImageUrl ?? strainImage(strain.name, product.imageType);
                        const outOfStock = !isInStock(strain.sku);
                        return (
                          <div
                            key={strain.name}
                            className="strain-row flex items-center gap-4 md:gap-0 py-4 md:py-5"
                            style={{
                              borderTop: '1px solid rgba(255,255,255,0.05)',
                              paddingLeft: 0,
                              background: cases > 0 ? 'rgba(245,228,0,0.03)' : 'transparent',
                              opacity: outOfStock ? 0.4 : 1,
                              filter: outOfStock ? 'grayscale(100%)' : 'none',
                            }}
                          >
                            {/* Image — aligned with header thumbs */}
                            <div
                              className="flex-shrink-0 hidden md:flex items-center justify-center"
                              style={{width: 80, height: 80, marginRight: 40, background: product.imageBg ?? 'transparent'}}
                            >
                              <img
                                src={imgSrc}
                                alt={`${product.name} ${strain.name}`}
                                className="strain-img"
                                style={{width: 80, height: 80, objectFit: 'contain'}}
                                loading="lazy"
                              />
                            </div>

                            {/* Mobile: image + info stacked */}
                            <div
                              className="flex-shrink-0 flex md:hidden items-center justify-center"
                              style={{width: 56, height: 56, background: product.imageBg ?? 'transparent'}}
                            >
                              <img src={imgSrc} alt={strain.name} className="strain-img" style={{width: 56, height: 56, objectFit: 'contain'}} loading="lazy" />
                            </div>

                            {/* Desktop grid row */}
                            <div className="hidden md:grid flex-1 items-center gap-4" style={{gridTemplateColumns: '1fr 80px 70px 56px 120px'}}>
                              {/* Strain name */}
                              <div>
                                <span className="font-headline font-600 text-2xl text-white uppercase leading-none tracking-tight block">
                                  {strain.name}
                                </span>
                                {cases > 0 && (
                                  <span className="font-body text-xs font-500 mt-1 block" style={{color: BRAND.gold}}>
                                    {cases * product.caseSize} units &middot; {formatCurrency(discountedCase * cases)}
                                  </span>
                                )}
                              </div>
                              {/* Type */}
                              <span className="font-body text-xs font-500 uppercase tracking-wider" style={{color: 'rgba(255,255,255,0.65)'}}>
                                {strain.type}
                              </span>
                              {/* THC */}
                              <span className="font-body text-xs font-600" style={{color: 'rgba(255,255,255,0.7)'}}>
                                {product.thcDisplay ?? strain.thc}
                              </span>
                              {/* SKU */}
                              <span className="font-body text-[10px] tracking-wider" style={{color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace, monospace'}}>
                                {strain.sku ? strain.sku.split('-').pop() : '—'}
                              </span>
                              {/* Stepper or Out of Stock */}
                              {outOfStock ? (
                                <div className="flex items-center justify-end">
                                  <span
                                    className="font-body text-[10px] font-700 uppercase tracking-wider px-3 py-1.5 rounded"
                                    style={{background: 'rgba(255,60,60,0.15)', color: '#ff6b6b', border: '1px solid rgba(255,60,60,0.25)'}}
                                  >
                                    Out of Stock
                                  </span>
                                </div>
                              ) : (
                              <div className="flex items-center justify-end gap-0">
                                <button
                                  onClick={() => updateCart(product.id, strain.name, -1)}
                                  disabled={cases === 0}
                                  className="stepper-btn"
                                  style={{
                                    background: cases > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: cases > 0 ? '#fff' : 'rgba(255,255,255,0.35)',
                                    cursor: cases > 0 ? 'pointer' : 'default',
                                  }}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  value={cases}
                                  onChange={(e) => setCases(product.id, strain.name, parseInt(e.target.value, 10) || 0)}
                                  className="font-headline text-base font-600 text-center"
                                  style={{
                                    width: 44, height: 36,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: cases > 0 ? `1px solid ${BRAND.gold}50` : '1px solid rgba(255,255,255,0.08)',
                                    color: cases > 0 ? BRAND.gold : 'rgba(255,255,255,0.6)',
                                    outline: 'none',
                                  }}
                                />
                                <button
                                  onClick={() => updateCart(product.id, strain.name, 1)}
                                  className="stepper-btn"
                                  style={{
                                    background: cases > 0 ? BRAND.gold : 'rgba(255,255,255,0.08)',
                                    color: cases > 0 ? '#000' : '#fff',
                                  }}
                                >
                                  +
                                </button>
                              </div>
                              )}
                            </div>

                            {/* Mobile layout */}
                            <div className="flex md:hidden flex-1 items-center justify-between min-w-0">
                              <div className="min-w-0">
                                <span className="font-headline font-600 text-lg text-white uppercase leading-none block truncate">{strain.name}</span>
                                <span className="font-body text-xs block mt-0.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                                  {strain.type} &middot; {product.thcDisplay ?? strain.thc}
                                </span>
                              </div>
                              {outOfStock ? (
                                <div className="flex-shrink-0 ml-3">
                                  <span
                                    className="font-body text-[9px] font-700 uppercase tracking-wider px-2 py-1 rounded"
                                    style={{background: 'rgba(255,60,60,0.15)', color: '#ff6b6b', border: '1px solid rgba(255,60,60,0.25)'}}
                                  >
                                    Out of Stock
                                  </span>
                                </div>
                              ) : (
                              <div className="flex items-center gap-0 flex-shrink-0 ml-3">
                                <button onClick={() => updateCart(product.id, strain.name, -1)} disabled={cases === 0}
                                  className="stepper-btn" style={{background: cases > 0 ? 'rgba(255,255,255,0.08)' : 'transparent', color: cases > 0 ? '#fff' : 'rgba(255,255,255,0.35)', width: 40, height: 40, fontSize: 18}}>−</button>
                                <input type="number" min={0} value={cases}
                                  onChange={(e) => setCases(product.id, strain.name, parseInt(e.target.value, 10) || 0)}
                                  className="font-headline text-sm font-600 text-center"
                                  style={{width: 44, height: 40, background: 'rgba(255,255,255,0.04)', border: cases > 0 ? `1px solid ${BRAND.gold}50` : '1px solid rgba(255,255,255,0.08)', color: cases > 0 ? BRAND.gold : 'rgba(255,255,255,0.6)', outline: 'none'}} />
                                <button onClick={() => updateCart(product.id, strain.name, 1)}
                                  className="stepper-btn" style={{background: cases > 0 ? BRAND.gold : 'rgba(255,255,255,0.08)', color: cases > 0 ? '#000' : '#fff', width: 40, height: 40, fontSize: 18}}>+</button>
                              </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* ── Order Summary / Cart ────────────────────────────────────────── */}
        <div
          ref={cartRef}
          className="max-w-5xl mx-auto px-6 md:px-10 pb-32"
          style={{display: showCart || cartCount > 0 ? 'block' : 'none'}}
        >
          <div style={{borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 48}}>
            <div className="flex items-baseline justify-between mb-8">
              <h2 className="font-headline text-4xl md:text-5xl font-600 uppercase tracking-tight">
                Your Order
              </h2>
              <div className="flex items-center gap-6">
                <span className="font-body text-sm" style={{color: 'rgba(255,255,255,0.6)'}}>
                  {cartCount} case{cartCount !== 1 ? 's' : ''}
                </span>
                {cartCount > 0 && (
                  <button
                    onClick={clearCart}
                    className="font-body text-xs font-500 tracking-[0.1em] uppercase cursor-pointer hover:opacity-70 transition-opacity"
                    style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.55)'}}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {cartCount === 0 ? (
              <div className="py-16 text-center">
                <p className="font-body text-base" style={{color: 'rgba(255,255,255,0.55)'}}>
                  No items yet. Select quantities from the catalog above.
                </p>
              </div>
            ) : (
              <>
                {/* Cart line items */}
                <div className="mb-8">
                  {cartItems.map((item) => {
                    const product = PRODUCT_LINES.find((p) => p.id === item.productId);
                    if (!product) return null;
                    const unitPrice = applyDiscount(product.casePrice, product.discount);
                    return (
                      <div
                        key={cartKey(item.productId, item.strainName)}
                        className="flex items-center justify-between py-4"
                        style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm font-600">{product.name} {product.subtitle}</p>
                          <p className="font-body text-xs" style={{color: 'rgba(255,255,255,0.6)'}}>{item.strainName}</p>
                        </div>
                        <div className="flex items-center gap-5 flex-shrink-0">
                          <div className="flex items-center gap-0">
                            <button onClick={() => updateCart(item.productId, item.strainName, -1)}
                              className="stepper-btn" style={{width: 36, height: 36, fontSize: 16, background: 'rgba(255,255,255,0.06)', color: '#fff'}}>−</button>
                            <span className="font-headline text-sm font-600 w-8 text-center">{item.cases}</span>
                            <button onClick={() => updateCart(item.productId, item.strainName, 1)}
                              className="stepper-btn" style={{width: 36, height: 36, fontSize: 16, background: 'rgba(255,255,255,0.06)', color: '#fff'}}>+</button>
                          </div>
                          <span className="font-headline text-sm font-600 w-20 text-right" style={{color: '#fff'}}>
                            {formatCurrency(unitPrice * item.cases)}
                          </span>
                          <button onClick={() => setCases(item.productId, item.strainName, 0)}
                            className="cursor-pointer font-body text-lg leading-none hover:opacity-60 transition-opacity"
                            style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.65)'}}>
                            &times;
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Budtender Samples */}
                {earnedSamples.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-baseline justify-between mb-4">
                      <p className="font-headline text-xl font-600 uppercase tracking-tight">
                        Budtender Samples <span style={{color: BRAND.gold}}>Included</span>
                      </p>
                      <span className="font-body text-xs font-500" style={{color: 'rgba(255,255,255,0.6)'}}>
                        {totalSamples} free unit{totalSamples !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {earnedSamples.map((sample) => (
                      <div key={sample.id} className="flex items-center justify-between py-3" style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                        <div>
                          <span className="font-body text-sm font-600">{sample.qty}&times; {sample.label}</span>
                          <span className="font-body text-xs ml-2" style={{color: 'rgba(255,255,255,0.55)'}}>{sample.unit}</span>
                        </div>
                        <select
                          value={sampleStrains[sample.id] ?? ''}
                          onChange={(e) => setSampleStrains((prev) => ({...prev, [sample.id]: e.target.value}))}
                          className="font-body text-sm font-500 px-3 py-2.5 cursor-pointer"
                          style={{
                            background: '#1A1A1A',
                            border: sampleStrains[sample.id] ? `1px solid ${BRAND.gold}` : '1px solid rgba(255,255,255,0.15)',
                            color: sampleStrains[sample.id] ? '#fff' : 'rgba(255,255,255,0.6)',
                            outline: 'none', minWidth: 180, borderRadius: 0,
                          }}
                        >
                          <option value="">Choose strain</option>
                          {STRAINS.map((s) => (<option key={s.name} value={s.name}>{s.name}</option>))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {/* Note */}
                <div className="mb-8">
                  <label className="font-body text-xs font-500 tracking-[0.15em] uppercase block mb-2" style={{color: 'rgba(255,255,255,0.55)'}}>
                    Order Note
                  </label>
                  <textarea
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Special instructions, delivery preferences..."
                    rows={2}
                    className="w-full px-4 py-3 font-body text-sm resize-none"
                    style={{background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', outline: 'none'}}
                  />
                </div>

                {/* Total + Submit */}
                <div className="flex items-center justify-between py-6 mb-6" style={{borderTop: '1px solid rgba(255,255,255,0.08)'}}>
                  <span className="font-headline text-xl font-600 uppercase tracking-wider">Estimated Total</span>
                  <span className="font-headline text-4xl font-700" style={{color: BRAND.gold}}>{formatCurrency(cartTotal)}</span>
                </div>

                {!selectedAccount && (
                  <div
                    className="flex items-center gap-3 mb-4 px-4 py-3"
                    style={{background: 'rgba(245,228,0,0.08)', border: '1px solid rgba(245,228,0,0.25)', borderRadius: 6}}
                  >
                    <span className="font-body text-sm" style={{color: BRAND.gold}}>
                      ⚠ Select your dispensary above so we can attach your account to this order.
                    </span>
                  </div>
                )}
                <a
                  href={buildOrderEmail()}
                  onClick={() => {
                    // Fire LeafLink order in background when email is sent
                    submitToLeafLink();
                  }}
                  className="block font-headline text-lg font-600 uppercase tracking-[0.15em] py-5 w-full text-center transition-opacity hover:opacity-90"
                  style={{background: BRAND.gold, color: '#000'}}
                >
                  Send Order{selectedAccount ? ` — ${selectedAccount.name}` : ' to Highsman'}
                </a>
                {leaflinkStatus === 'sending' && (
                  <p className="font-body text-xs text-center mt-3" style={{color: BRAND.gold}}>
                    Syncing to LeafLink...
                  </p>
                )}
                {leaflinkStatus === 'success' && leaflinkMessage && (
                  <p className="font-body text-xs text-center mt-3" style={{color: BRAND.green}}>
                    ✓ {leaflinkMessage}
                  </p>
                )}
                {leaflinkStatus === 'error' && leaflinkMessage && (
                  <p className="font-body text-xs text-center mt-3" style={{color: '#ef4444'}}>
                    ✗ {leaflinkMessage}
                  </p>
                )}
                {leaflinkStatus === 'skipped' && leaflinkMessage && (
                  <p className="font-body text-xs text-center mt-3" style={{color: 'rgba(255,255,255,0.45)'}}>
                    {leaflinkMessage}
                  </p>
                )}
                <p className="font-body text-xs text-center mt-3" style={{color: 'rgba(255,255,255,0.55)'}}>
                  Opens your email client with the order pre-filled. Your rep will confirm.
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Sticky Bottom Bar ──────────────────────────────────────────── */}
        {cartCount > 0 && !showCart && (
          <div
            className="fixed bottom-0 left-0 right-0 z-50 slide-up"
            style={{background: '#000', borderTop: `1px solid ${BRAND.gold}`}}
          >
            <div className="max-w-5xl mx-auto flex items-center justify-between px-6 md:px-10 py-3">
              <span className="font-headline text-base font-600">
                {cartCount} case{cartCount !== 1 ? 's' : ''} &middot;{' '}
                <span style={{color: BRAND.gold}}>{formatCurrency(cartTotal)}</span>
              </span>
              <button
                onClick={() => { setShowCart(true); setTimeout(() => cartRef.current?.scrollIntoView({behavior: 'smooth'}), 100); }}
                className="font-headline text-base font-600 uppercase tracking-[0.12em] px-8 py-3.5 cursor-pointer transition-opacity hover:opacity-90"
                style={{background: BRAND.gold, color: '#000', border: 'none'}}
              >
                Review Order &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="px-6 md:px-10 pt-20 pb-12 text-center" style={{borderTop: '1px solid rgba(255,255,255,0.06)'}}>
          <img
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Spark_Greatness_White.png?v=1775594430"
            alt="Spark Greatness™"
            style={{height: 24, width: 'auto', margin: '0 auto 20px', display: 'block', opacity: 0.6}}
          />
          <p className="font-body text-sm mb-2" style={{color: 'rgba(255,255,255,0.6)'}}>
            <a href="mailto:njsales@highsman.com" style={{color: 'rgba(255,255,255,0.65)'}}>njsales@highsman.com</a>
          </p>
          <p className="font-body text-xs" style={{color: 'rgba(255,255,255,0.45)'}}>
            &copy; {new Date().getFullYear()} Highsman Inc. All rights reserved. Prices subject to change.
          </p>
        </footer>

        {/* ── Toast ──────────────────────────────────────────────────────── */}
        {toast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] fade-in px-5 py-3"
            style={{background: '#000', border: `1px solid ${BRAND.gold}40`, color: '#fff'}}
          >
            <span className="font-body text-sm font-500">{toast}</span>
          </div>
        )}
      </div>
    </>
  );
}
