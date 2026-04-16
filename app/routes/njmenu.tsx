import {useState, useRef, useCallback, useMemo} from 'react';
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
  textMuted: 'rgba(255,255,255,0.55)',
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

const STRAIN_TYPE_COLORS: Record<StrainType, string> = {
  Sativa: '#F59E0B',
  Hybrid: '#3B82F6',
  Indica: '#8B5CF6',
};

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
    return `mailto:marketing@highsman.com?subject=${subject}&body=${body}`;
  }, [cartItems, orderNote, earnedSamples, sampleStrains]);

  // Download menu as text
  const downloadMenu = useCallback(() => {
    const lines: string[] = [
      '╔═══════════════════════════════════════════════════════════════╗',
      '║           HIGHSMAN — NEW JERSEY WHOLESALE MENU              ║',
      '║                     Spark Greatness™                        ║',
      '╚═══════════════════════════════════════════════════════════════╝',
      '',
      `Generated: ${new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})}`,
      'Contact: marketing@highsman.com',
      '',
    ];

    PRODUCT_LINES.forEach((product) => {
      lines.push('━'.repeat(63));
      lines.push(
        `${product.name.toUpperCase()} ${product.subtitle.toUpperCase()} — ${product.weight} ${product.format}`,
      );
      lines.push(
        `Case Size: ${product.caseSize} units | Wholesale: ${formatCurrency(product.wholesale)}/unit | Case: ${formatCurrency(product.casePrice)} | RRP: ${formatCurrency(product.rrp)}`,
      );
      if (product.discount) {
        lines.push(`🔥 ${product.discount.label}: ${product.discount.percent}% OFF`);
      }
      lines.push('');
      lines.push(
        '  Strain                       Type      THC%',
      );
      lines.push('  ' + '─'.repeat(50));
      product.strains.forEach((s) => {
        const name = s.name.padEnd(30);
        const type = s.type.padEnd(10);
        lines.push(`  ${name}${type}${product.thcDisplay ?? s.thc}`);
      });
      lines.push('');
    });

    lines.push('━'.repeat(63));
    lines.push('');
    lines.push('To place an order, email marketing@highsman.com');
    lines.push('or visit highsman.com/njmenu');
    lines.push('');
    lines.push('© Highsman Inc. All rights reserved.');

    const blob = new Blob([lines.join('\n')], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Highsman_NJ_Wholesale_Menu.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Menu downloaded!');
  }, [showToast]);

  const getCasesForItem = (productId: string, strainName: string): number => {
    return cart[cartKey(productId, strainName)]?.cases ?? 0;
  };

  return (
    <>
      {/* ── Global Styles ──────────────────────────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

        .font-headline { font-family: 'Teko', sans-serif; }
        .font-body { font-family: 'Barlow Semi Condensed', sans-serif; }

        .nj-menu * { box-sizing: border-box; }
        .nj-menu { font-family: 'Barlow Semi Condensed', sans-serif; color: #fff; background: #000; min-height: 100vh; }

        .nj-menu input[type="number"]::-webkit-inner-spin-button,
        .nj-menu input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .nj-menu input[type="number"] { -moz-appearance: textfield; }

        .nj-menu .strain-row:hover { background: rgba(255,255,255,0.06); }
        .nj-menu .strain-row { transition: background 0.15s ease; }
        .nj-menu .product-section { transition: all 0.3s ease; }

        .nj-menu .strain-img {
          border-radius: 8px;
          transition: transform 0.2s ease;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
        }
        .nj-menu .strain-row:hover .strain-img { transform: scale(1.05); }

        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .slide-up { animation: slideUp 0.3s ease-out; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .fade-in { animation: fadeIn 0.2s ease-out; }

        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .cart-pulse { animation: pulse 0.3s ease; }

        .discount-badge { background: linear-gradient(135deg, #ff6b35, #f7c948); }
      `,
        }}
      />

      <div className="nj-menu">
        {/* ── Top Bar ────────────────────────────────────────────────────── */}
        <div
          style={{background: BRAND.gold, color: BRAND.black}}
          className="flex items-center justify-between px-5 py-2 font-headline text-[13px] font-bold tracking-[0.15em] uppercase"
        >
          <Link
            to="/wholesale"
            className="flex items-center gap-1 no-underline"
            style={{color: BRAND.black}}
          >
            <span className="material-symbols-outlined text-sm">
              arrow_back
            </span>
            Wholesale Portal
          </Link>
          <span className="hidden md:block">
            NJ Wholesale Menu &middot; Highsman
          </span>
          <a
            href="mailto:marketing@highsman.com"
            className="flex items-center gap-1 no-underline"
            style={{color: BRAND.black}}
          >
            <span className="material-symbols-outlined text-sm">mail</span>
            marketing@highsman.com
          </a>
        </div>

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section
          style={{background: BRAND.black, borderBottom: `1px solid ${BRAND.border}`}}
        >
          {/* Logo lockup */}
          <div
            className="flex flex-col items-center justify-center px-6 pt-12 pb-10 text-center"
            style={{borderBottom: `1px solid ${BRAND.border}`}}
          >
            <img
              src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
              alt="Highsman"
              style={{height: 72, width: 'auto', marginBottom: 16}}
            />
            <img
              src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Spark_Greatness_White.png?v=1775594430"
              alt="Spark Greatness™"
              style={{height: 28, width: 'auto', opacity: 0.85}}
            />
          </div>

          {/* Content row */}
          <div className="max-w-6xl mx-auto px-6 md:px-12 py-12 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              <p
                className="font-headline text-xs font-bold tracking-[0.25em] uppercase mb-3"
                style={{color: BRAND.gold}}
              >
                New Jersey Wholesale
              </p>
              <h1 className="font-headline text-6xl md:text-8xl font-bold uppercase leading-[0.85] mb-4">
                Product
                <br />
                Menu
              </h1>
              <p
                className="font-headline text-2xl md:text-3xl font-bold uppercase tracking-wide mb-5"
                style={{color: BRAND.gold}}
              >
                2026 Catalog
              </p>
              <p
                className="text-base leading-relaxed max-w-md mb-6"
                style={{color: BRAND.textMuted}}
              >
                Browse our full New Jersey lineup. Select quantities, build your
                order, and send it straight to your Highsman rep&mdash;all from
                this page.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Menu_-_4.15.xlsx?v=1776303798"
                  download="Highsman_Menu_NJ.xlsx"
                  className="flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wider px-5 py-2.5 border-2 transition-all hover:opacity-80"
                  style={{
                    borderColor: BRAND.gold,
                    color: BRAND.gold,
                    background: 'transparent',
                    textDecoration: 'none',
                  }}
                >
                  <span className="material-symbols-outlined text-base">
                    download
                  </span>
                  Download Order Form (.xlsx)
                </a>
                <button
                  onClick={() => {
                    setShowCart(true);
                    setTimeout(
                      () =>
                        cartRef.current?.scrollIntoView({behavior: 'smooth'}),
                      100,
                    );
                  }}
                  className="flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wider px-5 py-2.5 transition-all hover:opacity-90"
                  style={{
                    background: BRAND.gold,
                    color: BRAND.black,
                    border: 'none',
                  }}
                >
                  <span className="material-symbols-outlined text-base">
                    shopping_cart
                  </span>
                  View Order ({cartCount})
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div
              className="grid grid-cols-2 gap-px"
              style={{background: BRAND.border}}
            >
              {[
                {num: '5', label: 'Product Lines'},
                {num: '5', label: 'Strains'},
                {num: '25', label: 'Total SKUs'},
                {
                  num: '$7',
                  label: 'Starting Wholesale',
                  sub: 'per unit',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-5"
                  style={{background: BRAND.surfaceHigh}}
                >
                  <span className="font-headline text-4xl font-bold text-white leading-none block">
                    {stat.num}
                  </span>
                  <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{color: BRAND.textMuted}}
                  >
                    {stat.label}
                  </span>
                  {stat.sub && (
                    <span
                      className="block text-[10px] mt-0.5"
                      style={{color: BRAND.textMuted}}
                    >
                      {stat.sub}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Product Lines ──────────────────────────────────────────────── */}
        <div ref={menuRef} className="max-w-6xl mx-auto px-4 md:px-8 py-10">
          {/* Quick-nav tabs */}
          <div className="flex flex-wrap gap-0 mb-0 border-b" style={{borderColor: BRAND.border}}>
            {PRODUCT_LINES.map((p) => {
              const active = expandedProduct === p.id;
              const thumbSrc = p.fixedImageUrl ?? strainImage(p.strains[0].name, p.imageType);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    setExpandedProduct(active ? null : p.id)
                  }
                  className="flex items-center gap-3 font-headline text-sm font-bold uppercase tracking-wider px-5 py-4 transition-all relative"
                  style={{
                    background: active ? BRAND.surfaceHigh : 'transparent',
                    border: 'none',
                    borderBottom: active ? `3px solid ${BRAND.gold}` : '3px solid transparent',
                    color: active ? '#fff' : BRAND.textMuted,
                    cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, flexShrink: 0,
                    background: p.imageBg ?? 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4,
                  }}>
                    <img
                      src={thumbSrc}
                      alt={p.name}
                      style={{width: 32, height: 32, objectFit: 'contain', opacity: active ? 1 : 0.5}}
                    />
                  </div>
                  <span>
                    {p.name}{' '}
                    <span style={{color: active ? BRAND.gold : 'inherit'}}>{p.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Product Sections */}
          {PRODUCT_LINES.map((product) => {
            const isExpanded = expandedProduct === product.id;
            const discountedWholesale = applyDiscount(
              product.wholesale,
              product.discount,
            );
            const discountedCase = applyDiscount(
              product.casePrice,
              product.discount,
            );

            const marginPct = Math.round(((product.rrp - discountedWholesale) / product.rrp) * 100);
            const headerThumb = product.fixedImageUrl ?? strainImage(product.strains[0].name, product.imageType);

            return (
              <section
                key={product.id}
                className="product-section mb-3"
                style={{
                  background: BRAND.surface,
                  border: `1px solid ${isExpanded ? BRAND.gold + '30' : BRAND.border}`,
                  borderLeft: `4px solid ${isExpanded ? BRAND.gold : BRAND.border}`,
                }}
              >
                {/* Product Header — always visible */}
                <button
                  onClick={() =>
                    setExpandedProduct(isExpanded ? null : product.id)
                  }
                  className="w-full flex items-center justify-between px-5 md:px-8 py-5 text-left"
                  style={{
                    background: isExpanded ? `${BRAND.gold}06` : 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-5">
                    {/* Product thumbnail */}
                    <div
                      className="flex-shrink-0 hidden md:flex items-center justify-center"
                      style={{
                        width: 64,
                        height: 64,
                        background: product.imageBg ?? 'transparent',
                      }}
                    >
                      <img
                        src={headerThumb}
                        alt={product.name}
                        style={{width: 64, height: 64, objectFit: 'contain'}}
                      />
                    </div>
                    <div>
                      <h2 className="font-headline text-2xl md:text-4xl font-bold uppercase leading-none tracking-tight">
                        {product.name}{' '}
                        <span style={{color: BRAND.gold}}>
                          {product.subtitle}
                        </span>
                      </h2>
                      <p
                        className="text-sm mt-1"
                        style={{color: BRAND.textMuted}}
                      >
                        {product.weight} &middot; {product.format} &middot; Case of {product.caseSize}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {product.discount && (
                      <span className="discount-badge text-xs font-bold px-2.5 py-1 rounded text-black">
                        {product.discount.label}
                      </span>
                    )}
                    {/* Margin badge */}
                    <div
                      className="text-center hidden md:block px-4 py-2"
                      style={{
                        background: `${BRAND.gold}12`,
                        border: `1px solid ${BRAND.gold}30`,
                      }}
                    >
                      <span
                        className="font-headline text-2xl font-bold block leading-none"
                        style={{color: BRAND.gold}}
                      >
                        {marginPct}%
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{color: BRAND.textMuted}}>
                        Margin
                      </span>
                    </div>
                    <div className="text-right hidden md:block">
                      <span className="font-headline text-2xl font-bold block" style={{color: '#fff'}}>
                        {formatCurrency(discountedWholesale)}
                        <span className="font-headline text-sm font-normal" style={{color: BRAND.textMuted}}>
                          /unit
                        </span>
                      </span>
                      <span className="text-xs" style={{color: BRAND.textMuted}}>
                        RRP {formatCurrency(product.rrp)}
                      </span>
                    </div>
                    <span
                      className="material-symbols-outlined text-2xl transition-transform"
                      style={{
                        color: BRAND.textMuted,
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      expand_more
                    </span>
                  </div>
                </button>

                {/* Expanded: pricing bar + strain table */}
                {isExpanded && (
                  <div className="fade-in">
                    {/* Pricing summary bar */}
                    <div
                      className="grid grid-cols-2 md:grid-cols-4 gap-px mx-5 md:mx-8 mb-5"
                      style={{background: BRAND.border}}
                    >
                      {[
                        {
                          label: 'Wholesale / Unit',
                          value: formatCurrency(discountedWholesale),
                          highlight: true,
                        },
                        {
                          label: `Case of ${product.caseSize}`,
                          value: formatCurrency(discountedCase),
                          highlight: false,
                        },
                        {
                          label: 'RRP',
                          value: formatCurrency(product.rrp),
                          highlight: false,
                        },
                        {
                          label: 'Margin',
                          value: `${(((product.rrp - discountedWholesale) / product.rrp) * 100).toFixed(0)}%`,
                          highlight: true,
                          isMargin: true,
                        },
                      ].map((cell) => (
                        <div
                          key={cell.label}
                          className="px-4 py-3"
                          style={{
                            background: (cell as any).isMargin ? `${BRAND.gold}10` : BRAND.surfaceHigh,
                            borderTop: (cell as any).isMargin ? `2px solid ${BRAND.gold}40` : 'none',
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest block mb-0.5"
                            style={{color: (cell as any).isMargin ? BRAND.gold : BRAND.textMuted}}
                          >
                            {cell.label}
                          </span>
                          <span
                            className="font-headline font-bold"
                            style={{
                              color: cell.highlight ? BRAND.gold : '#fff',
                              fontSize: (cell as any).isMargin ? 28 : 18,
                              lineHeight: 1,
                            }}
                          >
                            {cell.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Discount display */}
                    {product.discount && (
                      <div
                        className="mx-5 md:mx-8 mb-4 flex items-center gap-2 text-sm px-4 py-2.5"
                        style={{
                          background: 'rgba(255,107,53,0.08)',
                          border: '1px solid rgba(255,107,53,0.25)',
                        }}
                      >
                        <span className="material-symbols-outlined text-base" style={{color: '#ff6b35'}}>
                          local_offer
                        </span>
                        <span style={{color: '#ff6b35'}}>
                          <strong>{product.discount.label}</strong> &mdash;{' '}
                          {product.discount.percent}% off wholesale. Was{' '}
                          {formatCurrency(product.wholesale)}/unit, now{' '}
                          <strong>{formatCurrency(discountedWholesale)}/unit</strong>.
                        </span>
                      </div>
                    )}

                    {/* Quick-add bar — top of strain list */}
                    <div
                      className="flex items-center justify-between px-5 md:px-8 py-3"
                      style={{borderBottom: `1px solid ${BRAND.border}`, background: BRAND.surfaceHigh}}
                    >
                      <span className="font-headline text-xs font-bold uppercase tracking-widest" style={{color: BRAND.textMuted}}>
                        Quick order
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Remove one of each */}
                        <button
                          onClick={() =>
                            product.strains.forEach((s) => {
                              const existing = getCasesForItem(product.id, s.name);
                              if (existing > 0)
                                updateCart(product.id, s.name, -1);
                            })
                          }
                          className="flex items-center gap-1.5 font-headline text-xs font-bold uppercase tracking-wider px-3 py-2 transition-all hover:opacity-80 cursor-pointer"
                          style={{
                            background: 'transparent',
                            border: `1px solid ${BRAND.border}`,
                            color: BRAND.textMuted,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{fontSize: 15}}>remove_shopping_cart</span>
                          −1 Each
                        </button>
                        {/* Add one of each */}
                        <button
                          onClick={() =>
                            product.strains.forEach((s) =>
                              updateCart(product.id, s.name, 1)
                            )
                          }
                          className="flex items-center gap-1.5 font-headline text-xs font-bold uppercase tracking-wider px-3 py-2 transition-all hover:opacity-90 cursor-pointer"
                          style={{
                            background: BRAND.gold,
                            border: 'none',
                            color: BRAND.black,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{fontSize: 15}}>add_shopping_cart</span>
                          +1 Each
                        </button>
                      </div>
                    </div>

                    {/* Strain Rows */}
                    <div className="mb-0">
                      {product.strains.map((strain) => {
                        const cases = getCasesForItem(product.id, strain.name);
                        const imgSrc = product.fixedImageUrl ?? strainImage(strain.name, product.imageType);
                        return (
                          <div
                            key={strain.name}
                            className="strain-row flex items-center gap-4 px-5 md:px-8 py-3 transition-all"
                            style={{
                              borderBottom: `1px solid ${BRAND.border}`,
                              borderLeft: `3px solid ${cases > 0 ? BRAND.gold : 'transparent'}`,
                              background: cases > 0 ? `${BRAND.gold}07` : 'transparent',
                            }}
                          >
                            {/* Product image */}
                            <div
                              className="flex-shrink-0 flex items-center justify-center"
                              style={{
                                width: 72,
                                height: 72,
                                background: product.imageBg ?? 'transparent',
                              }}
                            >
                              <img
                                src={imgSrc}
                                alt={`${product.name} ${strain.name}`}
                                className="strain-img"
                                style={{
                                  width: 72,
                                  height: 72,
                                  objectFit: 'contain',
                                }}
                                loading="lazy"
                              />
                            </div>

                            {/* Strain info */}
                            <div className="flex-1 min-w-0">
                              <span className="font-headline font-bold text-xl md:text-2xl text-white uppercase leading-none tracking-tight block">
                                {strain.name}
                              </span>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span
                                  className="font-headline text-xs font-bold px-2 py-0.5 uppercase tracking-wider"
                                  style={{
                                    background: `${STRAIN_TYPE_COLORS[strain.type]}18`,
                                    color: STRAIN_TYPE_COLORS[strain.type],
                                    border: `1px solid ${STRAIN_TYPE_COLORS[strain.type]}40`,
                                  }}
                                >
                                  {strain.type}
                                </span>
                                <span
                                  className="font-headline text-xs font-bold px-2 py-0.5 uppercase tracking-wider"
                                  style={{
                                    background: `${BRAND.gold}10`,
                                    color: BRAND.gold,
                                    border: `1px solid ${BRAND.gold}30`,
                                  }}
                                >
                                  {product.thcDisplay ?? strain.thc} THC
                                </span>
                                {cases > 0 && (
                                  <span
                                    className="font-headline text-xs font-bold"
                                    style={{color: BRAND.gold}}
                                  >
                                    {cases * product.caseSize} units · {formatCurrency(discountedCase * cases)}
                                  </span>
                                )}
                              </div>
                              {strain.sku && (
                                <span
                                  className="text-[10px] tracking-wider mt-1 block"
                                  style={{color: BRAND.textMuted, fontFamily: 'monospace'}}
                                >
                                  SKU: {strain.sku}
                                </span>
                              )}
                            </div>

                            {/* Qty stepper */}
                            <div className="flex items-center gap-0 flex-shrink-0">
                              <button
                                onClick={() => updateCart(product.id, strain.name, -1)}
                                disabled={cases === 0}
                                className="w-10 h-10 flex items-center justify-center transition-colors cursor-pointer"
                                style={{
                                  background: cases > 0 ? BRAND.surfaceContainer : 'transparent',
                                  border: `1px solid ${cases > 0 ? BRAND.border : 'transparent'}`,
                                  color: cases > 0 ? '#fff' : BRAND.textMuted,
                                  opacity: cases > 0 ? 1 : 0.25,
                                  cursor: cases > 0 ? 'pointer' : 'default',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{fontSize: 18}}>remove</span>
                              </button>
                              <input
                                type="number"
                                min={0}
                                value={cases}
                                onChange={(e) =>
                                  setCases(product.id, strain.name, parseInt(e.target.value, 10) || 0)
                                }
                                className="font-headline text-base font-bold text-center"
                                style={{
                                  width: 48,
                                  height: 40,
                                  background: BRAND.surfaceContainer,
                                  border: `1px solid ${cases > 0 ? BRAND.gold + '60' : BRAND.border}`,
                                  borderLeft: 'none',
                                  borderRight: 'none',
                                  color: cases > 0 ? BRAND.gold : '#fff',
                                  outline: 'none',
                                }}
                              />
                              <button
                                onClick={() => updateCart(product.id, strain.name, 1)}
                                className="w-10 h-10 flex items-center justify-center transition-all cursor-pointer"
                                style={{
                                  background: cases > 0 ? BRAND.gold : BRAND.surfaceContainer,
                                  border: `1px solid ${cases > 0 ? BRAND.gold : BRAND.border}`,
                                  color: cases > 0 ? BRAND.black : '#fff',
                                }}
                              >
                                <span className="material-symbols-outlined" style={{fontSize: 18}}>add</span>
                              </button>
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
          className="max-w-6xl mx-auto px-4 md:px-8 pb-32"
          style={{display: showCart || cartCount > 0 ? 'block' : 'none'}}
        >
          <div
            className="p-6 md:p-8"
            style={{
              background: BRAND.surface,
              border: `1px solid ${BRAND.gold}40`,
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-2xl"
                  style={{color: BRAND.gold}}
                >
                  shopping_cart
                </span>
                <h2 className="font-headline text-2xl font-bold uppercase">
                  Your Order
                </h2>
                <span
                  className="font-headline text-sm px-2.5 py-0.5 rounded-full"
                  style={{
                    background: `${BRAND.gold}20`,
                    color: BRAND.gold,
                  }}
                >
                  {cartCount} case{cartCount !== 1 ? 's' : ''}
                </span>
              </div>
              {cartCount > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs font-bold uppercase tracking-wider hover:opacity-70 transition-opacity cursor-pointer"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: BRAND.textMuted,
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            {cartCount === 0 ? (
              <div className="text-center py-12" style={{color: BRAND.textMuted}}>
                <span className="material-symbols-outlined text-5xl block mb-3 opacity-30">
                  inventory_2
                </span>
                <p className="text-base mb-1">Your order is empty</p>
                <p className="text-sm">
                  Add products from the menu above to get started.
                </p>
              </div>
            ) : (
              <>
                {/* Cart Items */}
                <div
                  className="mb-6"
                  style={{
                    borderBottom: `1px solid ${BRAND.border}`,
                  }}
                >
                  {cartItems.map((item) => {
                    const product = PRODUCT_LINES.find(
                      (p) => p.id === item.productId,
                    );
                    if (!product) return null;
                    const unitPrice = applyDiscount(
                      product.casePrice,
                      product.discount,
                    );
                    return (
                      <div
                        key={cartKey(item.productId, item.strainName)}
                        className="flex items-center justify-between py-3 px-2"
                        style={{borderBottom: `1px solid ${BRAND.border}`}}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{background: product.color}}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {product.name} {product.subtitle}
                            </p>
                            <p
                              className="text-xs truncate"
                              style={{color: BRAND.textMuted}}
                            >
                              {item.strainName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                updateCart(item.productId, item.strainName, -1)
                              }
                              className="w-7 h-7 flex items-center justify-center cursor-pointer"
                              style={{
                                background: BRAND.surfaceHigh,
                                border: `1px solid ${BRAND.border}`,
                                color: '#fff',
                              }}
                            >
                              <span className="material-symbols-outlined text-base">
                                remove
                              </span>
                            </button>
                            <span className="w-8 text-center font-headline text-sm font-bold">
                              {item.cases}
                            </span>
                            <button
                              onClick={() =>
                                updateCart(item.productId, item.strainName, 1)
                              }
                              className="w-7 h-7 flex items-center justify-center cursor-pointer"
                              style={{
                                background: BRAND.surfaceHigh,
                                border: `1px solid ${BRAND.border}`,
                                color: '#fff',
                              }}
                            >
                              <span className="material-symbols-outlined text-base">
                                add
                              </span>
                            </button>
                          </div>
                          <span
                            className="font-headline text-sm font-bold w-24 text-right"
                            style={{color: product.color}}
                          >
                            {formatCurrency(unitPrice * item.cases)}
                          </span>
                          <button
                            onClick={() =>
                              setCases(item.productId, item.strainName, 0)
                            }
                            className="cursor-pointer"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: BRAND.textMuted,
                            }}
                          >
                            <span className="material-symbols-outlined text-lg hover:text-white transition-colors">
                              close
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Budtender Samples ────────────────────────────── */}
                {earnedSamples.length > 0 && (
                  <div className="mb-6">
                    {/* Header */}
                    <div
                      className="flex items-center justify-between px-5 py-3 mb-0"
                      style={{
                        background: 'linear-gradient(135deg, #0d2b0d 0%, #1a1a0a 100%)',
                        border: `1px solid #4CAF5060`,
                        borderBottom: 'none',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="material-symbols-outlined text-2xl"
                          style={{color: '#4CAF50'}}
                        >
                          redeem
                        </span>
                        <div>
                          <p
                            className="font-headline text-base font-bold uppercase tracking-widest"
                            style={{color: '#4CAF50'}}
                          >
                            Free Budtender Samples
                          </p>
                          <p className="text-xs" style={{color: BRAND.textMuted}}>
                            Auto-earned from your order — choose strains below
                          </p>
                        </div>
                      </div>
                      <span
                        className="font-headline text-sm font-bold px-3 py-1 uppercase tracking-wider"
                        style={{
                          background: '#4CAF5020',
                          color: '#4CAF50',
                          border: '1px solid #4CAF5040',
                        }}
                      >
                        {totalSamples} free unit{totalSamples !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Sample rows */}
                    <div
                      style={{
                        border: `1px solid #4CAF5040`,
                        background: BRAND.surfaceHigh,
                      }}
                    >
                      {earnedSamples.map((sample, idx) => (
                        <div
                          key={sample.id}
                          className="flex items-center justify-between px-5 py-4"
                          style={{
                            borderBottom:
                              idx < earnedSamples.length - 1
                                ? `1px solid ${BRAND.border}`
                                : 'none',
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span
                              className="material-symbols-outlined text-xl flex-shrink-0"
                              style={{color: sample.color}}
                            >
                              {sample.icon}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="font-headline text-sm font-bold uppercase"
                                  style={{color: '#fff'}}
                                >
                                  {sample.qty}× {sample.label}
                                </span>
                                <span
                                  className="font-headline text-xs font-bold px-2 py-0.5 uppercase tracking-wider"
                                  style={{
                                    background: '#4CAF5020',
                                    color: '#4CAF50',
                                    border: '1px solid #4CAF5040',
                                  }}
                                >
                                  FREE
                                </span>
                              </div>
                              <p
                                className="text-xs mt-0.5"
                                style={{color: BRAND.textMuted}}
                              >
                                {sample.unit}
                              </p>
                            </div>
                          </div>

                          {/* Strain selector */}
                          <div className="flex-shrink-0 ml-4">
                            <select
                              value={sampleStrains[sample.id] ?? ''}
                              onChange={(e) =>
                                setSampleStrains((prev) => ({
                                  ...prev,
                                  [sample.id]: e.target.value,
                                }))
                              }
                              className="font-headline text-xs font-bold uppercase tracking-wide px-3 py-2 cursor-pointer"
                              style={{
                                background: BRAND.surface,
                                border: `1px solid ${
                                  sampleStrains[sample.id]
                                    ? sample.color + '80'
                                    : BRAND.border
                                }`,
                                color: sampleStrains[sample.id]
                                  ? '#fff'
                                  : BRAND.textMuted,
                                outline: 'none',
                                minWidth: '180px',
                              }}
                            >
                              <option value="">— Choose Strain —</option>
                              {STRAINS.map((s) => (
                                <option key={s.name} value={s.name}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}

                      {/* Footer nudge */}
                      {earnedSamples.some((s) => !sampleStrains[s.id]) && (
                        <div
                          className="px-5 py-2.5 text-xs"
                          style={{
                            background: '#0d1a0d',
                            borderTop: `1px solid #4CAF5030`,
                            color: BRAND.textMuted,
                          }}
                        >
                          ↑ Select a strain for each sample — they'll be included in your order email
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Order Note */}
                <div className="mb-5">
                  <label
                    className="text-xs font-bold uppercase tracking-widest block mb-2"
                    style={{color: BRAND.textMuted}}
                  >
                    Order Note (optional)
                  </label>
                  <textarea
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Special instructions, delivery preferences, etc."
                    rows={2}
                    className="w-full px-4 py-3 text-sm resize-none"
                    style={{
                      background: BRAND.surfaceHigh,
                      border: `1px solid ${BRAND.border}`,
                      color: '#fff',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Totals */}
                <div
                  className="flex items-center justify-between py-4 px-4 mb-5"
                  style={{
                    background: BRAND.surfaceHigh,
                    border: `1px solid ${BRAND.border}`,
                  }}
                >
                  <span className="font-headline text-lg font-bold uppercase tracking-wider">
                    Estimated Total
                  </span>
                  <span
                    className="font-headline text-3xl font-bold"
                    style={{color: BRAND.gold}}
                  >
                    {formatCurrency(cartTotal)}
                  </span>
                </div>

                {/* Submit */}
                <a
                  href={buildOrderEmail()}
                  className="flex items-center justify-center gap-2 font-headline text-lg font-bold uppercase tracking-wider py-4 w-full no-underline transition-all hover:opacity-90"
                  style={{
                    background: BRAND.gold,
                    color: BRAND.black,
                    border: 'none',
                  }}
                >
                  <span className="material-symbols-outlined text-xl">
                    send
                  </span>
                  Send Order to Highsman Rep
                </a>
                <p
                  className="text-xs text-center mt-3"
                  style={{color: BRAND.textMuted}}
                >
                  This opens your email client with the order details pre-filled.
                  Your rep will confirm pricing, availability, and delivery.
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Sticky Bottom Bar ──────────────────────────────────────────── */}
        {cartCount > 0 && !showCart && (
          <div
            className="fixed bottom-0 left-0 right-0 z-50 slide-up"
            style={{
              background: `linear-gradient(to right, ${BRAND.surface}, ${BRAND.surfaceHigh})`,
              borderTop: `2px solid ${BRAND.gold}`,
            }}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-xl"
                  style={{color: BRAND.gold}}
                >
                  shopping_cart
                </span>
                <span className="font-headline text-base font-bold">
                  {cartCount} case{cartCount !== 1 ? 's' : ''} &middot;{' '}
                  <span style={{color: BRAND.gold}}>
                    {formatCurrency(cartTotal)}
                  </span>
                </span>
              </div>
              <button
                onClick={() => {
                  setShowCart(true);
                  setTimeout(
                    () =>
                      cartRef.current?.scrollIntoView({behavior: 'smooth'}),
                    100,
                  );
                }}
                className="flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wider px-5 py-2.5 cursor-pointer transition-all hover:opacity-90"
                style={{
                  background: BRAND.gold,
                  color: BRAND.black,
                  border: 'none',
                }}
              >
                Review Order
                <span className="material-symbols-outlined text-base">
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer
          className="px-6 md:px-12 py-10 text-center"
          style={{
            background: BRAND.black,
            borderTop: `1px solid ${BRAND.border}`,
          }}
        >
          <p
            className="font-headline text-xs font-bold tracking-[0.2em] uppercase mb-2"
            style={{color: BRAND.gold}}
          >
            Spark Greatness&trade;
          </p>
          <p className="text-sm mb-1" style={{color: BRAND.textMuted}}>
            Questions? Contact{' '}
            <a
              href="mailto:marketing@highsman.com"
              className="underline"
              style={{color: BRAND.gold}}
            >
              marketing@highsman.com
            </a>
          </p>
          <p
            className="text-xs"
            style={{color: `${BRAND.textMuted}80`}}
          >
            &copy; {new Date().getFullYear()} Highsman Inc. All rights
            reserved. Prices subject to change.
          </p>
        </footer>

        {/* ── Toast ──────────────────────────────────────────────────────── */}
        {toast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] fade-in flex items-center gap-2 px-5 py-3 shadow-lg"
            style={{
              background: BRAND.surfaceHigh,
              border: `1px solid ${BRAND.gold}40`,
              color: '#fff',
            }}
          >
            <span
              className="material-symbols-outlined text-base"
              style={{color: BRAND.gold}}
            >
              check_circle
            </span>
            <span className="text-sm font-semibold">{toast}</span>
          </div>
        )}
      </div>
    </>
  );
}
