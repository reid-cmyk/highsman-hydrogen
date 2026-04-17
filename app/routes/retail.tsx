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
  step?: number; // Order increment (defaults to 1). Use for items sold in packs (e.g., stickers in 10s).
  tag?: string;
  imageZoom?: number; // Multiplier for tight-cropped tube/bag shots with heavy source whitespace (defaults to 1).
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Catalog
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {id: 'pos-displays', label: 'POP Display Stands', icon: 'storefront'},
  {id: 'display-packaging', label: 'Display Packaging', icon: 'inventory_2'},
  {id: 'cutouts', label: 'Cutouts', icon: 'person'},
  {id: 'banners', label: 'Banners', icon: 'flag'},
  {id: 'stickers', label: 'Stickers', icon: 'sell'},
  {id: 'footballs', label: 'Footballs', icon: 'sports_football'},
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

  // ── In-Store Display Packaging ─────────────────────────────────────────────
  {
    id: 'display-hitstick-tube',
    name: 'Hit Stick Display Tube',
    category: 'display-packaging',
    description: 'Empty replica of the Hit Stick Dispose-A-Bowl black tube. Same packaging, same shelf presence, no product. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/HM_HitStick_Infused_White__800x360_1.png?v=1776435918',
    maxQty: 5,
    tag: 'New',
    imageZoom: 3.2,
  },
  {
    id: 'display-hitstick-powerpack',
    name: 'Hit Stick Power Pack Display Tin',
    category: 'display-packaging',
    description: 'Empty replica of the Hit Stick Power Pack 5-Pack black tin. Same packaging, same shelf presence, no product. Includes display stand. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_9.png',
    maxQty: 2,
    tag: 'New',
  },
  {
    id: 'display-hitstick-flyhigh',
    name: 'Fly High Display Tin',
    category: 'display-packaging',
    description: 'Empty replica of the Fly High Limited Edition 5-Pack tin. Same packaging, same shelf presence, no product. Includes display stand. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_10.png',
    maxQty: 2,
    tag: 'New',
  },
  {
    id: 'display-preroll-tube',
    name: 'Triple Threat Pre-Roll Display Tube',
    category: 'display-packaging',
    description: 'Empty replica of the Triple Threat 1.2g Pre-Roll tube. Same packaging, same shelf presence, no product. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_14.png?v=1776436052',
    maxQty: 5,
    tag: 'New',
    imageZoom: 1.9,
  },
  {
    id: 'display-groundgame-bag',
    name: 'Ground Game Display Bag',
    category: 'display-packaging',
    description: 'Empty replica of the Ground Game 7g Ready-to-Roll pouch. Same packaging, same shelf presence, no product. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Ground_Game_Bag_njretail.png?v=1776436172',
    maxQty: 5,
    tag: 'New',
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

  // ── Stand-Up Sign Displays (grouped under POP Display Stands) ──────────────
  {
    id: 'sign-all-products',
    name: 'All Products Stand Up Sign',
    category: 'pos-displays',
    description: 'Full product lineup on a single countertop stand. Showcases Hit Sticks, Pre-Rolls, and Ground Game with all five flavors.',
    dimensions: '7.87 × 9.84 in',
    image: '/retail/all-product-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-hitstick',
    name: 'Hit Stick Stand Up Sign',
    category: 'pos-displays',
    description: 'Countertop display sign featuring the Hit Stick Dispose-A-Bowl with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/hitstick-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-preroll',
    name: 'Pre-Roll Stand Up Sign',
    category: 'pos-displays',
    description: 'Countertop display sign featuring the Triple Threat 1.2g Pre-Roll with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/preroll-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-groundgame',
    name: 'Ground Game Stand Up Sign',
    category: 'pos-displays',
    description: 'Countertop display sign featuring Ground Game 7g Ready-to-Roll Flower with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/groundgame-sign.png',
    maxQty: 5,
    tag: 'New',
  },

  // ── Stickers ───────────────────────────────────────────────────────────────
  {
    id: 'sticker-logo',
    name: 'Highsman Logo Sticker',
    category: 'stickers',
    description: 'Classic Highsman wordmark sticker. Built for register counters, case glass, customer giveaway bags, and budtender swag. Every sticker is a brand touchpoint that follows the customer home. Sold in 10-packs.',
    dimensions: '3.6 × 1.26 in',
    image: '/retail/sticker-logo.png',
    maxQty: 50,
    step: 10,
    tag: 'New',
  },

  // ── Branded Footballs ──────────────────────────────────────────────────────
  {
    id: 'football-signed',
    name: 'Signed Ricky Williams Football',
    category: 'footballs',
    description: 'The ultimate collector\'s item. Custom Highsman football with Ricky Williams\' authentic signature. A high-value prize for top customers and major in-store promotions. Includes display stand.',
    image: '/retail/signed-football.png',
    maxQty: 1,
    tag: 'Limited',
  },
  {
    id: 'football-branded',
    name: 'Highsman Branded Football',
    category: 'footballs',
    description: 'Premium branded football — a fantastic giveaway item. Perfect for building brand loyalty and engaging the sports-loving cannabis consumer. Includes display stand.',
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
  const createAccountFetcher = useFetcher<{ok: boolean; account?: Account; error?: string}>();
  const [accountQuery, setAccountQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [newAccountError, setNewAccountError] = useState<string | null>(null);
  const accountInputRef = useRef<HTMLInputElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Address autocomplete state (Google Places)
  const [addressQuery, setAddressQuery] = useState('');
  const [addressPredictions, setAddressPredictions] = useState<Array<{placeId: string; description: string; mainText: string; secondaryText: string}>>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<{display: string; street: string; city: string; state: string; zip: string} | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressDropdownRef = useRef<HTMLDivElement>(null);

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

  // Handle create-account response
  useEffect(() => {
    if (createAccountFetcher.state === 'idle' && createAccountFetcher.data) {
      if (createAccountFetcher.data.ok && createAccountFetcher.data.account) {
        setSelectedAccount(createAccountFetcher.data.account);
        setShowNewAccountForm(false);
        setNewAccountError(null);
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
        setSelectedAddress({display: prediction.description, street: '', city: '', state: '', zip: ''});
      }
    } catch {
      setSelectedAddress({display: prediction.description, street: '', city: '', state: '', zip: ''});
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

  // ── Cart & Product State ───────────────────────────────────────────────────
  const [cart, setCart] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');

  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  const updateQty = (id: string, delta: number) => {
    const item = MERCH_ITEMS.find((i) => i.id === id);
    if (!item) return;
    const step = item.step ?? 1;
    setCart((prev) => {
      const current = prev[id] || 0;
      // delta is the direction (+1 / -1); multiply by item's step so pack-based items move in increments
      const next = Math.max(0, Math.min(item.maxQty, current + delta * step));
      if (next === 0) {
        const {[id]: _, ...rest} = prev;
        return rest;
      }
      return {...prev, [id]: next};
    });
  };

  const filteredItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return MERCH_ITEMS.filter((i) => {
      const catMatch = activeCategory ? i.category === activeCategory : true;
      const searchMatch = q
        ? `${i.name} ${i.description} ${i.dimensions || ''} ${i.tag || ''}`.toLowerCase().includes(q)
        : true;
      return catMatch && searchMatch;
    });
  }, [activeCategory, catalogSearch]);

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
      <section className="relative px-6 pt-14 pb-10 md:pt-20 md:pb-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] to-black" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 18px, #F5E400 18px, #F5E400 19px)',
          }}
        />
        {/* Yellow glow accent, right side */}
        <div
          className="absolute top-1/2 right-[-10%] -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.09] pointer-events-none hidden md:block"
          style={{background: 'radial-gradient(circle, #F5E400 0%, transparent 70%)'}}
        />

        <div className="relative max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-10 md:gap-14 items-center">
          {/* ── Left column: positioning + selector ─────────────────── */}
          <div className="text-left">
            <p className="font-headline text-[11px] font-bold tracking-[0.4em] text-[#F5E400] uppercase mb-5 flex items-center gap-2">
              <span className="inline-block w-8 h-px bg-[#F5E400]" />
              For Authorized Retailers
            </p>
            <h1 className="font-headline text-[44px] sm:text-5xl md:text-[64px] font-bold uppercase leading-[0.92] mb-5 tracking-tight">
              Elevate Your<br />
              <span className="text-[#F5E400]">Retail Space</span>
            </h1>
            <p className="text-base md:text-lg text-[#A9ACAF] max-w-xl leading-relaxed mb-8">
              Premium point-of-sale displays, in-store signage, and branded materials —
              complimentary for Highsman partners. Pick what you need, we'll ship it free.
            </p>

          {/* ── Dispensary Selector ─────────────────────────────────────── */}
          <div className="max-w-lg text-left">
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
                    setShowNewAccountForm(false);
                    setNewAccountError(null);
                    setAddressQuery('');
                    setSelectedAddress(null);
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
                    {/* Add New option at bottom of results */}
                    <button
                      onClick={() => {
                        setShowAccountDropdown(false);
                        setShowNewAccountForm(true);
                      }}
                      className="w-full text-left px-5 py-3.5 cursor-pointer text-sm font-semibold bg-transparent border-0"
                      style={{borderTop: '1px solid rgba(255,255,255,0.12)', color: '#F5E400'}}
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
                {showAccountDropdown && !showNewAccountForm && accountQuery.length >= 2 && accountResults.length === 0 && !isSearching && accountFetcher.state === 'idle' && (
                  <div
                    className="absolute left-0 right-0 z-50 mt-2 px-5 py-4"
                    style={{
                      background: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8,
                    }}
                  >
                    <p className="text-sm text-[#A9ACAF]/60 mb-3">
                      No dispensary found for "{accountQuery}"
                    </p>
                    <button
                      onClick={() => {
                        setShowAccountDropdown(false);
                        setShowNewAccountForm(true);
                      }}
                      className="font-headline text-sm font-bold uppercase tracking-[0.15em] px-5 py-2.5 cursor-pointer transition-opacity hover:opacity-85 bg-[#F5E400] text-black border-0"
                      style={{borderRadius: 4}}
                    >
                      + Add New Dispensary
                    </button>
                  </div>
                )}

                {accountQuery.length === 0 && !showNewAccountForm && (
                  <p className="text-xs text-[#A9ACAF]/40 mt-3">
                    Search for your dispensary to access the merch catalog. New partner?{' '}
                    <button
                      onClick={() => setShowNewAccountForm(true)}
                      className="text-[#F5E400] bg-transparent border-0 cursor-pointer underline text-xs p-0"
                    >
                      Register here
                    </button>
                  </p>
                )}
              </div>
            )}

            {/* ── New Dispensary Registration Form ──────────────────────── */}
            {showNewAccountForm && !selectedAccount && (
              <div
                className="mt-4 max-w-lg mx-auto text-left"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '20px 24px',
                }}
              >
                <div className="flex items-center justify-between mb-5">
                  <p className="font-headline text-base font-bold uppercase tracking-[0.12em] text-white">
                    Register New Dispensary
                  </p>
                  <button
                    onClick={() => {
                      setShowNewAccountForm(false);
                      setNewAccountError(null);
                    }}
                    className="text-xs uppercase tracking-wider cursor-pointer bg-transparent border-0 text-[#A9ACAF]/60"
                  >
                    Cancel
                  </button>
                </div>

                <createAccountFetcher.Form method="post" action="/api/accounts" className="space-y-4">
                  {/* Dispensary Name */}
                  <div>
                    <label className="text-xs font-bold tracking-wider uppercase block mb-1.5 text-[#A9ACAF]">
                      Dispensary Name *
                    </label>
                    <input
                      name="dispensaryName"
                      type="text"
                      required
                      defaultValue={accountQuery}
                      placeholder="e.g. Green Leaf Dispensary"
                      className="w-full text-sm bg-[#111] border border-[#A9ACAF]/20 px-3.5 py-2.5 text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                      style={{borderRadius: 4}}
                    />
                  </div>

                  {/* Contact Name + Job Role */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold tracking-wider uppercase block mb-1.5 text-[#A9ACAF]">
                        Contact Name *
                      </label>
                      <input
                        name="contactName"
                        type="text"
                        required
                        placeholder="First Last"
                        className="w-full text-sm bg-[#111] border border-[#A9ACAF]/20 px-3.5 py-2.5 text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                        style={{borderRadius: 4}}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold tracking-wider uppercase block mb-1.5 text-[#A9ACAF]">
                        Job Role
                      </label>
                      <select
                        name="jobRole"
                        className="w-full text-sm bg-[#111] border border-[#A9ACAF]/20 px-3.5 py-2.5 text-white focus:border-[#F5E400] focus:outline-none transition-colors"
                        style={{borderRadius: 4, appearance: 'none' as any, WebkitAppearance: 'none'}}
                      >
                        <option value="" style={{background: '#1A1A1A'}}>Select role…</option>
                        <option value="Owner" style={{background: '#1A1A1A'}}>Owner</option>
                        <option value="General Manager" style={{background: '#1A1A1A'}}>General Manager</option>
                        <option value="Buyer / Purchasing" style={{background: '#1A1A1A'}}>Buyer / Purchasing</option>
                        <option value="Dispensary Manager" style={{background: '#1A1A1A'}}>Dispensary Manager</option>
                        <option value="Budtender" style={{background: '#1A1A1A'}}>Budtender</option>
                        <option value="Other" style={{background: '#1A1A1A'}}>Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Phone + Email */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold tracking-wider uppercase block mb-1.5 text-[#A9ACAF]">
                        Phone
                      </label>
                      <input
                        name="phone"
                        type="tel"
                        placeholder="(555) 123-4567"
                        className="w-full text-sm bg-[#111] border border-[#A9ACAF]/20 px-3.5 py-2.5 text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                        style={{borderRadius: 4}}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold tracking-wider uppercase block mb-1.5 text-[#A9ACAF]">
                        Email *
                      </label>
                      <input
                        name="email"
                        type="email"
                        required
                        placeholder="you@dispensary.com"
                        className="w-full text-sm bg-[#111] border border-[#A9ACAF]/20 px-3.5 py-2.5 text-white placeholder-[#A9ACAF]/40 focus:border-[#F5E400] focus:outline-none transition-colors"
                        style={{borderRadius: 4}}
                      />
                    </div>
                  </div>

                  {/* Address with Google Places autocomplete */}
                  <div className="relative">
                    <label className="text-xs font-bold tracking-wider uppercase block mb-1.5 text-[#A9ACAF]">
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
                      className="w-full text-sm bg-[#111] px-3.5 py-2.5 text-white placeholder-[#A9ACAF]/40 focus:outline-none transition-colors"
                      style={{
                        border: `1px solid ${selectedAddress ? 'rgba(245,228,0,0.3)' : 'rgba(169,172,175,0.2)'}`,
                        borderRadius: 4,
                      }}
                    />
                    {/* Hidden fields for form submission */}
                    <input type="hidden" name="street" value={selectedAddress?.street || ''} />
                    <input type="hidden" name="city" value={selectedAddress?.city || ''} />
                    <input type="hidden" name="state" value={selectedAddress?.state || ''} />
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
                            className="w-full text-left px-4 py-2.5 cursor-pointer text-sm bg-transparent border-0 text-white"
                            style={{borderBottom: '1px solid rgba(255,255,255,0.06)'}}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,228,0,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            }}
                          >
                            <span>{pred.mainText}</span>
                            {pred.secondaryText && (
                              <span className="text-[#A9ACAF]/50 ml-1.5 text-xs">{pred.secondaryText}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {addressLoading && (
                      <div className="text-xs mt-1 text-[#A9ACAF]/40">Loading address…</div>
                    )}
                  </div>

                  {/* Error message */}
                  {newAccountError && (
                    <p className="text-sm text-red-400">{newAccountError}</p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={createAccountFetcher.state === 'submitting'}
                    className="font-headline text-sm font-bold uppercase tracking-[0.15em] px-8 py-3.5 cursor-pointer transition-opacity hover:opacity-90 bg-[#F5E400] text-black border-0"
                    style={{
                      borderRadius: 4,
                      opacity: createAccountFetcher.state === 'submitting' ? 0.6 : 1,
                    }}
                  >
                    {createAccountFetcher.state === 'submitting' ? 'Creating Account…' : 'Register & Start Ordering'}
                  </button>
                </createAccountFetcher.Form>
              </div>
            )}
          </div>
          </div>
          {/* ── End Left Column ─────────────────────────────────────── */}

          {/* ── Right Column: Merch Stack Visual ────────────────────── */}
          <div className="relative hidden md:block">
            <div className="relative aspect-[4/5] w-full max-w-md ml-auto">
              {/* Main hero visual: Ricky cutout as the anchor */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, #F5E400 0%, #F5E400 100%)',
                  clipPath: 'polygon(0 0, 100% 0, 100% 92%, 0 100%)',
                }}
              />
              <img
                src="/retail/ricky-cutout.png"
                alt="Ricky Williams cutout — Highsman retail display"
                className="relative w-full h-full object-contain object-bottom z-10"
                style={{filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))'}}
              />
              {/* Product stack callout — bottom right floating card */}
              <div
                className="absolute -bottom-4 -right-4 bg-black border border-[#F5E400]/30 px-5 py-4 z-20 shadow-2xl"
                style={{minWidth: 190}}
              >
                <p className="font-headline text-[10px] font-bold tracking-[0.25em] text-[#F5E400] uppercase mb-1">
                  Signature Merch
                </p>
                <p className="font-headline text-xl font-bold uppercase leading-tight text-white">
                  Ricky Williams
                  <br />
                  <span className="text-[#A9ACAF] text-sm font-semibold normal-case tracking-normal">
                    Cutouts, footballs + more
                  </span>
                </p>
              </div>
              {/* Product stack callout — top left */}
              <div
                className="absolute -top-3 -left-3 bg-[#F5E400] text-black px-4 py-2 z-20 shadow-xl"
              >
                <p className="font-headline text-[11px] font-bold tracking-[0.2em] uppercase">
                  17+ Free Items
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Strip ───────────────────────────────────────────────── */}
      <section className="border-y border-[#A9ACAF]/15 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-3">
            <span className="material-symbols-outlined text-2xl text-[#F5E400]">verified</span>
            <div>
              <p className="font-headline text-xs font-bold uppercase tracking-[0.15em] text-white leading-tight">
                Complimentary
              </p>
              <p className="text-[11px] text-[#A9ACAF] leading-snug mt-0.5">
                Free for authorized partners
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center md:justify-start gap-3 md:border-l md:border-r md:border-[#A9ACAF]/15 md:px-6">
            <span className="material-symbols-outlined text-2xl text-[#F5E400]">local_shipping</span>
            <div>
              <p className="font-headline text-xs font-bold uppercase tracking-[0.15em] text-white leading-tight">
                Ships Fast
              </p>
              <p className="text-[11px] text-[#A9ACAF] leading-snug mt-0.5">
                1–2 business days
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center md:justify-start gap-3">
            <span className="material-symbols-outlined text-2xl text-[#F5E400]">support_agent</span>
            <div>
              <p className="font-headline text-xs font-bold uppercase tracking-[0.15em] text-white leading-tight">
                Brand Support
              </p>
              <p className="text-[11px] text-[#A9ACAF] leading-snug mt-0.5">
                Direct line to the Highsman team
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Everything below only shows after dispensary is selected ─── */}
      {selectedAccount && (
        <>
          {/* ── Category Filter + Catalog Search ──────────────────────── */}
          <nav className="sticky top-[65px] z-40 bg-black/95 backdrop-blur-sm border-b border-[#A9ACAF]/20">
            <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col lg:flex-row gap-3 lg:items-center">
              {/* Category pills — scrollable */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 min-w-0">
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

              {/* Catalog keyword search */}
              <div className="relative lg:w-64 flex-shrink-0">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#A9ACAF]/60 text-lg">search</span>
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search merch…"
                  className="w-full text-sm bg-[#111] border border-[#A9ACAF]/25 pl-10 pr-8 py-2 text-white placeholder-[#A9ACAF]/50 focus:border-[#F5E400] focus:outline-none transition-colors"
                  style={{borderRadius: 4}}
                />
                {catalogSearch && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setCatalogSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#A9ACAF]/60 hover:text-white transition-colors bg-transparent border-0 cursor-pointer p-1"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                )}
              </div>
            </div>
          </nav>

          {/* ── Product Grid ──────────────────────────────────────────── */}
          <main className="max-w-7xl mx-auto px-6 py-10 md:py-14">
            {/* Result count / active filter indicator */}
            {(activeCategory || catalogSearch) && (
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <p className="text-sm text-[#A9ACAF]">
                  <span className="font-headline font-bold text-white">{filteredItems.length}</span>{' '}
                  {filteredItems.length === 1 ? 'item' : 'items'}
                  {activeCategory && (
                    <>
                      {' in '}
                      <span className="font-headline font-bold uppercase tracking-wide text-white">
                        {CATEGORIES.find((c) => c.id === activeCategory)?.label}
                      </span>
                    </>
                  )}
                  {catalogSearch && (
                    <>
                      {' matching '}
                      <span className="font-headline font-bold text-white">"{catalogSearch}"</span>
                    </>
                  )}
                </p>
                <button
                  onClick={() => {
                    setActiveCategory(null);
                    setCatalogSearch('');
                  }}
                  className="font-headline text-[11px] font-bold uppercase tracking-[0.15em] text-[#F5E400] hover:text-white transition-colors bg-transparent border-0 cursor-pointer underline underline-offset-4"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Empty state */}
            {filteredItems.length === 0 ? (
              <div className="border border-[#A9ACAF]/15 bg-[#0a0a0a] py-16 px-6 text-center">
                <span className="material-symbols-outlined text-5xl text-[#A9ACAF]/40 mb-3">search_off</span>
                <h3 className="font-headline text-2xl font-bold uppercase mb-2">No matches</h3>
                <p className="text-sm text-[#A9ACAF] mb-6 max-w-md mx-auto">
                  Try a different keyword or clear your filters to see the full catalog.
                </p>
                <button
                  onClick={() => {
                    setActiveCategory(null);
                    setCatalogSearch('');
                  }}
                  className="font-headline text-xs font-bold uppercase tracking-[0.15em] bg-[#F5E400] text-black px-6 py-2.5 hover:opacity-90 transition-opacity cursor-pointer border-0"
                >
                  Show all merch
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                {filteredItems.map((item) => {
                  const qty = cart[item.id] || 0;
                  const isInCart = qty > 0;
                  const atMax = qty + (item.step ?? 1) > item.maxQty;
                  const addLabel = item.step && item.step > 1 ? `Add ${item.step}-pack` : 'Add to Order';
                  return (
                    <article
                      key={item.id}
                      className={`group relative bg-[#111] border transition-all flex flex-col overflow-hidden ${
                        isInCart
                          ? 'border-[#F5E400]/60 shadow-[0_0_0_1px_rgba(245,228,0,0.25)]'
                          : 'border-[#A9ACAF]/15 hover:border-[#F5E400]/40'
                      }`}
                    >
                      {/* Tag — top left */}
                      {item.tag && (
                        <span className="absolute top-3 left-3 z-10 bg-white text-black font-headline text-[10px] font-bold tracking-widest uppercase px-2.5 py-1">
                          {item.tag}
                        </span>
                      )}

                      {/* FREE pill — top right */}
                      <span className="absolute top-3 right-3 z-10 bg-[#F5E400] text-black font-headline text-[10px] font-bold tracking-widest uppercase px-2.5 py-1">
                        Free
                      </span>

                      {/* In-cart badge — appears below tag/free when added */}
                      {isInCart && (
                        <span className="absolute top-11 right-3 z-10 flex items-center gap-1 bg-black text-[#F5E400] border border-[#F5E400]/50 font-headline text-[10px] font-bold tracking-widest uppercase px-2 py-1">
                          <span className="material-symbols-outlined text-xs">check</span>
                          In Order
                        </span>
                      )}

                      {/* Image */}
                      <div className="relative bg-white overflow-hidden" style={{aspectRatio: '4/3'}}>
                        {item.imageZoom ? (
                          // For sources with heavy whitespace (tube shots), use a background-image
                          // div with explicit backgroundSize. This gives pixel-perfect control and
                          // avoids object-contain shrinking the product to nothing.
                          <div
                            role="img"
                            aria-label={item.name}
                            className="absolute inset-0 bg-no-repeat bg-center group-hover:scale-[1.04] transition-transform duration-300"
                            style={{
                              backgroundImage: `url(${item.image})`,
                              backgroundSize: `${Math.round(item.imageZoom * 100)}% auto`,
                            }}
                          />
                        ) : (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="absolute inset-0 w-full h-full object-contain p-5 group-hover:scale-[1.04] transition-transform duration-300"
                            loading="lazy"
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 p-5 flex flex-col">
                        <h3 className="font-headline text-base md:text-lg font-bold uppercase tracking-wide leading-tight mb-2">
                          {item.name}
                        </h3>
                        {item.dimensions && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#A9ACAF] bg-[#A9ACAF]/10 px-2 py-0.5 rounded-sm mb-2.5 w-fit">
                            <span className="material-symbols-outlined text-[11px]">straighten</span>
                            {item.dimensions}
                          </span>
                        )}
                        <p className="text-[13px] text-[#A9ACAF] leading-relaxed flex-1 mb-4">
                          {item.description}
                        </p>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-3">
                          {qty === 0 ? (
                            <button
                              onClick={() => updateQty(item.id, 1)}
                              className="w-full flex items-center justify-center gap-2 bg-transparent border border-[#F5E400] text-[#F5E400] font-headline text-xs font-bold uppercase tracking-wide py-3 hover:bg-[#F5E400] hover:text-black transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">add_shopping_cart</span>
                              {addLabel}
                            </button>
                          ) : (
                            <>
                              <div className="flex items-center border border-[#A9ACAF]/30">
                                <button
                                  aria-label="Decrease quantity"
                                  onClick={() => updateQty(item.id, -1)}
                                  className="w-9 h-9 flex items-center justify-center text-white hover:bg-[#A9ACAF]/10 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-sm">remove</span>
                                </button>
                                <span className="w-10 h-9 flex items-center justify-center font-headline text-sm font-bold border-x border-[#A9ACAF]/30">
                                  {qty}
                                </span>
                                <button
                                  aria-label="Increase quantity"
                                  onClick={() => updateQty(item.id, 1)}
                                  className={`w-9 h-9 flex items-center justify-center transition-colors ${
                                    atMax
                                      ? 'text-[#A9ACAF]/30 cursor-not-allowed'
                                      : 'text-white hover:bg-[#A9ACAF]/10'
                                  }`}
                                  disabled={atMax}
                                >
                                  <span className="material-symbols-outlined text-sm">add</span>
                                </button>
                              </div>
                              <div className="flex flex-col leading-tight">
                                <span className="text-[10px] font-bold text-[#A9ACAF] uppercase tracking-wider">
                                  Max {item.maxQty}
                                </span>
                                {item.step && item.step > 1 && (
                                  <span className="text-[10px] text-[#F5E400]/80 uppercase tracking-wider">
                                    Packs of {item.step}
                                  </span>
                                )}
                              </div>
                              <button
                                aria-label="Remove from order"
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
            )}
          </main>

          {/* ── Order Review / Submit ──────────────────────────────────── */}
          {totalItems > 0 && (
            <section id="order" className="border-t border-[#A9ACAF]/20 bg-[#0a0a0a]">
              <div className="max-w-3xl mx-auto px-6 py-14 md:py-16">
                <div className="text-center mb-8 md:mb-10">
                  <p className="font-headline text-xs font-bold tracking-[0.4em] text-[#F5E400] uppercase mb-2 flex items-center justify-center gap-2">
                    <span className="inline-block w-6 h-px bg-[#F5E400]" />
                    Review &amp; Submit
                    <span className="inline-block w-6 h-px bg-[#F5E400]" />
                  </p>
                  <h2 className="font-headline text-3xl md:text-4xl font-bold uppercase">
                    Your Order
                  </h2>
                </div>

                {/* Show selected dispensary */}
                <div className="mb-6 px-5 py-4 border border-[#A9ACAF]/20 bg-[#111] flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#A9ACAF] mb-1">
                      Shipping To
                    </p>
                    <p className="font-headline text-lg font-bold uppercase tracking-wide">{selectedAccount.name}</p>
                    {(selectedAccount.city || selectedAccount.state) && (
                      <p className="text-sm text-[#A9ACAF]">
                        {[selectedAccount.city, selectedAccount.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <a
                    href="#top"
                    onClick={(e) => {
                      e.preventDefault();
                      window.scrollTo({top: 0, behavior: 'smooth'});
                    }}
                    className="font-headline text-[11px] font-bold uppercase tracking-[0.15em] px-4 py-2 border border-[#A9ACAF]/40 text-[#A9ACAF] hover:border-white hover:text-white transition-colors no-underline"
                  >
                    Keep Shopping
                  </a>
                </div>

                {submitted ? (
                  <div className="text-center py-12 border border-[#F5E400]/30 bg-[#111]">
                    <span className="material-symbols-outlined text-5xl text-[#F5E400] mb-4">check_circle</span>
                    <h3 className="font-headline text-2xl md:text-3xl font-bold uppercase mb-3">Order Sent</h3>
                    <p className="text-[#A9ACAF] max-w-md mx-auto leading-relaxed px-6">
                      Your email client opened with a pre-filled order. Hit send and our team
                      will confirm within 1–2 business days.
                    </p>
                    <p className="text-sm text-[#A9ACAF] mt-4">
                      Questions? <a href="mailto:njsales@highsman.com" className="text-[#F5E400] no-underline hover:underline">njsales@highsman.com</a>
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
                      className="w-full flex items-center justify-center gap-2 bg-[#F5E400] text-black font-headline text-base md:text-lg font-bold uppercase tracking-wide py-4 md:py-5 hover:bg-[#F5E400]/90 transition-colors"
                    >
                      <span className="material-symbols-outlined text-xl">send</span>
                      Submit Order Request
                    </button>

                    {/* Trust signals below CTA */}
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#A9ACAF]">
                        <span className="material-symbols-outlined text-sm text-[#F5E400]">verified</span>
                        <span>Complimentary for partners</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#A9ACAF]">
                        <span className="material-symbols-outlined text-sm text-[#F5E400]">schedule</span>
                        <span>Confirmed in 1–2 days</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#A9ACAF]">
                        <span className="material-symbols-outlined text-sm text-[#F5E400]">local_shipping</span>
                        <span>Shipped direct to your store</span>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Mobile Sticky Order Bar ──────────────────────────────────── */}
      {selectedAccount && totalItems > 0 && !submitted && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-t border-[#F5E400]/30 px-4 py-3 safe-bottom"
          style={{paddingBottom: 'calc(12px + env(safe-area-inset-bottom))'}}
        >
          <a
            href="#order"
            className="flex items-center justify-between gap-3 bg-[#F5E400] text-black no-underline px-5 py-3.5 shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-xl">shopping_cart</span>
              <div className="flex flex-col leading-tight">
                <span className="font-headline text-sm font-bold uppercase tracking-wide">
                  {totalItems} {totalItems === 1 ? 'Item' : 'Items'}
                </span>
                <span className="text-[10px] uppercase tracking-wider opacity-80">
                  Complimentary
                </span>
              </div>
            </div>
            <span className="font-headline text-sm font-bold uppercase tracking-[0.15em] flex items-center gap-1">
              Review Order
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </span>
          </a>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        className={`border-t border-[#A9ACAF]/20 px-6 py-8 ${
          selectedAccount && totalItems > 0 && !submitted ? 'pb-28 md:pb-8' : ''
        }`}
      >
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
