// ─────────────────────────────────────────────────────────────────────────────
// Highsman Merch / POP Catalog
// ─────────────────────────────────────────────────────────────────────────────
// Shared source of truth used by:
//   • /retail             — wholesale ordering front end
//   • /vibes/visit/new    — Vibes Team in-store merch audit + drop-off tracking
//
// Adding a new item here instantly shows up in both flows.
// ─────────────────────────────────────────────────────────────────────────────

export interface MerchItem {
  id: string;
  name: string;
  category: string;
  description: string;
  dimensions?: string;
  image: string;
  maxQty: number;
  // Order increment (defaults to 1). Use for items sold in packs (e.g., stickers in 10s).
  step?: number;
  tag?: string;
}

export const CATEGORIES = [
  {id: 'pos-displays', label: 'POP Display Stands', icon: 'storefront'},
  {id: 'display-packaging', label: 'Display Packaging', icon: 'inventory_2'},
  {id: 'cutouts', label: 'Cutouts', icon: 'person'},
  {id: 'banners', label: 'Banners', icon: 'flag'},
  {id: 'stickers', label: 'Stickers', icon: 'sell'},
  {id: 'footballs', label: 'Footballs', icon: 'sports_football'},
];

// Editorial section copy for /retail — headline + selling intro.
// Kept in Highsman voice: confident, athletic, no hedging.
export const CATEGORY_COPY: Record<string, {headline: string; intro: string}> = {
  'pos-displays': {
    headline: 'Counter Takeover',
    intro:
      'Turn your counter into the main event. Stadium stands, acrylic signs, and fixtures built to move product off the shelf.',
  },
  'display-packaging': {
    headline: 'Shelf Presence. Zero Inventory.',
    intro:
      'Empty replicas of every pack — same shelf impact, nothing sellable tied up. Built for windows, counters, and product education.',
  },
  cutouts: {
    headline: 'Stopping Power',
    intro:
      'Life-size to shelf-top. Ricky Williams cutouts anchor the floor, spark photo ops, and stop customers mid-stride.',
  },
  banners: {
    headline: 'Big Brand Energy',
    intro:
      'Retractable banners for events, storefronts, and in-store backdrops. Quick setup, serious presence.',
  },
  stickers: {
    headline: 'Every Bag. Every Hand.',
    intro:
      'Packed in tens. Register counters, customer bags, budtender swag — every sticker is a brand touchpoint that follows the customer home.',
  },
  footballs: {
    headline: 'Grand Prize Energy',
    intro:
      "Collector's-grade footballs — signed by Ricky or branded Highsman. Made for giveaways and top-tier customer moments.",
  },
};

export const MERCH_ITEMS: MerchItem[] = [
  // ── Point of Sale Displays ─────────────────────────────────────────────────
  {
    id: 'stadium-display',
    name: 'Hit Stick Stadium Display',
    category: 'pos-displays',
    description:
      'Transform your counter into the main event. This stadium-shaped display holds the full range of Hit Stick products — an unmissable focal point that drives impulse buys and product education.',
    image: '/retail/stadium-display.png',
    maxQty: 2,
  },
  {
    id: 'acrylic-display',
    name: 'Hit Stick Acrylic Display',
    category: 'pos-displays',
    description:
      'Sleek acrylic sign holder detailing each Hit Stick tier — Exotic Indoor, Infused Indoor, and Rosin. Premium build, compact footprint, perfect for educating consumers at point of purchase.',
    image: '/retail/acrylic-display.png',
    maxQty: 3,
  },

  // ── In-Store Display Packaging ─────────────────────────────────────────────
  {
    id: 'display-hitstick-tube',
    name: 'Hit Stick Display Tube',
    category: 'display-packaging',
    description:
      'Empty replica of the Hit Stick Dispose-A-Bowl black tube. Same packaging, same shelf presence, no product. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: '/retail/hitstick-tube.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'display-hitstick-powerpack',
    name: 'Hit Stick Power Pack Display Tin',
    category: 'display-packaging',
    description:
      'Empty replica of the Hit Stick Power Pack 5-Pack black tin. Same packaging, same shelf presence, no product. Includes display stand. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_9.png',
    maxQty: 2,
    tag: 'New',
  },
  {
    id: 'display-hitstick-flyhigh',
    name: 'Fly High Display Tin',
    category: 'display-packaging',
    description:
      'Empty replica of the Fly High Limited Edition 5-Pack tin. Same packaging, same shelf presence, no product. Includes display stand. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Untitled_design_10.png',
    maxQty: 2,
    tag: 'New',
  },
  {
    id: 'display-preroll-tube',
    name: 'Triple Threat Pre-Roll Display Tube',
    category: 'display-packaging',
    description:
      'Empty replica of the Triple Threat 1.2g Pre-Roll tube. Same packaging, same shelf presence, no product. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image: '/retail/preroll-tube.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'display-groundgame-bag',
    name: 'Ground Game Display Bag',
    category: 'display-packaging',
    description:
      'Empty replica of the Ground Game 7g Ready-to-Roll pouch. Same packaging, same shelf presence, no product. Built for window displays, counter showcases, and product education without tying up sellable inventory.',
    image:
      'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Ground_Game_Bag_njretail.png?v=1776436172',
    maxQty: 5,
    tag: 'New',
  },

  // ── Cutouts & Standees ─────────────────────────────────────────────────────
  {
    id: 'cutout-6ft',
    name: '6ft Ricky Williams Cutout',
    category: 'cutouts',
    description:
      'The life-sized classic. Guaranteed to stop customers in their tracks. Ideal for entryways and high-traffic areas — creates the ultimate photo opportunity and drives social media engagement.',
    dimensions: '6ft tall',
    image: '/retail/ricky-cutout.png',
    maxQty: 1,
    tag: 'Fan Favorite',
  },
  {
    id: 'cutout-3ft',
    name: '3ft Ricky Williams Cutout',
    category: 'cutouts',
    description:
      'Perfect for smaller spaces, countertops, or creating layered displays. All the impact of the full-size cutout in a space-friendly format.',
    dimensions: '3ft tall',
    image: '/retail/ricky-cutout.png',
    maxQty: 2,
  },
  {
    id: 'cutout-10in',
    name: '10in Ricky Williams Cutout',
    category: 'cutouts',
    description:
      'Versatile mini cutout for shelf displays and accenting product arrangements. Great for case-top and register areas.',
    dimensions: '10in tall',
    image: '/retail/ricky-cutout.png',
    maxQty: 4,
  },

  // ── Banners ────────────────────────────────────────────────────────────────
  {
    id: 'banner-large',
    name: 'Large Retractable Banner',
    category: 'banners',
    description:
      'Command attention with this full-size, easy-to-assemble retractable banner. Perfect for events, storefronts, or as a major in-store backdrop.',
    image: '/retail/retractable-banner.png',
    maxQty: 1,
  },
  {
    id: 'banner-small',
    name: 'Small Retractable Banner',
    category: 'banners',
    description:
      'All the impact in a smaller package. Ideal for tighter spaces, pop-up events, or complementing larger displays.',
    image: '/retail/retractable-banner.png',
    maxQty: 1,
    tag: 'Popular',
  },

  // ── Stand-Up Sign Displays (grouped under POP Display Stands) ──────────────
  {
    id: 'sign-all-products',
    name: 'All Products Stand Up Sign',
    category: 'pos-displays',
    description:
      'Full product lineup on a single countertop stand. Showcases Hit Sticks, Pre-Rolls, and Ground Game with all five flavors.',
    dimensions: '7.87 × 9.84 in',
    image: '/retail/all-product-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-hitstick',
    name: 'Hit Stick Stand Up Sign',
    category: 'pos-displays',
    description:
      'Countertop display sign featuring the Hit Stick Dispose-A-Bowl with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/hitstick-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-preroll',
    name: 'Pre-Roll Stand Up Sign',
    category: 'pos-displays',
    description:
      'Countertop display sign featuring the Triple Threat 1.2g Pre-Roll with all five flavor badges.',
    dimensions: '7 × 7.76 in',
    image: '/retail/preroll-sign.png',
    maxQty: 5,
    tag: 'New',
  },
  {
    id: 'sign-groundgame',
    name: 'Ground Game Stand Up Sign',
    category: 'pos-displays',
    description:
      'Countertop display sign featuring Ground Game 7g Ready-to-Roll Flower with all five flavor badges.',
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
    description:
      'Classic Highsman wordmark sticker. Built for register counters, case glass, customer giveaway bags, and budtender swag. Every sticker is a brand touchpoint that follows the customer home. Sold in 10-packs.',
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
    description:
      "The ultimate collector's item. Custom Highsman football with Ricky Williams' authentic signature. A high-value prize for top customers and major in-store promotions. Includes display stand.",
    image: '/retail/signed-football.png',
    maxQty: 1,
    tag: 'Limited',
  },
  {
    id: 'football-branded',
    name: 'Highsman Branded Football',
    category: 'footballs',
    description:
      'Premium branded football — a fantastic giveaway item. Perfect for building brand loyalty and engaging the sports-loving cannabis consumer. Includes display stand.',
    image: '/retail/branded-football.png',
    maxQty: 1,
  },
];
