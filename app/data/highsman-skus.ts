// ─────────────────────────────────────────────────────────────────────────────
// Highsman Product Catalog — 3 formats × 5 strains
// ─────────────────────────────────────────────────────────────────────────────
// Source of truth for the Vibes Team "SKUs in Stock" audit. Adding a new format
// or strain here instantly flows into /vibes/visit/new.
//
// Core brand architecture: "One foundation, five strains, three formats."
// Each format is a different use-case / form factor (not a quality tier).
// ─────────────────────────────────────────────────────────────────────────────

export type StrainProfile = 'Sativa' | 'Indica' | 'Hybrid';

export type Strain = {
  slug: string;
  name: string;
  profile: StrainProfile;
  shortTag: string;
};

export const STRAINS: Strain[] = [
  {
    slug: 'gridiron-grape',
    name: 'Gridiron Grape',
    profile: 'Sativa',
    shortTag: 'Bold grape + citrus, daytime focus',
  },
  {
    slug: 'cake-quake',
    name: 'Cake Quake',
    profile: 'Indica',
    shortTag: 'Sweet vanilla, full-body wind-down',
  },
  {
    slug: 'touchdown-tango-mango',
    name: 'Touchdown Tango Mango',
    profile: 'Hybrid',
    shortTag: 'Tropical mango, balanced effects',
  },
  {
    slug: 'wavy-watermelon',
    name: 'Wavy Watermelon',
    profile: 'Hybrid',
    shortTag: 'Juicy watermelon, smooth chill',
  },
  {
    slug: 'blueberry-blitz',
    name: 'Blueberry Blitz',
    profile: 'Sativa',
    shortTag: 'Sweet blueberry, uplifting rush',
  },
];

export type ProductFormat = {
  slug: string;
  name: string;
  sizeLabel: string;
  useCase: string;
  // Menu-audit metadata — what Serena verifies on each dispensary's
  // in-store digital + online menus. Single source of truth for the
  // Menus step at /vibes/visit/new.
  expectedBrand: string; // Always "Highsman" today, but explicit.
  expectedCategory: string; // Main menu category.
  expectedSubcategory: string; // Dispensary menu sub-category.
  expectedSize: string; // Short form shown on menu (e.g. "0.5g").
  expectedSizeLong: string; // Longer alt form some menus use (e.g. "1/4 oz").
};

export const FORMATS: ProductFormat[] = [
  {
    slug: 'hit-stick',
    name: 'Hit Sticks',
    sizeLabel: '0.5g Dispose-A-Bowl',
    useCase: 'On-the-go, single-session',
    expectedBrand: 'Highsman',
    expectedCategory: 'Pre-Rolls',
    expectedSubcategory: 'Pre-Rolls',
    expectedSize: '0.5g',
    expectedSizeLong: '0.5 gram',
  },
  {
    slug: 'triple-threat-preroll',
    name: 'Triple Threat Pre-Rolls',
    sizeLabel: '1.2g Triple-Infused',
    useCase: 'Shared sessions, heavy hitters',
    expectedBrand: 'Highsman',
    expectedCategory: 'Pre-Rolls',
    expectedSubcategory: 'Infused Pre-Rolls',
    expectedSize: '1.2g',
    expectedSizeLong: '1.2 gram',
  },
  {
    slug: 'ground-game',
    name: 'Ground Game Flower',
    sizeLabel: '7g Ready-to-Roll',
    useCase: 'Roll-your-own, flexible format',
    expectedBrand: 'Highsman',
    expectedCategory: 'Flower',
    expectedSubcategory: 'Infused Flower',
    expectedSize: '7g',
    expectedSizeLong: '1/4 oz',
  },
];

// The five menu-accuracy checks Serena runs per SKU per menu.
// Stable slugs so the audit JSONB shape is queryable server-side.
export type MenuCheckKey = 'photo' | 'category' | 'brand' | 'size' | 'price';

export const MENU_CHECKS: Array<{
  key: MenuCheckKey;
  label: string;
  short: string;
  describe: (f: ProductFormat) => string;
}> = [
  {
    key: 'photo',
    label: 'Photo',
    short: 'Pic',
    describe: () => 'Correct Highsman product photo (not a generic placeholder)',
  },
  {
    key: 'category',
    label: 'Category',
    short: 'Cat',
    describe: (f) =>
      `${f.expectedCategory} → ${f.expectedSubcategory}`,
  },
  {
    key: 'brand',
    label: 'Brand',
    short: 'Brand',
    describe: (f) => `Listed under "${f.expectedBrand}" (not the strain name)`,
  },
  {
    key: 'size',
    label: 'Size',
    short: 'Size',
    describe: (f) =>
      `${f.expectedSize}${f.expectedSizeLong !== f.expectedSize ? ` · ${f.expectedSizeLong}` : ''}`,
  },
  {
    key: 'price',
    label: 'Price',
    short: 'Price',
    describe: () => 'Matches the price guidance for this market',
  },
];
