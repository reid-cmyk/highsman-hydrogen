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
};

export const FORMATS: ProductFormat[] = [
  {
    slug: 'hit-stick',
    name: 'Hit Sticks',
    sizeLabel: '0.5g Dispose-A-Bowl',
    useCase: 'On-the-go, single-session',
  },
  {
    slug: 'triple-threat-preroll',
    name: 'Triple Threat Pre-Rolls',
    sizeLabel: '1.2g Triple-Infused',
    useCase: 'Shared sessions, heavy hitters',
  },
  {
    slug: 'ground-game',
    name: 'Ground Game Flower',
    sizeLabel: '7g Ready-to-Roll',
    useCase: 'Roll-your-own, flexible format',
  },
];
