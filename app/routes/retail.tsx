import {useState, useRef, useEffect, useMemo, useCallback} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {useFetcher} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
}

interface MerchItem {
  id: string;
  name: string;
  category: string;
  description: string;
  dimensions?: string;
  image: string;
  maxQty: number;
  tag?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Catalog
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {id: 'pos-displays', label: 'Point of Sale Displays', icon: 'storefront'},
  {id: 'cutouts', label: 'Cutouts & Standees', icon: 'person'},
  {id: 'banners', label: 'Banners', icon: 'flag'},
  {id: 'signs', label: 'In-Store Stand Up Signs', icon: 'display_settings'},
  {id: 'footballs', label: 'Branded Footballs', icon: 'sports_football'},
];

const MERCH_ITEMS: MerchItem[] = [
  // ── Point of Sale Displays ─────────────────────────────────────────────────
  {
    id: 'stadium-display',
    name: 'Hit Stick Stadium Display',
    category: 'pos-displays',
    description: 'Transform your counter into the main event. This stadium-shaped display holds the full range of Hit Stick products — an unmissable focal point that drives impulse buys and product education.',
    image: '/retail/stadium-display.png',
    maxQty: 2,
  },
  {
    id: 'acrylic-display',
    name: 'Hit Stick Acrylic Display',
    category: 'pos-displays',
    description: 'Sleek acrylic sign holder detailing each Hit Stick tier — Exotic Indoor, Infused Indoor, and Rosin. Premium build, compact footprint, perfect for educating consumers at point of purchase.',
    image: '/retail/acrylic-display.png',
    maxQty: 3,
  },

  // ── Cutouts & Standees ─────────────────────────────────────────────────────
  {
    id: 'cutout-6ft',
    name: '6ft Ricky Williams Cutout',
    category: 'cutouts',
    description: 'The life-sized classic. Guaranteed to stop customers in their tracks. Ideal for entryways and high-traffic areas — creates the ultimate photo opportunity and drives social media engagement.',
    dimensions: '6ft tall',
    image: '/retail/ricky-cutout.png',
    maxQty: 1,
    tag: 'Fan Favorite',
  },
  {
    id: 'cutout-3ft',
    name: '3ft Ricky Williams Cutout',
    category: 'cutouts',
    description: 'Perfect for smaller spaces, countertops, or creating layered displays. All the impact of the full-size cutout in a space-friendly format.',
    dimensions: '3ft tall',
    image: '/retail/ricky-cutout.png',
    maxQty: 2,
  },
  {
    id: 'cutout-10in',
    name: '10in Ricky Williams Cutout',
    category: 'cutouts',
    description: 'Versatile mini cutout for shelf displays and accenting product arrangements. Great for case-top and register areas.',
    dimensions: '10in tall',
    image: '/retail/ricky-cutout.png',
    maxQty: 4,
  },

  // ── Banners ────────────────────────────────────────────────────────────────
  {
    id: 'banner-large',
    name: 'Large Retractable Banner',
    category: 'banners',
    description: 'Command attention with this full-size, easy-to-assemble retractable banner. Perfect for events, storefronts, or as a major in-store backdrop.',
    image: '/retail/retractable-banner.png',
    maxQty: 1,
  },
  {
    id: 'banner-small',
    name: 'Small Retractable Banner',
    category: 'banners',
    description: 'All the impact in a smaller package. Ideal for tighter spaces, pop-up events, or complementing larger displays.',
    image: '/retail/retractable-banner.png',
    maxQty: 1,
    tag: 'Popular',
  },

  // ── In-Store Stand Up Signs ────────────────────────────────────────────────
  {
    id: 'sign-all-products',
    name: 'All Products Display Stand',
    category: 'signs',
    description: 'Full product lineup on a single countertop stand. Showcases Hit Sticks, Pre-Rolls, and Ground Game with all five flavors.',
    dimensions: '7.87 × 9.84 in',
    image: '/retail/all-product-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-hitstick',
    name: 'Hit Stick Stand Up Sign',
    category: 'signs',
    description: 'Countertop display sign featuring the Hit Stick Dispose-A-Bowl with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/hitstick-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-preroll',
    name: 'Pre-Roll Stand Up Sign',
    category: 'signs',
    description: 'Countertop display sign featuring the Triple Threat 1.2g Pre-Roll with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/preroll-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-groundgame',
    name: 'Ground Game Stand Up Sign',
    category: 'signs',
    description: 'Countertop display sign featuring Ground Game 7g Ready-to-Roll Flower with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/groundgame-sign.png',
    maxQty: 5,
    tag: 'New',
  },

  // ── Branded Footballs ──────────────────────────────────────────────────────
  {
    id: 'football-signed',
    name: 'Signed Ricky Williams Football',
    category: 'footballs',
    description: 'The ultimate collector\'s item. Custom Highsman football with Ricky Williams\' authentic signature. A high-value prize for top customers and major in-store promotions.',
    image: '/retail/signed-football.png',
    maxQty: 1,
    tag: 'Limited',
  },
  {
    id: 'football-branded',
    name: 'Highsman Branded Football',
    category: 'footballs',
    description: 'Premium branded football — a fantastic giveaway item. Perfect for building brand loyalty and engaging the sports-loving cannabis consumer.',
    image: '/retail/branded-football.png',
    maxQty: 1,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Retail Merchandising Store'}];
};

// ─────────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RetailMerchStore() {
  // ── Suppress Klaviyo popup (B2B page) ──────────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-retail';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Account / Dispensary Identification ────────────────────────────────────
  const accountFetcher = useFetcher<{accounts: Account[]; error?: string}>();
  const [accountQuery, setAccountQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const accountInputRef = useRef<HTMLInputElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Debounced live search — queries ALL Zoho accounts (scope=all)
  useEffect(() => {
    if (accountQuery.length < 2 || selectedAccount) return;
    const timer = setTimeout(() => {
      accountFetcher.load(`/api/accounts?q=${encodeURIComponent(accountQuery)}&scope=all`);
    }, 250);
    return () => clearTimeout(timer);
  }, [accountQuery, selectedAccount]);

  // Compute results from API
  const accountResults = useMemo(() => {
    if (accountQuery.length < 2 || selectedAccount) return [];
    if (accountFetcher.data?.accounts && !accountFetcher.data?.error) {
      return accountFetcher.data.accounts;
    }
    return [];
  }, [accountQuery, selectedAccount, accountFetcher.data]);

  const isSearching = accountFetcher.state === 'loading';

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

  // ── Cart & Product State ───────────────────────────────────────────────────
  const [cart, setCart] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');

  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  const updateQty = (id: string, delta: number) => {
    const item = MERCH_ITEMS.find((i) => i.id === id);
    if (!item) return;
    setCart((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(item.maxQty, current + delta));
      if (next === 0) {
        const {[id]: _, ...rest} = prev;
        return rest;
      }
      return {...prev, [id]: next};
    });
  };

  const filteredItems = activeCategory
    ? MERCH_ITEMS.filter((i) => i.category === activeCategory)
    : MERCH_ITEMS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const orderLines = Object.entries(cart)
      .map(([id, qty]) => {
        const item = MERCH_ITEMS.find((i) => i.id === id);
        return item ? `${item.name}: ${qty}` : null;
      })
      .filter(Boolean);

    const shopName = selectedAccount?.name || 'Unknown';
    const location = [selectedAccount?.city, selectedAccount?.state].filter(Boolean).join(', ');
    const subject = encodeURIComponent(`Highsman Merch Order — ${shopName}`);
    const body = encodeURIComponent(
      `Store: ${shopName}${location ? ` (${location})` : ''}\nZoho ID: ${selectedAccount?.id || 'N/A'}\nContact: ${contactName}\nEmail: ${contactEmail}\n\nOrder:\n${orderLines.join('\n')}\n\nNotes: ${notes || 'None'}`,
    );
    window.location.href = `mailto:njsales@highsman.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Sticky Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-[#A9ACAF]/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="no-underline">
              <img
                src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
                alt="Highsman"
                className="h-7"
              />
            </a>
            <div className="h-6 w-px bg-[#A9ACAF]/30" />
            <span className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-[#A9ACAF]">
              Retail Merch Store
            </span>
          </div>

          {/* Cart summary — only show when account is selected */}
          {selectedAccount && totalItems > 0 && (
            <a
              href="#order"
              className="flex items-center gap-2 bg-[#F5E400] text-black font-headline text-sm font-bold uppercase tracking-wide px-5 py-2.5 no-underline hover:bg-[#F5E400]/90 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">shopping_cart</span>
              {totalItems} {totalItems === 1 ? 'Item' : 'Items'} — Review Order
            </a>
          )}
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-20 md:py-28 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#111] to-black" />
        <div className="absolute inset-0 opacity-5" style={{backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, #F5E400 20px, #F5E400 21px)'}} />
        <div className="relative max-w-3xl mx-auto">
          <p className="font-headline text-xs font-bold tracking-[0.4em] text-[#F5E400] uppercase mb-4">
            For Authorized Retailers Only
          </p>
          <h1 className="font-headline text-5xl md:text-6xl font-bold uppercase leading-[0.95] mb-6">
            Elevate Your<br />
            <span className="text-[#F5E400]">Retail Space</span>
          </h1>
          <p className="text-lg text-[#A9ACAF] max-w-xl mx-auto leading-relaxed mb-10">
            Premium point-of-sale displays, signage, and branded materials — free for
            Highsman retail partners. Select what you need and we'll ship it to your store.
          </p>

          {/* ── Dispensary Selector ─────────────────────────────────────── */}
          <div className="max-w-lg mx-auto text-left">
            <label
              className="font-headline text-xs font-bold tracking-[0.3em] text-[#F5E400] uppercase mb-3 block"
              htmlFor="retail-account-search"
            >
              Your Dispensary
            </label>

            {selectedAccount ? (
              /* ── Selected state ─────────────────────────────────────── */
              <div
                className="flex items-center justify-between gap-4 flex-wrap px-5 py-4"
                style={{
                  background: 'rgba(245,228,0,0.06)',
                  border: '1px solid rgba(245,228,0,0.25)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <p className="font-headline text-xl font-bold uppercase tracking-wide text-white">
                    {selectedAccount.name}
                  </p>
                  <p className="text-sm mt-1 text-[#A9ACAF]">
                    {[selectedAccount.city, selectedAccount.state].filter(Boolean).join(', ') || 'Location not set'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedAccount(null);
                    setAccountQuery('');
                    setCart({});
                    setSubmitted(false);
                    setTimeout(() => accountInputRef.current?.focus(), 50);
                  }}
                  className="font-headline text-xs font-bold uppercase tracking-[0.15em] px-4 py-2 cursor-pointer transition-opacity hover:opacity-80 bg-transparent text-[#A9ACAF] border border-[#A9ACAF]/30"
                  style={{borderRadius: 4}}
                >
                  Change
                </button>
              </div>
            ) : (
              /* ── Search state ───────────────────────────────────────── */
              <div className="relative">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#A9ACAF]/50 text-xl">search</span>
                  <input
                    ref={accountInputRef}
                    id="retail-account-search"
                    type="text"
                    value={accountQuery}
                    onChange={(e) => {
                      setAccountQuery(e.target.value);
                      setShowAccountDropdown(e.target.value.length >= 2);
                    }}
                    onFocus={() => {
                      if (accountQuery.length >= 2) setShowAccountDropdown(true);
                    }}
                    placeholder="Start typing your dispensary name…"
                    autoComplete="off"
                    className="w-full text-base bg-[#111] border border-[#A9ACAF]/30 pl-12 pr-4 py-4 text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                    style={{borderRadius: 8}}
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#A9ACAF]/50">
                      Searching…
                    </div>
                  )}
                </div>

                {/* ── Dropdown results ────────────────────────────────── */}
                {showAccountDropdown && accountResults.length > 0 && (
                  <div
                    ref={accountDropdownRef}
                    className="absolute left-0 right-0 z-50 mt-2 overflow-hidden"
                    style={{
                      background: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8,
                      maxHeight: 320,
                      overflowY: 'auto',
                    }}
                  >
                    {accountResults.map((acct: Account) => (
                      <button
                        key={acct.id}
                        onClick={() => {
                          setSelectedAccount(acct);
                          setAccountQuery(acct.name);
                          setShowAccountDropdown(false);
                        }}
                        className="w-full text-left px-5 py-3.5 cursor-pointer transition-colors bg-transparent border-0 text-white"
                        style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,228,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                      >
                        <span className="text-sm font-semibold">{acct.name}</span>
                        {(acct.city || acct.state) && (
                          <span className="text-xs ml-2 text-[#A9ACAF]/60">
                            {[acct.city, acct.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* No results */}
                {showAccountDropdown && accountQuery.length >= 2 && accountResults.length === 0 && !isSearching && accountFetcher.state === 'idle' && (
                  <div
                    className="absolute left-0 right-0 z-50 mt-2 px-5 py-4"
                    style={{
                      background: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8,
                    }}
                  >
                    <p className="text-sm text-[#A9ACAF]/60 mb-2">
                      No dispensary found for "{accountQuery}"
                    </p>
                    <p className="text-xs text-[#A9ACAF]/40">
                      Contact <a href="mailto:njsales@highsman.com" className="text-[#F5E400] no-underline hover:underline">njsales@highsman.com</a> to get set up as a retail partner.
                    </p>
                  </div>
                )}

                {accountQuery.length === 0 && (
                  <p className="text-xs text-[#A9ACAF]/40 mt-3">
                    Search for your dispensary to access the merch catalog. New partner?{' '}
                    <a href="mailto:njsales@highsman.com" className="text-[#F5E400] no-underline hover:underline">
                      Contact us
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Everything below only shows after dispensary is selected ─── */}
      {selectedAccount && (
        <>
          {/* ── Category Filter ───────────────────────────────────────── */}
          <nav className="sticky top-[65px] z-40 bg-black/95 backdrop-blur-sm border-b border-[#A9ACAF]/20">
            <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveCategory(null)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 font-headline text-xs font-bold uppercase tracking-wide border transition-colors ${
                  !activeCategory
                    ? 'bg-[#F5E400] text-black border-[#F5E400]'
                    : 'bg-transparent text-[#A9ACAF] border-[#A9ACAF]/30 hover:border-[#F5E400]/60 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">grid_view</span>
                All ({MERCH_ITEMS.length})
              </button>
              {CATEGORIES.map((cat) => {
                const count = MERCH_ITEMS.filter((i) => i.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 font-headline text-xs font-bold uppercase tracking-wide border transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-[#F5E400] text-black border-[#F5E400]'
                        : 'bg-transparent text-[#A9ACAF] border-[#A9ACAF]/30 hover:border-[#F5E400]/60 hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                    {cat.label} ({count})
                  </button>
                );
              })}
            </div>
          </nav>

          {/* ── Product Grid ──────────────────────────────────────────── */}
          <main className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => {
                const qty = cart[item.id] || 0;
                return (
                  <article
                    key={item.id}
                    className="group relative bg-[#111] border border-[#A9ACAF]/15 hover:border-[#F5E400]/40 transition-all flex flex-col overflow-hidden"
                  >
                    {/* Tag */}
                    {item.tag && (
                      <span className="absolute top-3 left-3 z-10 bg-[#F5E400] text-black font-headline text-[10px] font-bold tracking-widest uppercase px-2.5 py-1">
                        {item.tag}
                      </span>
                    )}

                    {/* Image */}
                    <div className="relative bg-white overflow-hidden" style={{aspectRatio: '4/3'}}>
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-5 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-headline text-base font-bold uppercase tracking-wide leading-tight">
                          {item.name}
                        </h3>
                        <span className="font-headline text-lg font-bold text-[#F5E400] whitespace-nowrap">
                          FREE
                        </span>
                      </div>
                      {item.dimensions && (
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-[#A9ACAF] bg-[#A9ACAF]/10 px-2 py-0.5 rounded-sm mb-2 w-fit">
                          {item.dimensions}
                        </span>
                      )}
                      <p className="text-sm text-[#A9ACAF] leading-relaxed flex-1 mb-4">
                        {item.description}
                      </p>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-3">
                        {qty === 0 ? (
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            className="w-full flex items-center justify-center gap-2 bg-transparent border border-[#F5E400] text-[#F5E400] font-headline text-xs font-bold uppercase tracking-wide py-2.5 hover:bg-[#F5E400] hover:text-black transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">add_shopping_cart</span>
                            Add to Order
                          </button>
                        ) : (
                          <>
                            <div className="flex items-center border border-[#A9ACAF]/30">
                              <button
                                onClick={() => updateQty(item.id, -1)}
                                className="w-9 h-9 flex items-center justify-center text-white hover:bg-[#A9ACAF]/10 transition-colors"
                              >
                                <span className="material-symbols-outlined text-sm">remove</span>
                              </button>
                              <span className="w-10 h-9 flex items-center justify-center font-headline text-sm font-bold border-x border-[#A9ACAF]/30">
                                {qty}
                              </span>
                              <button
                                onClick={() => updateQty(item.id, 1)}
                                className={`w-9 h-9 flex items-center justify-center transition-colors ${
                                  qty >= item.maxQty
                                    ? 'text-[#A9ACAF]/30 cursor-not-allowed'
                                    : 'text-white hover:bg-[#A9ACAF]/10'
                                }`}
                                disabled={qty >= item.maxQty}
                              >
                                <span className="material-symbols-outlined text-sm">add</span>
                              </button>
                            </div>
                            <span className="text-[10px] text-[#A9ACAF] uppercase tracking-wide">
                              Max {item.maxQty}
                            </span>
                            <button
                              onClick={() => setCart((prev) => {
                                const {[item.id]: _, ...rest} = prev;
                                return rest;
                              })}
                              className="ml-auto text-[#A9ACAF]/60 hover:text-red-400 transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </main>

          {/* ── Order Review / Submit ──────────────────────────────────── */}
          {totalItems > 0 && (
            <section id="order" className="border-t border-[#A9ACAF]/20 bg-[#0a0a0a]">
              <div className="max-w-3xl mx-auto px-6 py-16">
                <div className="text-center mb-10">
                  <p className="font-headline text-xs font-bold tracking-[0.4em] text-[#F5E400] uppercase mb-2">
                    Review & Submit
                  </p>
                  <h2 className="font-headline text-3xl font-bold uppercase">
                    Your Order
                  </h2>
                </div>

                {/* Show selected dispensary */}
                <div className="mb-8 px-5 py-4 border border-[#A9ACAF]/20 bg-[#111]">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#A9ACAF] mb-1.5">
                    Ordering For
                  </p>
                  <p className="text-lg font-semibold">{selectedAccount.name}</p>
                  {(selectedAccount.city || selectedAccount.state) && (
                    <p className="text-sm text-[#A9ACAF]">
                      {[selectedAccount.city, selectedAccount.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>

                {submitted ? (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-5xl text-[#F5E400] mb-4">check_circle</span>
                    <h3 className="font-headline text-2xl font-bold uppercase mb-3">Order Submitted</h3>
                    <p className="text-[#A9ACAF]">
                      Your email client should have opened with your order details.
                      Our team will confirm your order within 1-2 business days.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    {/* Order summary */}
                    <div className="border border-[#A9ACAF]/20 mb-8">
                      <div className="px-5 py-3 bg-[#111] border-b border-[#A9ACAF]/20">
                        <p className="font-headline text-xs font-bold uppercase tracking-wide text-[#A9ACAF]">
                          Order Summary — {totalItems} {totalItems === 1 ? 'Item' : 'Items'}
                        </p>
                      </div>
                      <div className="divide-y divide-[#A9ACAF]/10">
                        {Object.entries(cart).map(([id, qty]) => {
                          const item = MERCH_ITEMS.find((i) => i.id === id);
                          if (!item) return null;
                          return (
                            <div key={id} className="flex items-center gap-4 px-5 py-3">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-14 h-14 object-contain bg-white rounded-sm flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{item.name}</p>
                                {item.dimensions && (
                                  <p className="text-xs text-[#A9ACAF]">{item.dimensions}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-headline text-sm font-bold">×{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => setCart((prev) => {
                                    const {[id]: _, ...rest} = prev;
                                    return rest;
                                  })}
                                  className="text-[#A9ACAF]/60 hover:text-red-400 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-[#A9ACAF] mb-1.5">
                          Contact Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          className="w-full bg-[#111] border border-[#A9ACAF]/30 px-4 py-3 text-sm text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                          placeholder="Your name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-[#A9ACAF] mb-1.5">
                          Email *
                        </label>
                        <input
                          type="email"
                          required
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="w-full bg-[#111] border border-[#A9ACAF]/30 px-4 py-3 text-sm text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                          placeholder="you@dispensary.com"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold uppercase tracking-wide text-[#A9ACAF] mb-1.5">
                          Notes (optional)
                        </label>
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full bg-[#111] border border-[#A9ACAF]/30 px-4 py-3 text-sm text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                          placeholder="Shipping address, special requests, etc."
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 bg-[#F5E400] text-black font-headline text-base font-bold uppercase tracking-wide py-4 hover:bg-[#F5E400]/90 transition-colors"
                    >
                      <span className="material-symbols-outlined text-xl">send</span>
                      Submit Order Request
                    </button>
                    <p className="text-center text-xs text-[#A9ACAF]/60 mt-3">
                      All items are complimentary for authorized Highsman retail partners.
                      Orders are confirmed within 1-2 business days.
                    </p>
                  </form>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#A9ACAF]/20 px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Spark_Greatness_White.png?v=1775594430"
            alt="Spark Greatness"
            className="h-5 opacity-70"
          />
          <p className="text-xs text-[#A9ACAF]/60">
            Questions? Contact <a href="mailto:njsales@highsman.com" className="text-[#F5E400] no-underline hover:underline">njsales@highsman.com</a>
          </p>
        </div>
      </footer>

      {/* Google Material Icons */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
      />
    </div>
  );
}
