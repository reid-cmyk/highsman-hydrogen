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
  strains: Strain[];
  discount?: {label: string; percent: number}; // optional active discount
}

const STRAINS: Strain[] = [
  {name: 'Wavey Watermelon', type: 'Sativa', thc: '49.8%'},
  {name: 'Gridiron Grape', type: 'Sativa', thc: '50.0%'},
  {name: 'Blueberry Blitz', type: 'Hybrid', thc: '47.0%'},
  {name: 'Touchdown Tango Mango', type: 'Hybrid', thc: '53.8%'},
  {name: 'Cake Quake', type: 'Indica', thc: '47.4%'},
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
    strains: STRAINS,
  },
  {
    id: 'hit-sticks-5pack',
    name: 'Hit Sticks',
    subtitle: '5-Pack',
    weight: '2.5g (5 x 0.5g)',
    format: 'Infused Mini Pre-Roll 5-Pack',
    caseSize: 6,
    wholesale: 30.0,
    casePrice: 180.0,
    rrp: 59.99,
    color: BRAND.gold,
    icon: 'local_fire_department',
    imageType: 'Pouch' as ImageType,
    strains: STRAINS,
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
    color: BRAND.purple,
    icon: 'sports_mma',
    imageType: 'PreRoll_Menu' as ImageType,
    strains: STRAINS,
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
    color: BRAND.green,
    icon: 'grass',
    imageType: 'Pouch' as ImageType,
    strains: STRAINS,
  },
];

const STRAIN_TYPE_COLORS: Record<StrainType, string> = {
  Sativa: '#F59E0B',
  Hybrid: '#3B82F6',
  Indica: '#8B5CF6',
};

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
      lines.push(
        `${product.name} ${product.subtitle} — ${item.strainName}`,
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
  }, [cartItems, orderNote]);

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
        lines.push(`  ${name}${type}${s.thc}`);
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
          style={{background: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`}}
          className="px-6 md:px-12 py-12 md:py-20"
        >
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              <p
                className="font-headline text-xs font-bold tracking-[0.25em] uppercase mb-2"
                style={{color: BRAND.gold}}
              >
                New Jersey Wholesale
              </p>
              <h1 className="font-headline text-6xl md:text-8xl font-bold uppercase leading-[0.85] mb-1">
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
                <button
                  onClick={downloadMenu}
                  className="flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wider px-5 py-2.5 border-2 transition-all hover:opacity-80"
                  style={{
                    borderColor: BRAND.gold,
                    color: BRAND.gold,
                    background: 'transparent',
                  }}
                >
                  <span className="material-symbols-outlined text-base">
                    download
                  </span>
                  Download Menu
                </button>
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
                {num: '4', label: 'Product Lines'},
                {num: '5', label: 'Strains'},
                {num: '20', label: 'Total SKUs'},
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
          {/* Quick-nav pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            {PRODUCT_LINES.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  setExpandedProduct(expandedProduct === p.id ? null : p.id)
                }
                className="flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wider px-4 py-2 border transition-all"
                style={{
                  borderColor:
                    expandedProduct === p.id ? p.color : BRAND.border,
                  background:
                    expandedProduct === p.id
                      ? `${p.color}15`
                      : 'transparent',
                  color: expandedProduct === p.id ? p.color : BRAND.textMuted,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{background: p.color}}
                />
                {p.name} {p.subtitle}
              </button>
            ))}
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

            return (
              <section
                key={product.id}
                className="product-section mb-4"
                style={{
                  border: `1px solid ${isExpanded ? product.color + '40' : BRAND.border}`,
                  background: BRAND.surface,
                }}
              >
                {/* Product Header — always visible */}
                <button
                  onClick={() =>
                    setExpandedProduct(isExpanded ? null : product.id)
                  }
                  className="w-full flex items-center justify-between px-5 md:px-8 py-5 text-left"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="material-symbols-outlined text-3xl"
                      style={{color: product.color}}
                    >
                      {product.icon}
                    </span>
                    <div>
                      <h2 className="font-headline text-2xl md:text-3xl font-bold uppercase leading-none">
                        {product.name}{' '}
                        <span style={{color: product.color}}>
                          {product.subtitle}
                        </span>
                      </h2>
                      <p
                        className="text-sm mt-0.5"
                        style={{color: BRAND.textMuted}}
                      >
                        {product.weight} &middot; {product.format} &middot;
                        Case of {product.caseSize}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    {product.discount && (
                      <span className="discount-badge text-xs font-bold px-2.5 py-1 rounded text-black">
                        {product.discount.label}
                      </span>
                    )}
                    <div className="text-right hidden md:block">
                      <span className="font-headline text-xl font-bold block" style={{color: product.color}}>
                        {formatCurrency(discountedWholesale)}
                        <span className="text-xs font-normal" style={{color: BRAND.textMuted}}>
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
                        transform: isExpanded
                          ? 'rotate(180deg)'
                          : 'rotate(0deg)',
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
                          highlight: false,
                        },
                      ].map((cell) => (
                        <div
                          key={cell.label}
                          className="px-4 py-3"
                          style={{background: BRAND.surfaceHigh}}
                        >
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest block mb-0.5"
                            style={{color: BRAND.textMuted}}
                          >
                            {cell.label}
                          </span>
                          <span
                            className="font-headline text-lg font-bold"
                            style={{
                              color: cell.highlight ? product.color : '#fff',
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

                    {/* Strain Table */}
                    <div className="mx-5 md:mx-8 mb-6 overflow-x-auto">
                      {/* Table Header */}
                      <div
                        className="grid gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          gridTemplateColumns: '148px minmax(160px,2fr) 80px 60px 1fr',
                          color: BRAND.textMuted,
                          borderBottom: `1px solid ${BRAND.border}`,
                        }}
                      >
                        <span></span>
                        <span>Strain</span>
                        <span>Type</span>
                        <span>THC</span>
                        <span className="text-right">Cases</span>
                      </div>

                      {/* Strain Rows */}
                      {product.strains.map((strain) => {
                        const cases = getCasesForItem(product.id, strain.name);
                        return (
                          <div
                            key={strain.name}
                            className="strain-row grid gap-3 items-center px-4 py-4 transition-colors"
                            style={{
                              gridTemplateColumns:
                                '148px minmax(160px,2fr) 80px 60px 1fr',
                              borderBottom: `1px solid ${BRAND.border}`,
                              background:
                                cases > 0
                                  ? `${product.color}08`
                                  : 'transparent',
                            }}
                          >
                            {/* Product image */}
                            <div className="flex items-center justify-center">
                              <img
                                src={strainImage(strain.name, product.imageType)}
                                alt={`${product.name} ${strain.name}`}
                                className="strain-img"
                                style={{
                                  width: 132,
                                  height: 132,
                                  objectFit: 'contain',
                                  background: 'transparent',
                                }}
                                loading="lazy"
                              />
                            </div>
                            {/* Strain name */}
                            <div className="flex items-center gap-2">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background:
                                    STRAIN_TYPE_COLORS[strain.type],
                                }}
                              />
                              <span className="font-headline font-bold text-base text-white uppercase tracking-wide">
                                {strain.name}
                              </span>
                            </div>
                            {/* Type */}
                            <span
                              className="text-xs font-bold px-2.5 py-1 rounded inline-block text-center uppercase tracking-wider"
                              style={{
                                background: `${STRAIN_TYPE_COLORS[strain.type]}20`,
                                color: STRAIN_TYPE_COLORS[strain.type],
                              }}
                            >
                              {strain.type}
                            </span>
                            {/* THC */}
                            <span className="text-sm" style={{color: BRAND.textMuted}}>
                              {strain.thc}
                            </span>
                            {/* Qty Stepper */}
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() =>
                                  updateCart(product.id, strain.name, -1)
                                }
                                className="w-8 h-8 flex items-center justify-center transition-colors"
                                style={{
                                  background:
                                    cases > 0
                                      ? BRAND.surfaceHigh
                                      : 'transparent',
                                  border: `1px solid ${cases > 0 ? BRAND.border : 'transparent'}`,
                                  color: cases > 0 ? '#fff' : BRAND.textMuted,
                                  cursor:
                                    cases > 0 ? 'pointer' : 'default',
                                  opacity: cases > 0 ? 1 : 0.3,
                                }}
                                disabled={cases === 0}
                              >
                                <span className="material-symbols-outlined text-lg">
                                  remove
                                </span>
                              </button>
                              <input
                                type="number"
                                min={0}
                                value={cases}
                                onChange={(e) =>
                                  setCases(
                                    product.id,
                                    strain.name,
                                    parseInt(e.target.value, 10) || 0,
                                  )
                                }
                                className="w-12 h-8 text-center font-headline text-base font-bold"
                                style={{
                                  background: BRAND.surfaceHigh,
                                  border: `1px solid ${cases > 0 ? product.color + '60' : BRAND.border}`,
                                  color: cases > 0 ? product.color : '#fff',
                                  outline: 'none',
                                }}
                              />
                              <button
                                onClick={() =>
                                  updateCart(product.id, strain.name, 1)
                                }
                                className="w-8 h-8 flex items-center justify-center transition-colors cursor-pointer"
                                style={{
                                  background: BRAND.surfaceHigh,
                                  border: `1px solid ${BRAND.border}`,
                                  color: '#fff',
                                }}
                              >
                                <span className="material-symbols-outlined text-lg">
                                  add
                                </span>
                              </button>
                              {cases > 0 && (
                                <span
                                  className="ml-2 text-xs font-semibold whitespace-nowrap hidden md:block"
                                  style={{color: product.color}}
                                >
                                  {cases * product.caseSize} units &middot;{' '}
                                  {formatCurrency(discountedCase * cases)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Quick-add bar */}
                      <div
                        className="flex items-center justify-between px-4 py-3 mt-1"
                        style={{background: BRAND.surfaceHigh}}
                      >
                        <span className="text-xs" style={{color: BRAND.textMuted}}>
                          Quick Add: Add 1 case of each strain
                        </span>
                        <button
                          onClick={() =>
                            product.strains.forEach((s) => {
                              const existing = getCasesForItem(
                                product.id,
                                s.name,
                              );
                              if (existing === 0)
                                setCases(product.id, s.name, 1);
                            })
                          }
                          className="flex items-center gap-1 font-headline text-xs font-bold uppercase tracking-wider px-3 py-1.5 transition-all hover:opacity-80 cursor-pointer"
                          style={{
                            background: product.color,
                            color: BRAND.black,
                            border: 'none',
                          }}
                        >
                          <span className="material-symbols-outlined text-sm">
                            add_shopping_cart
                          </span>
                          Add All Strains
                        </button>
                      </div>
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
