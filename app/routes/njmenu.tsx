import {useState, useRef, useCallback, useMemo, useEffect} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';

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
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function NJMenu() {
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

  // Build mailto order
  const buildOrderEmail = useCallback(() => {
    const lines: string[] = [
      'NEW JERSEY WHOLESALE ORDER',
      '═══════════════════════════════════════',
      '',
    ];

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

    const subject = encodeURIComponent(
      `Highsman NJ Wholesale Order — ${new Date().toLocaleDateString()}`,
    );
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:njsales@highsman.com?subject=${subject}&body=${body}`;
  }, [cartItems, orderNote, earnedSamples, sampleStrains]);

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
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          font-family: 'Barlow Semi Condensed', sans-serif; font-weight: 600; font-size: 18px;
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
                </p>

                {/* CTAs — clean, no icons */}
                <div className="flex flex-wrap gap-4">
                  <a
                    href="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Menu_-_4.15.xlsx?v=1776303798"
                    download="Highsman_Menu_NJ.xlsx"
                    className="font-headline text-sm font-600 uppercase tracking-[0.15em] px-7 py-3 transition-opacity hover:opacity-80"
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
                    className="font-headline text-sm font-600 uppercase tracking-[0.15em] px-7 py-3 transition-opacity hover:opacity-90 cursor-pointer"
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
                  src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Hero_Image_NJ_Menu.png?v=1776306732"
                  alt="Highsman Hit Stick — Triple Infused, all 5 strains"
                  className="w-full h-auto"
                  style={{filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))'}}
                />
              </div>
            </div>

            {/* Mobile hero image — stacked below CTAs */}
            <div className="md:hidden" style={{maxWidth: 520, margin: '40px auto 0'}}>
              <img
                src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Hero_Image_NJ_Menu.png?v=1776306732"
                alt="Highsman Hit Stick — Triple Infused, all 5 strains"
                className="w-full h-auto"
                style={{filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))'}}
              />
            </div>
          </div>

          {/* Divider line */}
          <div style={{height: 1, background: 'rgba(255,255,255,0.08)'}} />
        </header>

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
                        className="font-headline text-xs font-600 uppercase tracking-[0.1em] px-4 py-2 cursor-pointer transition-opacity hover:opacity-70"
                        style={{background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)'}}
                      >
                        −1 Each
                      </button>
                      <button
                        onClick={() => product.strains.forEach((s) => updateCart(product.id, s.name, 1))}
                        className="font-headline text-xs font-600 uppercase tracking-[0.1em] px-4 py-2 cursor-pointer transition-opacity hover:opacity-90"
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
                        return (
                          <div
                            key={strain.name}
                            className="strain-row flex items-center gap-4 md:gap-0 py-4 md:py-5"
                            style={{
                              borderTop: '1px solid rgba(255,255,255,0.05)',
                              paddingLeft: 0,
                              background: cases > 0 ? 'rgba(245,228,0,0.03)' : 'transparent',
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
                              {/* Stepper */}
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
                            </div>

                            {/* Mobile layout */}
                            <div className="flex md:hidden flex-1 items-center justify-between min-w-0">
                              <div className="min-w-0">
                                <span className="font-headline font-600 text-lg text-white uppercase leading-none block truncate">{strain.name}</span>
                                <span className="font-body text-xs block mt-0.5" style={{color: 'rgba(255,255,255,0.6)'}}>
                                  {strain.type} &middot; {product.thcDisplay ?? strain.thc}
                                </span>
                              </div>
                              <div className="flex items-center gap-0 flex-shrink-0 ml-3">
                                <button onClick={() => updateCart(product.id, strain.name, -1)} disabled={cases === 0}
                                  className="stepper-btn" style={{background: cases > 0 ? 'rgba(255,255,255,0.08)' : 'transparent', color: cases > 0 ? '#fff' : 'rgba(255,255,255,0.35)', width: 32, height: 32, fontSize: 16}}>−</button>
                                <input type="number" min={0} value={cases}
                                  onChange={(e) => setCases(product.id, strain.name, parseInt(e.target.value, 10) || 0)}
                                  className="font-headline text-sm font-600 text-center"
                                  style={{width: 36, height: 32, background: 'rgba(255,255,255,0.04)', border: cases > 0 ? `1px solid ${BRAND.gold}50` : '1px solid rgba(255,255,255,0.08)', color: cases > 0 ? BRAND.gold : 'rgba(255,255,255,0.6)', outline: 'none'}} />
                                <button onClick={() => updateCart(product.id, strain.name, 1)}
                                  className="stepper-btn" style={{background: cases > 0 ? BRAND.gold : 'rgba(255,255,255,0.08)', color: cases > 0 ? '#000' : '#fff', width: 32, height: 32, fontSize: 16}}>+</button>
                              </div>
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
                              className="stepper-btn" style={{width: 28, height: 28, fontSize: 14, background: 'rgba(255,255,255,0.06)', color: '#fff'}}>−</button>
                            <span className="font-headline text-sm font-600 w-8 text-center">{item.cases}</span>
                            <button onClick={() => updateCart(item.productId, item.strainName, 1)}
                              className="stepper-btn" style={{width: 28, height: 28, fontSize: 14, background: 'rgba(255,255,255,0.06)', color: '#fff'}}>+</button>
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

                <a
                  href={buildOrderEmail()}
                  className="block font-headline text-base font-600 uppercase tracking-[0.15em] py-4 w-full text-center transition-opacity hover:opacity-90"
                  style={{background: BRAND.gold, color: '#000'}}
                >
                  Send Order to Highsman
                </a>
                <p className="font-body text-xs text-center mt-4" style={{color: 'rgba(255,255,255,0.55)'}}>
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
                className="font-headline text-sm font-600 uppercase tracking-[0.12em] px-6 py-2.5 cursor-pointer transition-opacity hover:opacity-90"
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
