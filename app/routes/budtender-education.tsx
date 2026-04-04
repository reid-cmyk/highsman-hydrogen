import type {MetaFunction} from '@shopify/remix-oxygen';
import {useState, useEffect, useRef, useCallback} from 'react';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Budtender Education'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// ── Load Teko font ──────────────────────────────────────────────────────────
function useTekoFont() {
  useEffect(() => {
    if (document.getElementById('teko-font-link')) return;
    const link = document.createElement('link');
    link.id = 'teko-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);
}

// ── Hide Shopify theme chrome (header + footer) ─────────────────────────────
function useHideThemeChrome() {
  useEffect(() => {
    const header = document.querySelector('header') as HTMLElement | null;
    const footer = document.querySelector('footer') as HTMLElement | null;
    // Also remove any top padding/margin the main content area has for the fixed header
    const main = document.querySelector('main') as HTMLElement | null;

    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (main) {
      main.dataset.origPt = main.style.paddingTop;
      main.style.paddingTop = '0';
    }

    return () => {
      if (header) header.style.display = '';
      if (footer) footer.style.display = '';
      if (main) {
        main.style.paddingTop = main.dataset.origPt || '';
        delete main.dataset.origPt;
      }
    };
  }, []);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const KLAVIYO_PUBLIC_KEY = 'XiTH4j';
const BUDTENDER_LIST_ID = 'WBSrLZ';
const LOGO_URL =
  'https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png';
const SPARK_URL =
  'https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/020ea9cb-72e7-4f81-8cca-a2a70a4c9f16.png';
const GROUND_GAME_IMG =
  'https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/774d8da6-ed37-4110-8788-acd0d7b1447b.jpeg';
const TRIPLE_THREAT_IMG =
  'https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/24ca7f27-c951-4fa7-8f85-848a3d43c758.jpeg';
const RICKY_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/7b8854ab03ef40ce8c27d83e4b35589e.mp4';
const SCIENCE_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/591d15c90b9c44d3a1b1a603e7a31e9f.mp4';
const TRIPLE_THREAT_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/e73a4ecef2fb4f4f96a1792ee2911cb2.mp4';

// ── Points / Rewards System ─────────────────────────────────────────────────
const POINTS_SIGNUP = 200;
const POINTS_ALL_COMPLETE_BONUS = 2000; // Hall of Flame bonus
const POINTS_PER_DOLLAR = 100; // 100 pts = $1

// Tiered by level: Rookie=200, Practice Squad=300, Starting Lineup=400 each, Franchise Player=1000, Rushing Bonus=100
const COURSE_POINTS: Record<string, number> = {
  'meet-ricky': 200,        // Rookie
  'meet-highsman': 300,     // Practice Squad
  'hit-sticks': 400,        // Starting Lineup
  'triple-threat': 400,     // Starting Lineup
  'ground-game': 400,       // Starting Lineup
  'the-science': 1000,      // Franchise Player
  'rushing-bonus': 100,     // Rushing Bonus (survey)
};

function getCoursePoints(courseId: string): number {
  return COURSE_POINTS[courseId] || 200;
}

function calculatePoints(completedIds: Set<string>, totalCourses: number): number {
  let pts = POINTS_SIGNUP;
  for (const id of completedIds) {
    pts += getCoursePoints(id);
  }
  if (completedIds.size >= totalCourses) pts += POINTS_ALL_COMPLETE_BONUS;
  return pts;
}

function pointsToDollars(pts: number): string {
  return (pts / POINTS_PER_DOLLAR).toFixed(2);
}

// Max: 200 + 200+300+400+400+400+1000+100 + 2000 = 5,000 pts → $50.00
const MAX_POINTS = POINTS_SIGNUP + 200 + 300 + 400 + 400 + 400 + 1000 + 100 + POINTS_ALL_COMPLETE_BONUS;

// ── Session Persistence ──────────────────────────────────────────────────────
const SESSION_KEY = 'highsman_budtender_session';
const SESSION_EXPIRY_DAYS = 60; // 2 months

interface SessionData {
  name: string;
  email: string;
  state: string;
  dispensary?: string;
  completedCourses: string[];
  createdAt: number;
  expiresAt: number;
}

function saveSession(data: Omit<SessionData, 'createdAt' | 'expiresAt'> & Partial<Pick<SessionData, 'createdAt'>>) {
  try {
    const now = Date.now();
    const session: SessionData = {
      ...data,
      createdAt: data.createdAt || now,
      expiresAt: now + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: SessionData = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

// ── Google Sign-In ───────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = ''; // Set your Google OAuth Client ID here

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById('google-gsi')) { resolve(); return; }
    const script = document.createElement('script');
    script.id = 'google-gsi';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

function decodeJWT(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

// ── Course Data ───────────────────────────────────────────────────────────────
interface CourseSlide {
  title: string;
  content: string;
  keyPoints?: string[];
}

interface Course {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  level: 'Rookie' | 'Practice Squad' | 'Starting Lineup' | 'Franchise Player';
  icon: string;
  color: string;
  slides: CourseSlide[];
  audioSummary: string;
  quizLink?: string;
  videoUrl?: string;
}

const COURSES: Course[] = [
  // ── Rookie ──────────────────────────────────────────────────────────────
  {
    id: 'meet-ricky',
    title: 'Meet Ricky',
    subtitle: "Ricky Williams' journey — from the NFL to cannabis",
    duration: '5 min',
    level: 'Rookie',
    icon: '🏈',
    color: '#c8a84b',
    audioSummary: '',
    videoUrl: RICKY_VIDEO_URL,
    slides: [
      {
        title: 'Welcome to Meet Ricky',
        content:
          'Watch the video above to hear Ricky Williams tell his story — from Heisman Trophy winner and NFL star to cannabis advocate and founder of Highsman. Highsman sits at the intersection of Sports and Cannabis.',
        keyPoints: [
          'Watch the full video above before continuing',
          'Ricky Williams: Heisman winner, NFL star, cannabis pioneer',
          'Highsman = Sports × Cannabis',
          'Quiz coming soon',
        ],
      },
      {
        title: 'The Heisman to Highsman',
        content:
          'Ricky Williams won the Heisman Trophy in 1998 and went on to a celebrated NFL career. But his real legacy is bigger than football — he became one of the first athletes to openly advocate for cannabis, putting his career on the line for what he believed in.',
        keyPoints: [
          '1998 Heisman Trophy winner',
          'Over 10,000 career rushing yards in the NFL',
          'Put his career on the line for cannabis advocacy',
          'Turned personal conviction into a premium brand',
        ],
      },
      {
        title: 'Sports × Cannabis',
        content:
          'Highsman is not a stoner brand. It is not a wellness brand. It is a performance brand. Ricky represents the intersection of sports and cannabis — the idea that cannabis and peak performance are not opposites, they go hand in hand. That is the Highsman identity.',
        keyPoints: [
          'Performance brand, not a stoner brand',
          'Cannabis and peak performance go hand in hand',
          'Built on athletic credibility',
          'Tagline: SPARK GREATNESS™',
        ],
      },
    ],
  },
  // ── Practice Squad ──────────────────────────────────────────────────────
  {
    id: 'meet-highsman',
    title: 'Meet Highsman',
    subtitle: 'The brand — where we came from and what we stand for',
    duration: '8 min',
    level: 'Practice Squad',
    icon: '🏆',
    color: '#7c3aed',
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to Meet Highsman',
        content:
          'This course covers the Highsman brand — our origin story, what we stand for, and how we show up in the world. A brand video is being produced to bring this to life. For now, these slides capture the key brand pillars every budtender should know.',
        keyPoints: [
          'Brand video coming soon',
          'Quiz will follow once the video is live',
          'Learn the brand pillars that guide everything we do',
        ],
      },
      {
        title: 'Who Is Highsman?',
        content:
          'Highsman is a premium cannabis brand founded by Ricky Williams (#34). We sit at the intersection of Sports and Cannabis — representing cannabis and peak performance. Our tagline is SPARK GREATNESS™.',
        keyPoints: [
          'Founded by Ricky Williams (#34)',
          'The intersection of Sports and Cannabis',
          'Tagline: SPARK GREATNESS™',
          'Premium positioning — never discount-driven',
        ],
      },
      {
        title: 'The Brand Archetype',
        content:
          'Highsman embodies "The High Performer" archetype. We are confident and declarative — never arrogant. Credibly premium — quality proven by method, not just marketing. Direct — fewest words, strongest impact.',
        keyPoints: [
          'Confident, not arrogant',
          'Credibly premium, not pretentious',
          'Direct and science-backed',
          'Social & experiential, never clinical',
        ],
      },
      {
        title: 'Brand Voice Rules',
        content:
          'When representing Highsman, always lead with sensory outcomes. Avoid jargon, terpene breakdowns, and strain lineage when talking to customers. Use the assumptive close — never ask "Would you like to buy one?" Instead: "Do you want the single or the two-pack?"',
        keyPoints: [
          'Lead with sensory outcomes, not specs',
          'Assumptive close: "Single or two-pack?"',
          'Never say "artisan," "small batch," or "crafted"',
          'Never use "might," "may," or "we believe"',
        ],
      },
      {
        title: 'Key Terminology',
        content:
          'Using the right words matters. These are the approved terms every budtender should know and use consistently.',
        keyPoints: [
          'Triple Infused (capitalize, never hyphenate)',
          'Microstructure infusion (not "coated" or "dipped")',
          'Diamonds = THCA Isolate',
          'Live Resin (always capitalize)',
          'High Terpene Extract / HTE',
          'Interior kief (vs. exterior)',
        ],
      },
    ],
  },
  // ── Starting Lineup ─────────────────────────────────────────────────────
  {
    id: 'the-science',
    title: 'The Science',
    subtitle: 'Triple Infusion — the process that sets us apart',
    duration: '15 min',
    level: 'Starting Lineup',
    icon: '🔬',
    color: '#059669',
    videoUrl: SCIENCE_VIDEO_URL,
    audioSummary: '',
    slides: [
      {
        title: 'What Is Triple Infusion?',
        content:
          'Most infused pre-rolls just coat the outside — Diamonds, Live Resin, and terpene extract sitting on the surface. Highsman actually spins the concentrates into the flower at high speed so they go all the way through, like they were always there.',
        keyPoints: [
          'Not a coating — a structural integration',
          'Concentrates spun INTO the flower',
          'Burns smooth, flavor lasts the whole smoke',
          'Closest thing to hash in a pre-roll format',
        ],
      },
      {
        title: 'The Three Infusion Components',
        content:
          'The Triple Infusion liquid mixture starts with three premium components blended together, then a fourth is added and stirred to create the final infusion material.',
        keyPoints: [
          '1. Live Resin — full-spectrum extract',
          '2. High Terpene Extract (HTE) — flavor & aroma',
          '3. THCA Isolate (Diamonds) — potency',
          '4. THC Distillate — added last, stirred in',
        ],
      },
      {
        title: 'The Centrifuge Process',
        content:
          'The blended liquid is combined with flower and spun in a centrifuge at 10,000 RPM. This forces the concentrates deep into the plant material at a molecular level — true microstructure infusion.',
        keyPoints: [
          'Centrifuge spins at 10,000 RPM',
          'Forces concentrates INTO the flower',
          'Result: dense, pliable "puck" or "cake"',
          'Then heat is applied to release flavor volatiles',
        ],
      },
      {
        title: 'Why It Matters to the Customer',
        content:
          'The customer benefit is simple: flavor that lasts the full smoke, not just the first hit. No harsh "infused" edge. Smooth, consistent burn from start to finish. That is the pitch.',
        keyPoints: [
          'Flavor lasts the FULL smoke',
          'No harsh infused edge',
          'Smooth, consistent burn',
          'This is your key selling point',
        ],
      },
    ],
  },
  {
    id: 'triple-threat',
    title: 'Triple Threat Pre Roll',
    subtitle: '1.2G Triple Infused flagship pre-roll',
    duration: '8 min',
    level: 'Starting Lineup',
    icon: '🔥',
    color: '#ea580c',
    audioSummary: '',
    videoUrl: TRIPLE_THREAT_VIDEO_URL,
    slides: [
      {
        title: 'Welcome to Triple Threat',
        content:
          'Watch the training video above, then review the key takeaways below. Triple Threat is the flagship pre-roll — 1.2 grams of Triple Infused goodness, ready to spark. This is the product that showcases the full Triple Infusion process at its best.',
        keyPoints: [
          'Watch the full video above before continuing',
          '1.2 grams per pre-roll — 20% more than industry standard',
          'Full Triple Infusion: THCA Diamonds + Live Resin + HTE',
          'Built-in glass tip for unrestricted airflow',
          'Premium indoor whole flower only — no trim, shake, or filler',
        ],
      },
      {
        title: 'Who Is the Triple Threat Customer?',
        content:
          'Triple Threat is for the customer who wants the full Highsman experience in a single pre-roll. They already know they like pre-rolls, they want premium, and they are ready to pay for quality.',
        keyPoints: [
          'Experienced pre-roll smokers',
          'Customers who ask "what is your best?"',
          'Social smokers — great for sharing',
          'The "I want to try something special" buyer',
        ],
      },
      {
        title: 'Selling Triple Threat',
        content:
          'This is your lead product. When someone asks for a recommendation, Triple Threat is the answer. "This is our flagship — 1.2 grams of Triple Infused. Flavor lasts the full smoke." Let the product do the talking.',
        keyPoints: [
          'Lead recommendation for pre-roll shoppers',
          'Pitch: "Flavor lasts the full smoke, not just the first hit"',
          'Upsell from Hit Sticks: "Ready for the full experience?"',
          'Assumptive close: "Single or the two-pack?"',
        ],
      },
    ],
  },
  {
    id: 'ground-game',
    title: 'Ground Game',
    subtitle: '7G Ready To Roll Triple Infused Flower',
    duration: '8 min',
    level: 'Starting Lineup',
    icon: '🌿',
    color: '#16a34a',
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to Ground Game',
        content:
          'Ground Game is Highsman\'s premium flower product — 7 grams of Triple Infused flower for consumers who prefer to roll their own. It is the highest-value SKU in the lineup and a great entry point for daily consumers.',
        keyPoints: [
          '7 grams of Triple Infused flower',
          'Highest value SKU for roll-your-own consumers',
          'Premium quality at a compelling price point',
          'Great for daily consumers',
        ],
      },
      {
        title: 'Who Is the Ground Game Customer?',
        content:
          'Ground Game is for the roll-your-own crowd — daily consumers who go through flower and want the best. They value quantity and quality. This is the SKU with the highest repeat purchase rate.',
        keyPoints: [
          'Daily consumers who roll their own',
          'Value-conscious but quality-first',
          'Highest repeat purchase rate in the lineup',
          'Often buy alongside pre-rolls for variety',
        ],
      },
      {
        title: 'Selling Ground Game',
        content:
          'Position Ground Game as the smart buy for daily smokers. "Seven grams of Triple Infused flower — same process as our pre-rolls but you roll it your way." Emphasize the value and the quality.',
        keyPoints: [
          'Pitch: "Same Triple Infusion, you roll it your way"',
          'Emphasize 7G value for daily consumers',
          'Cross-sell with pre-rolls: "Grab a Hit Stick for on-the-go too"',
          'Assumptive close: "You rolling tonight?"',
        ],
      },
    ],
  },
  // ── Franchise Player ────────────────────────────────────────────────────
  {
    id: 'hit-sticks',
    title: 'Hit Sticks',
    subtitle: "0.5G Triple Infused It's Half Pre Roll, Half Chillum — the grab-and-go option",
    duration: '8 min',
    level: 'Franchise Player',
    icon: '⚡',
    color: '#dc2626',
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to Hit Sticks',
        content:
          'Hit Sticks are the grab-and-go option — 0.5 grams of Triple Infused pre-roll. Lower commitment, same premium quality. This course covers everything you need to know to sell Hit Sticks.',
        keyPoints: [
          '0.5 grams — compact and convenient',
          'Same Triple Infusion quality as every Highsman product',
          'Perfect trial product for first-time customers',
          'Lower price point, easy impulse buy',
        ],
      },
      {
        title: 'Who Is the Hit Sticks Customer?',
        content:
          'Hit Sticks are built for the quick-session smoker and the curious first-timer. Customers who want premium quality without a big commitment. This is the gateway to the Highsman lineup.',
        keyPoints: [
          'Quick-session smokers',
          'First-time Highsman customers',
          'Price-conscious buyers who still want premium',
          'Impulse purchase — perfect for countertop display',
        ],
      },
      {
        title: 'Selling Hit Sticks',
        content:
          'Position Hit Sticks as the entry point. "Want to try the best infused pre-roll in the game? Start with a Hit Stick." Once they try it, upsell to Triple Threat or Ground Game on the next visit.',
        keyPoints: [
          'Lead with: "Try the best infused pre-roll in the game"',
          'Use as a gateway to the full lineup',
          'Upsell path: Hit Stick → Triple Threat → Ground Game',
          'Assumptive close: "One or two?"',
        ],
      },
    ],
  },
  // ── Rushing Bonus (Survey) ──────────────────────────────────────────────
  {
    id: 'rushing-bonus',
    title: 'Rushing Bonus',
    subtitle: 'Tell us about yourself — earn your final 100 pts',
    duration: '3 min',
    level: 'Rookie',
    icon: '🏃',
    color: '#c8a84b',
    audioSummary: '',
    slides: [
      {
        title: 'Rushing Bonus Survey',
        content: 'Complete this quick survey to earn your Rushing Bonus points and help us get to know our budtender community better.',
        keyPoints: [
          'Takes about 2–3 minutes',
          'Required for Hall of Flame completion',
          '+100 pts upon submission',
        ],
      },
    ],
  },
];

// ── Rushing Bonus Survey Questions ──────────────────────────────────────────
const RUSHING_BONUS_QUESTIONS = [
  {id: 'sex', label: 'Gender', type: 'select' as const, options: ['Male', 'Female', 'Non-binary', 'Prefer not to say']},
  {id: 'age', label: 'Age Range', type: 'select' as const, options: ['18–24', '25–34', '35–44', '45–54', '55+']},
  {id: 'sports_fan', label: 'Are you a football or sports fan?', type: 'select' as const, options: ['Big time football fan', 'Sports fan (not football)', 'Casual fan', 'Not really into sports']},
  {id: 'astrology', label: 'Are you into astrology?', type: 'select' as const, options: ['Yes, love it', 'A little', 'Not really', 'Not at all']},
  {id: 'years_in_industry', label: 'Years in the cannabis industry', type: 'select' as const, options: ['Less than 1 year', '1–2 years', '3–5 years', '5+ years']},
  {id: 'rating_hit_sticks', label: 'Rate Hit Sticks (1–10)', type: 'rating' as const, options: []},
  {id: 'rating_triple_threat', label: 'Rate Triple Threat (1–10)', type: 'rating' as const, options: []},
  {id: 'rating_ground_game', label: 'Rate Ground Game (1–10)', type: 'rating' as const, options: []},
  {id: 'brand_feeling', label: 'How do you feel about the Highsman brand? (1–10)', type: 'rating' as const, options: []},
  {id: 'favorite_brand', label: 'Favorite cannabis brand (outside of Highsman)', type: 'text' as const, options: []},
  {id: 'favorite_form_factor', label: 'Favorite form factor', type: 'select' as const, options: ['Pre Rolls', 'Flower', 'Chillums', 'Gummies', 'Vapes', 'Dabs']},
];

// ── Quiz Data (Mini-assessment per course) ────────────────────────────────────
interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
}

const COURSE_QUIZZES: Record<string, QuizQuestion[]> = {
  // Meet Ricky — quiz coming once video is live
  // Meet Highsman — quiz coming once video is live
  'the-science': [
    {
      q: 'At what RPM does the centrifuge spin?',
      options: ['5,000 RPM', '10,000 RPM', '15,000 RPM', '20,000 RPM'],
      correct: 1,
    },
    {
      q: 'Which ingredient is added LAST to the Triple Infusion mixture?',
      options: ['Live Resin', 'THCA Isolate', 'Terpenes', 'THC Distillate'],
      correct: 3,
    },
    {
      q: 'What does the material look like after centrifuge?',
      options: ['Loose powder', 'A dense pliable puck', 'Oily liquid', 'Dry flakes'],
      correct: 1,
    },
    {
      q: 'What is the main customer benefit of Triple Infusion?',
      options: [
        'Higher THC percentage',
        'Flavor lasts the full smoke with no harsh infused edge',
        'Burns faster for a quick session',
        'More smoke per gram',
      ],
      correct: 1,
    },
    {
      q: 'What should you NEVER call the infusion process?',
      options: [
        'Triple Infused',
        'Microstructure infusion',
        'Coated or dipped',
        'Centrifuge processed',
      ],
      correct: 2,
    },
  ],
  'triple-threat': [
    {
      q: 'What is the specific weight of the Triple Threat pre-roll compared to the industry standard?',
      options: [
        '0.5 grams — half the standard size',
        '0.75 grams — the mini pre-roll format',
        '1.0 grams — matches the standard weight',
        '1.2 grams — 20% more than the standard 1.0g',
      ],
      correct: 3,
    },
    {
      q: 'Which three components make up the Triple Infusion process?',
      options: [
        'THCA Diamonds, CBN Isolate, and CBD Extract',
        'THCA Diamonds, Live Resin, and HTE (High Terpene Extract)',
        'Kief, Hash Oil, and Live Rosin',
        'Delta-8, Distillate, and Terpene Spray',
      ],
      correct: 1,
    },
    {
      q: 'How are the infusions integrated into the Triple Threat flower?',
      options: [
        'Applied to the outside using a spray coating method',
        'Centrifuge-forced into the microstructure of the flower',
        'Hand-rolled into the flower before curing',
        'Mixed with shake and trim before pressing',
      ],
      correct: 1,
    },
    {
      q: 'What is the primary benefit of the built-in glass tip?',
      options: [
        'It keeps the pre-roll from unraveling',
        'It makes the pre-roll look more premium on the shelf',
        'It filters out THC for a milder experience',
        'Unrestricted airflow and a cooler, smoother pull',
      ],
      correct: 3,
    },
    {
      q: 'What type of tip is built into the Triple Threat?',
      options: [
        'A rubber mouthpiece tip',
        'A bamboo fiber filter',
        'A built-in glass tip',
        'A standard paper crutch',
      ],
      correct: 2,
    },
    {
      q: 'What type of flower is used inside the Triple Threat?',
      options: [
        'Outdoor-grown shake and trim',
        'Premium indoor whole flower only — no trim, shake, or filler',
        'A proprietary blend of indoor and outdoor flower',
        'CBD hemp flower infused with THC concentrate',
      ],
      correct: 1,
    },
    {
      q: 'How does the Triple Threat achieve its smooth, hash-like burn?',
      options: [
        'By adding menthol compounds before rolling',
        'A 50% decarb process that locks flavor into the microstructure',
        'By curing significantly longer than standard methods',
        'By removing all terpenes before the infusion step',
      ],
      correct: 1,
    },
    {
      q: 'Where does the Triple Threat\'s natural flavor profile come from?',
      options: [
        'Added artificial flavoring in the wrap',
        'The paper used during the rolling process',
        'Terpenes forced into the microstructure alongside interior kief',
        'The strain\'s surface-level genetics alone',
      ],
      correct: 2,
    },
    {
      q: 'Why does the Triple Threat burn differently than a standard infused pre-roll?',
      options: [
        'It uses a slower-burning wrap',
        'The THC content is lower, producing less harsh smoke',
        'Concentrates are spun into the flower at high speed — not coated on the outside',
        'It contains CBD that counteracts harshness',
      ],
      correct: 2,
    },
    {
      q: 'How should a budtender open their Triple Threat pitch?',
      options: [
        '"Would you like to try our premium pre-roll today?"',
        '"This is our most popular product — flying off shelves."',
        '"1.2 grams of triple-infused flower — 20% more than standard at the same price."',
        '"This has THCA Diamonds, Live Resin, and HTE — want to hear about each?"',
      ],
      correct: 2,
    },
  ],
  // Hit Sticks — quiz coming once content is finalized
  // Ground Game — quiz coming once content is finalized
};

const LETTERS = ['A', 'B', 'C', 'D'];

// ── Events Data ───────────────────────────────────────────────────────────────
const EVENTS = [
  {
    title: 'NJ Launch Tour — Week 1',
    date: 'May 6–10, 2026',
    location: 'Northern NJ Dispensaries',
    description: 'Ricky Williams in-store appearances at Tier A accounts. First 50 budtenders to register get exclusive Highsman merch.',
    tag: 'UPCOMING',
  },
  {
    title: 'NJ Launch Tour — Week 2',
    date: 'May 13–17, 2026',
    location: 'Central & Southern NJ',
    description: 'Continued NJ rollout with in-store demos, sampling events, and budtender meet & greets.',
    tag: 'UPCOMING',
  },
  {
    title: 'Monthly Sales Competition — May',
    date: 'May 1–31, 2026',
    location: 'All States',
    description: 'Top-selling budtender wins a $500 cash prize + signed Ricky Williams jersey. Track your sales and submit weekly.',
    tag: 'COMPETITION',
  },
  {
    title: 'Budtender Appreciation Day',
    date: 'June 14, 2026',
    location: 'Virtual Event',
    description: 'Exclusive virtual hangout with Ricky Williams for certified Highsman budtenders. Q&A, prizes, and behind-the-scenes content.',
    tag: 'EXCLUSIVE',
  },
];

// ── Klaviyo ───────────────────────────────────────────────────────────────────
function subscribeToKlaviyo(name: string, email: string, state: string) {
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ');
  fetch(
    `https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_PUBLIC_KEY}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', revision: '2023-12-15'},
      body: JSON.stringify({
        data: {
          type: 'subscription',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email,
                  first_name: firstName,
                  last_name: lastName,
                  properties: {
                    budtender_state: state,
                    is_budtender: true,
                    budtender_education_signup: true,
                    marketing_consent: true,
                    consent_date: new Date().toISOString(),
                  },
                },
              },
            },
            list_id: BUDTENDER_LIST_ID,
          },
        },
      }),
    },
  ).catch(() => {});
}

// ── Main Component ────────────────────────────────────────────────────────────
type Screen = 'loading' | 'gate' | 'portal';
type GateMode = 'login' | 'register';

export default function BudtenderEducation() {
  // Hide site header & footer so this page feels like its own app
  useHideThemeChrome();
  useTekoFont();

  // Suppress Klaviyo popup
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

  const [screen, setScreen] = useState<Screen>('loading');
  const [gateMode, setGateMode] = useState<GateMode>('login');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Gate
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [dispensary, setDispensary] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [googleLoaded, setGoogleLoaded] = useState(false);

  // Portal
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [completedCourses, setCompletedCourses] = useState<Set<string>>(new Set());
  const [courseQuizActive, setCourseQuizActive] = useState<string | null>(null);
  const [quizQ, setQuizQ] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  const [registeredEvents, setRegisteredEvents] = useState<Set<number>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pointsToast, setPointsToast] = useState<{pts: number; msg: string} | null>(null);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [surveySubmitting, setSurveySubmitting] = useState(false);

  const portalRef = useRef<HTMLDivElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ── Auto-login: check localStorage on mount ─────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setUserName(session.name.split(' ')[0]);
      setUserEmail(session.email);
      setCompletedCourses(new Set(session.completedCourses || []));
      setScreen('portal');
    } else {
      setScreen('gate');
    }
  }, []);

  // ── Load Google Sign-In SDK ─────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'gate') return;
    loadGoogleScript().then(() => {
      setGoogleLoaded(true);
    });
  }, [screen]);

  // ── Initialize Google button when ref + SDK are ready ───────────────────
  useEffect(() => {
    if (!googleLoaded || !googleBtnRef.current) return;
    if (!GOOGLE_CLIENT_ID) return; // Skip if no client ID configured
    const w = window as any;
    if (!w.google?.accounts?.id) return;
    w.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLogin,
      auto_select: false,
    });
    w.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      width: googleBtnRef.current.offsetWidth,
      text: 'continue_with',
      shape: 'rectangular',
    });
  }, [googleLoaded, gateMode, screen]);

  // ── Persist completed courses whenever they change ──────────────────────
  useEffect(() => {
    if (screen !== 'portal') return;
    const session = loadSession();
    if (session) {
      saveSession({...session, completedCourses: [...completedCourses]});
    }
  }, [completedCourses, screen]);

  // ── Close user menu on outside click ────────────────────────────────────
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [userMenuOpen]);

  // ── Login with saved session (email only) ───────────────────────────────
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
      setLoginError('Enter a valid email address.');
      return;
    }
    // Check Klaviyo for this profile to verify they've registered before
    fetch(
      `https://a.klaviyo.com/client/profiles/?company_id=${KLAVIYO_PUBLIC_KEY}&filter=equals(email,"${encodeURIComponent(loginEmail.trim())}")&filter=equals(list,"${BUDTENDER_LIST_ID}")`,
      {headers: {'revision': '2023-12-15'}}
    ).then(() => {
      // Klaviyo client API doesn't support profile lookup by email directly,
      // so we trust the email and let them in — they already registered once.
      // If they haven't registered, they won't have course progress saved.
      const firstName = loginEmail.split('@')[0];
      saveSession({
        name: firstName,
        email: loginEmail.trim(),
        state: '',
        completedCourses: [],
      });
      setUserName(firstName);
      setUserEmail(loginEmail.trim());
      setScreen('portal');
    }).catch(() => {
      // Even on network error, let them in with email
      const firstName = loginEmail.split('@')[0];
      saveSession({
        name: firstName,
        email: loginEmail.trim(),
        state: '',
        completedCourses: [],
      });
      setUserName(firstName);
      setUserEmail(loginEmail.trim());
      setScreen('portal');
    });
  }

  // ── Google Sign-In callback ─────────────────────────────────────────────
  function handleGoogleLogin(response: any) {
    const payload = decodeJWT(response.credential);
    if (!payload) return;
    const googleEmail = payload.email || '';
    const googleName = payload.name || payload.given_name || googleEmail.split('@')[0];
    // Subscribe to Klaviyo (idempotent — won't duplicate)
    subscribeToKlaviyo(googleName, googleEmail, '');
    saveSession({
      name: googleName,
      email: googleEmail,
      state: '',
      completedCourses: [],
    });
    setUserName(googleName.split(' ')[0]);
    setUserEmail(googleEmail);
    setScreen('portal');
  }

  // ── Register (full form) ────────────────────────────────────────────────
  function handleGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = 'Enter a valid email.';
    if (!state) newErrors.state = 'Select your state.';
    if (!consent) newErrors.consent = 'You must agree to continue.';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    subscribeToKlaviyo(name.trim(), email.trim(), state);
    saveSession({
      name: name.trim(),
      email: email.trim(),
      state,
      dispensary: dispensary.trim() || undefined,
      completedCourses: [],
    });
    setUserName(name.split(' ')[0]);
    setUserEmail(email.trim());
    setScreen('portal');
  }

  // ── Logout ──────────────────────────────────────────────────────────────
  function handleLogout() {
    clearSession();
    setScreen('gate');
    setGateMode('login');
    setUserName('');
    setUserEmail('');
    setCompletedCourses(new Set());
    setActiveCourse(null);
    setCourseQuizActive(null);
    setLoginEmail('');
    setLoginError('');
  }

  function openCourse(id: string) {
    setActiveCourse(id);
    setSlideIndex(0);
    setCourseQuizActive(null);
    setQuizComplete(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function closeCourse() {
    setActiveCourse(null);
    setCourseQuizActive(null);
    setQuizComplete(false);
  }

  function nextSlide(course: Course) {
    if (slideIndex < course.slides.length - 1) {
      setSlideIndex(slideIndex + 1);
    }
  }

  function prevSlide() {
    if (slideIndex > 0) {
      setSlideIndex(slideIndex - 1);
    }
  }

  function startCourseQuiz(courseId: string) {
    setCourseQuizActive(courseId);
    setQuizQ(0);
    setQuizAnswered(false);
    setQuizSelected(null);
    setQuizScore(0);
    setQuizComplete(false);
  }

  function selectQuizAnswer(idx: number) {
    if (quizAnswered || !courseQuizActive) return;
    setQuizSelected(idx);
    setQuizAnswered(true);
    const questions = COURSE_QUIZZES[courseQuizActive];
    if (idx === questions[quizQ].correct) {
      setQuizScore(quizScore + 1);
    }
  }

  function nextQuizQ() {
    if (!courseQuizActive) return;
    const questions = COURSE_QUIZZES[courseQuizActive];
    if (quizQ < questions.length - 1) {
      setQuizQ(quizQ + 1);
      setQuizAnswered(false);
      setQuizSelected(null);
    } else {
      setQuizComplete(true);
      const passed = (quizScore + (quizSelected === questions[quizQ].correct ? 1 : 0)) >= Math.ceil(questions.length * 0.66);
      if (passed) {
        const newCompleted = new Set([...completedCourses, courseQuizActive]);
        setCompletedCourses(newCompleted);
        // Points toast
        const coursePts = getCoursePoints(courseQuizActive);
        const isAllDone = newCompleted.size >= COURSES.length;
        const earnedPts = coursePts + (isAllDone ? POINTS_ALL_COMPLETE_BONUS : 0);
        const bonusMsg = isAllDone ? ` + ${POINTS_ALL_COMPLETE_BONUS.toLocaleString()} completion bonus!` : '';
        setPointsToast({pts: earnedPts, msg: `+${coursePts} pts earned${bonusMsg}`});
        setTimeout(() => setPointsToast(null), 4000);
      }
    }
  }

  function registerEvent(idx: number) {
    setRegisteredEvents(new Set([...registeredEvents, idx]));
  }

  // ── Rushing Bonus Survey Submit ──────────────────────────────────────────
  function handleSurveySubmit() {
    // Check all required fields
    const missing = RUSHING_BONUS_QUESTIONS.filter(q => !surveyAnswers[q.id] || surveyAnswers[q.id].trim() === '');
    if (missing.length > 0) return;
    setSurveySubmitting(true);
    // Submit survey data to Klaviyo as profile properties
    fetch(`https://a.klaviyo.com/api/v2/people/search?email=${encodeURIComponent(userEmail)}&api_key=${KLAVIYO_PUBLIC_KEY}`)
      .then(r => r.json())
      .then(data => {
        if (data?.id) {
          return fetch(`https://a.klaviyo.com/api/v1/person/${data.id}?api_key=${KLAVIYO_PUBLIC_KEY}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              $survey_gender: surveyAnswers.sex,
              $survey_age: surveyAnswers.age,
              $survey_sports_fan: surveyAnswers.sports_fan,
              $survey_astrology: surveyAnswers.astrology,
              $survey_years_industry: surveyAnswers.years_in_industry,
              $survey_rating_hit_sticks: surveyAnswers.rating_hit_sticks,
              $survey_rating_triple_threat: surveyAnswers.rating_triple_threat,
              $survey_rating_ground_game: surveyAnswers.rating_ground_game,
              $survey_brand_feeling: surveyAnswers.brand_feeling,
              $survey_favorite_brand: surveyAnswers.favorite_brand,
              $survey_favorite_form_factor: surveyAnswers.favorite_form_factor,
            }),
          });
        }
      })
      .catch(() => {}) // Silent fail — still award points
      .finally(() => {
        setSurveySubmitting(false);
        const newCompleted = new Set([...completedCourses, 'rushing-bonus']);
        setCompletedCourses(newCompleted);
        setActiveCourse(null);
        // Points toast
        const coursePts = getCoursePoints('rushing-bonus');
        const isAllDone = newCompleted.size >= COURSES.length;
        const earnedPts = coursePts + (isAllDone ? POINTS_ALL_COMPLETE_BONUS : 0);
        const bonusMsg = isAllDone ? ` + ${POINTS_ALL_COMPLETE_BONUS.toLocaleString()} Hall of Flame bonus!` : '';
        setPointsToast({pts: earnedPts, msg: `+${coursePts} pts earned${bonusMsg}`});
        setTimeout(() => setPointsToast(null), 4000);
      });
  }

  // ── LOADING SCREEN ──────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#A9ACAF]/30 border-t-[#c8a84b] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#A9ACAF] text-xs uppercase tracking-wider">Loading...</p>
        </div>
      </div>
    );
  }

  // ── GATE SCREEN ─────────────────────────────────────────────────────────────
  if (screen === 'gate') {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Budtender Education Portal
            </h1>
            <div className="w-12 h-0.5 bg-[#c8a84b] mx-auto mt-3 mb-4" />
            <p className="text-[#A9ACAF] text-sm leading-relaxed">
              Exclusive training courses, product knowledge, and sales tools
              for authorized Highsman budtenders.
            </p>
          </div>

          {/* Login / Register Toggle */}
          <div className="flex mb-5 bg-[#111111] rounded-lg p-1">
            <button
              onClick={() => { setGateMode('login'); setErrors({}); setLoginError(''); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all ${
                gateMode === 'login'
                  ? 'bg-white text-black'
                  : 'text-[#A9ACAF] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setGateMode('register'); setErrors({}); setLoginError(''); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all ${
                gateMode === 'register'
                  ? 'bg-white text-black'
                  : 'text-[#A9ACAF] hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {gateMode === 'login' ? (
            /* ── LOGIN FORM (email only) ─────────────────────────────────── */
            <div className="bg-[#111111] border border-[#A9ACAF]/20 rounded-xl p-6 md:p-8 shadow-2xl">
              <div className="text-center mb-5">
                <h2 className="text-lg font-bold text-white mb-1">Welcome Back</h2>
                <p className="text-[#A9ACAF] text-xs">Sign in with your email to continue training</p>
              </div>

              {/* Google Sign-In Button */}
              {GOOGLE_CLIENT_ID ? (
                <div ref={googleBtnRef} className="mb-4 w-full" />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Fallback Google button — opens Google OAuth popup when client ID is configured
                    // For now, show a styled button that hints at Google login
                    if (!(window as any).google?.accounts?.id) {
                      alert('Google Sign-In will be available soon. Please use email login for now.');
                      return;
                    }
                    (window as any).google.accounts.id.prompt();
                  }}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-[#A9ACAF]/15 rounded-lg text-sm text-white font-medium hover:bg-[#1a1a1a] transition-colors mb-4"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Continue with Google
                </button>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[#c8a84b]/10" />
                <span className="text-[10px] uppercase tracking-wider text-[#888888]">or</span>
                <div className="flex-1 h-px bg-[#c8a84b]/10" />
              </div>

              <form onSubmit={handleLogin}>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }}
                    placeholder="you@dispensary.com"
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                      loginError ? 'border-red-400 bg-red-50' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                    }`}
                  />
                  {loginError && <p className="text-red-500 text-xs mt-1">{loginError}</p>}
                </div>

                <button
                  type="submit"
                  className="w-full mt-5 py-3 bg-[#FFEB3B] text-black font-semibold text-sm rounded-lg hover:bg-[#ffd700] transition-colors"
                >
                  SIGN IN
                </button>
              </form>

              <p className="text-center text-[#888888] text-xs mt-4">
                New here?{' '}
                <button onClick={() => setGateMode('register')} className="text-white font-semibold hover:underline">
                  Create an account
                </button>
              </p>
            </div>
          ) : (
            /* ── REGISTER FORM (full form) ───────────────────────────────── */
            <div className="bg-[#111111] border border-[#A9ACAF]/20 rounded-xl p-6 md:p-8 shadow-2xl">
              <div className="text-center mb-5">
                <h2 className="text-lg font-bold text-white mb-1">Create Your Account</h2>
                <p className="text-[#A9ACAF] text-xs">Register once, then sign in instantly next time</p>
              </div>

              {/* Google Sign-In for Registration */}
              {!GOOGLE_CLIENT_ID && (
                <button
                  type="button"
                  onClick={() => {
                    if (!(window as any).google?.accounts?.id) {
                      alert('Google Sign-In will be available soon. Please register with email for now.');
                      return;
                    }
                    (window as any).google.accounts.id.prompt();
                  }}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-[#A9ACAF]/15 rounded-lg text-sm text-white font-medium hover:bg-[#1a1a1a] transition-colors mb-4"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Sign up with Google
                </button>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[#c8a84b]/10" />
                <span className="text-[10px] uppercase tracking-wider text-[#888888]">or register with email</span>
                <div className="flex-1 h-px bg-[#c8a84b]/10" />
              </div>

              <form onSubmit={handleGateSubmit}>
                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                        errors.name ? 'border-red-400 bg-red-50' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@dispensary.com"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                        errors.email ? 'border-red-400 bg-red-50' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>

                  {/* State */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                      State
                    </label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors ${
                        errors.state ? 'border-red-400 bg-red-50' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    >
                      <option value="">Select state</option>
                      <option value="NJ">New Jersey</option>
                      <option value="NY">New York</option>
                      <option value="MA">Massachusetts</option>
                      <option value="RI">Rhode Island</option>
                      <option value="MO">Missouri</option>
                    </select>
                    {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
                  </div>

                  {/* Dispensary */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                      Dispensary Name <span className="text-[#A9ACAF] font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={dispensary}
                      onChange={(e) => setDispensary(e.target.value)}
                      placeholder="Where do you work?"
                      className="w-full px-3 py-2.5 border border-[#A9ACAF]/30 rounded-lg text-sm text-black outline-none transition-colors focus:border-[#A9ACAF]"
                    />
                  </div>

                  {/* Consent */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      errors.consent ? 'border-red-400 bg-red-50' : 'border-[#eee] hover:bg-[#fafafa]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#c8a84b]"
                    />
                    <span className="text-xs text-[#A9ACAF] leading-relaxed">
                      I agree to receive training updates and exclusive budtender offers from Highsman via email.
                    </span>
                  </label>
                  {errors.consent && <p className="text-red-500 text-xs mt-0.5 ml-1">{errors.consent}</p>}
                </div>

                <button
                  type="submit"
                  className="w-full mt-6 py-3 bg-[#FFEB3B] text-black font-semibold text-sm rounded-lg hover:bg-[#ffd700] transition-colors"
                >
                  CREATE ACCOUNT
                </button>
              </form>

              <p className="text-center text-[#888888] text-xs mt-4">
                Already registered?{' '}
                <button onClick={() => setGateMode('login')} className="text-white font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            </div>
          )}

          <p className="text-center text-[#666666] text-[10px] mt-6">
            © Highsman · For authorized budtender use only
          </p>
        </div>
      </div>
    );
  }

  // ── PORTAL SCREEN ───────────────────────────────────────────────────────────
  const currentCourse = COURSES.find((c) => c.id === activeCourse);

  return (
    <div ref={portalRef} className="min-h-screen bg-[#000000]">
      {/* ── Sub-Header (thin progress bar below global nav) ────────────── */}
      <div className="bg-[#081510] border-b border-[#A9ACAF]/15">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs font-semibold text-[#A9ACAF] tracking-wide">Budtender Education</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#A9ACAF]">{completedCourses.size}/{COURSES.length}</span>
            <div className="w-16 sm:w-20 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#c8a84b] rounded-full transition-all duration-500"
                style={{width: `${(completedCourses.size / COURSES.length) * 100}%`}}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Rushing Bonus Survey (special view) ──────────────────────────── */}
      {activeCourse === 'rushing-bonus' && !courseQuizActive ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={closeCourse}
            className="text-[#A9ACAF] text-xs sm:text-sm hover:text-white transition-colors mb-5 sm:mb-6 flex items-center gap-2"
          >
            ← Back to courses
          </button>

          <div className="text-center mb-8">
            <span className="text-4xl mb-3 block">🏃</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{fontFamily: 'Teko, sans-serif', fontWeight: 700}}>RUSHING BONUS</h2>
            <p className="text-[#A9ACAF] text-sm sm:text-base">Tell us about yourself to earn your final <span className="text-[#c8a84b] font-bold">100 pts</span> and complete Training Camp.</p>
          </div>

          <div className="space-y-5">
            {RUSHING_BONUS_QUESTIONS.map((q) => (
              <div key={q.id} className="bg-[#111111] border border-[#A9ACAF]/15 rounded-xl p-4 sm:p-5">
                <label className="block text-sm font-semibold text-white mb-2">{q.label}</label>
                {q.type === 'select' ? (
                  <select
                    value={surveyAnswers[q.id] || ''}
                    onChange={(e) => setSurveyAnswers({...surveyAnswers, [q.id]: e.target.value})}
                    className="w-full px-3 py-2.5 bg-[#000000] border border-[#A9ACAF]/20 rounded-lg text-sm text-white outline-none focus:border-[#A9ACAF] transition-colors"
                  >
                    <option value="">Select...</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : q.type === 'rating' ? (
                  <div className="flex gap-2 flex-wrap">
                    {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSurveyAnswers({...surveyAnswers, [q.id]: String(n)})}
                        className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                          surveyAnswers[q.id] === String(n)
                            ? 'bg-[#c8a84b] text-black'
                            : 'bg-[#111111] border border-[#A9ACAF]/20 text-white hover:border-[#A9ACAF]/50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={surveyAnswers[q.id] || ''}
                    onChange={(e) => setSurveyAnswers({...surveyAnswers, [q.id]: e.target.value})}
                    placeholder="Type your answer..."
                    className="w-full px-3 py-2.5 bg-[#000000] border border-[#A9ACAF]/20 rounded-lg text-sm text-white outline-none focus:border-[#A9ACAF] transition-colors placeholder:text-[#666666]"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={handleSurveySubmit}
              disabled={surveySubmitting || RUSHING_BONUS_QUESTIONS.some(q => !surveyAnswers[q.id] || surveyAnswers[q.id].trim() === '')}
              className="px-8 py-3 bg-[#FFEB3B] text-black font-bold text-sm rounded-xl hover:bg-[#ffd700] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{fontFamily: 'Teko, sans-serif', fontSize: '1.25rem', letterSpacing: '0.05em'}}
            >
              {surveySubmitting ? 'Submitting...' : 'SUBMIT & EARN 100 PTS 🏃'}
            </button>
          </div>
        </div>
      ) : currentCourse && !courseQuizActive ? (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Back button */}
          <button
            onClick={closeCourse}
            className="text-[#A9ACAF] text-xs sm:text-sm hover:text-white transition-colors mb-5 sm:mb-6 flex items-center gap-2"
          >
            ← Back to courses
          </button>

          {/* Course header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <span className="text-xl sm:text-2xl">{currentCourse.icon}</span>
              <span
                className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
                style={{color: currentCourse.color, background: currentCourse.color + '15'}}
              >
                {currentCourse.level}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">{currentCourse.title}</h2>
            <p className="text-[#A9ACAF] text-xs sm:text-sm mt-1">{currentCourse.subtitle}</p>
          </div>

          {/* ── Video Player (if course has video) ─────────────────────────── */}
          {currentCourse.videoUrl && (
            <div className="mb-6 sm:mb-8">
              <div className="bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl overflow-hidden">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full aspect-video bg-black"
                  poster=""
                >
                  <source src={currentCourse.videoUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="flex items-center gap-2 mt-3 px-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{background: currentCourse.color}}
                />
                <span className="text-[10px] sm:text-xs text-[#A9ACAF]">
                  Watch the full video, then scroll down for key takeaways
                </span>
              </div>
            </div>
          )}

          {/* Slide progress */}
          <div className="flex gap-1 mb-5 sm:mb-6">
            {currentCourse.slides.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full flex-1 transition-all duration-300"
                style={{
                  background: i <= slideIndex ? currentCourse.color : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>

          {/* Slide content */}
          <div className="bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-10 mb-5 sm:mb-6">
            <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#A9ACAF] mb-2">
              {currentCourse.videoUrl ? 'Key Takeaway' : 'Slide'} {slideIndex + 1} of {currentCourse.slides.length}
            </div>
            <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-3 sm:mb-4">
              {currentCourse.slides[slideIndex].title}
            </h3>
            <p className="text-[#888888] text-sm sm:text-base leading-relaxed mb-5 sm:mb-6">
              {currentCourse.slides[slideIndex].content}
            </p>
            {currentCourse.slides[slideIndex].keyPoints && (
              <div className="bg-[#111111] rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#c8a84b] font-bold mb-2 sm:mb-3">
                  Key Takeaways
                </div>
                {currentCourse.slides[slideIndex].keyPoints!.map((point, i) => (
                  <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                    <span className="text-[#c8a84b] mt-0.5 text-xs sm:text-sm">▸</span>
                    <span className="text-[#B0BDB0] text-xs sm:text-sm leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Slide navigation */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={prevSlide}
              disabled={slideIndex === 0}
              className="px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg border border-[#A9ACAF]/20 text-white hover:bg-[#111111] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            {slideIndex < currentCourse.slides.length - 1 ? (
              <button
                onClick={() => nextSlide(currentCourse)}
                className="px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg text-white transition-colors"
                style={{background: currentCourse.color}}
              >
                Next →
              </button>
            ) : COURSE_QUIZZES[currentCourse.id] ? (
              <button
                onClick={() => startCourseQuiz(currentCourse.id)}
                className="px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-lg text-white transition-colors animate-pulse"
                style={{background: currentCourse.color}}
              >
                Take Quiz →
              </button>
            ) : (
              <button
                onClick={() => {
                  const newCompleted = new Set([...completedCourses, currentCourse.id]);
                  setCompletedCourses(newCompleted);
                  setActiveCourse(null);
                  setSlideIndex(0);
                  // Points toast
                  const coursePts = getCoursePoints(currentCourse.id);
                  const isAllDone = newCompleted.size >= COURSES.length;
                  const earnedPts = coursePts + (isAllDone ? POINTS_ALL_COMPLETE_BONUS : 0);
                  const bonusMsg = isAllDone ? ` + ${POINTS_ALL_COMPLETE_BONUS.toLocaleString()} completion bonus!` : '';
                  setPointsToast({pts: earnedPts, msg: `+${coursePts} pts earned${bonusMsg}`});
                  setTimeout(() => setPointsToast(null), 4000);
                }}
                className="px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-lg text-white transition-colors"
                style={{background: currentCourse.color}}
              >
                Complete Course ✓
              </button>
            )}
          </div>

          {/* Audio summary */}
          <div className="mt-8 bg-[#111111] border border-[#A9ACAF]/15 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                style={{background: currentCourse.color + '30'}}
              >
                🎧
              </div>
              <div className="flex-1">
                <div className="text-white text-sm font-semibold">Audio Overview</div>
                <div className="text-[#A9ACAF] text-xs">Listen to a summary of this course</div>
              </div>
              <div className="text-[#A9ACAF] text-xs px-3 py-1 bg-[#111111] rounded-full">
                Coming Soon
              </div>
            </div>
          </div>
        </div>
      ) : courseQuizActive ? (
        /* ── Course Quiz View ──────────────────────────────────────────────── */
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={() => { setCourseQuizActive(null); setQuizComplete(false); }}
            className="text-[#A9ACAF] text-xs sm:text-sm hover:text-white transition-colors mb-5 sm:mb-6 flex items-center gap-2"
          >
            ← Back to course
          </button>

          {!quizComplete ? (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">
                {COURSES.find((c) => c.id === courseQuizActive)?.title} — Quiz
              </h2>
              <div className="text-[#A9ACAF] text-sm mb-6">
                Question {quizQ + 1} of {COURSE_QUIZZES[courseQuizActive].length}
              </div>

              {/* Progress */}
              <div className="w-full h-1 bg-[#1a1a1a] rounded-full mb-8">
                <div
                  className="h-full bg-[#c8a84b] rounded-full transition-all duration-500"
                  style={{width: `${((quizQ + 1) / COURSE_QUIZZES[courseQuizActive].length) * 100}%`}}
                />
              </div>

              {/* Question */}
              <div className="bg-[#111111] border border-[#A9ACAF]/15 rounded-2xl p-6 md:p-8">
                <p className="text-white font-semibold mb-6">{COURSE_QUIZZES[courseQuizActive][quizQ].q}</p>
                <div className="space-y-3">
                  {COURSE_QUIZZES[courseQuizActive][quizQ].options.map((opt, i) => {
                    const isCorrect = i === COURSE_QUIZZES[courseQuizActive][quizQ].correct;
                    const isSelected = quizSelected === i;
                    let btnClass = 'border-[#A9ACAF]/25 text-[#A9ACAF] hover:bg-[#111111]';
                    if (quizAnswered) {
                      if (isCorrect) btnClass = 'border-emerald-500 bg-emerald-500/10 text-emerald-400';
                      else if (isSelected) btnClass = 'border-red-500 bg-red-500/10 text-red-400';
                      else btnClass = 'border-[#A9ACAF]/15 text-[#A9ACAF]';
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => selectQuizAnswer(i)}
                        disabled={quizAnswered}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center gap-3 disabled:cursor-default ${btnClass}`}
                      >
                        <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                          {LETTERS[i]}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {quizAnswered && (
                <div className="flex justify-end mt-6">
                  <button
                    onClick={nextQuizQ}
                    className="px-6 py-2.5 bg-[#c8a84b] text-black font-bold text-sm rounded-lg hover:bg-[#d4b65c] transition-colors"
                  >
                    {quizQ < COURSE_QUIZZES[courseQuizActive].length - 1 ? 'Next Question →' : 'See Results →'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Quiz Results */
            <div className="text-center">
              <div className="bg-[#111111] border border-[#A9ACAF]/15 rounded-2xl p-8 md:p-12">
                <div className="w-24 h-24 rounded-full border-4 border-[#c8a84b] flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-2xl font-bold">
                    {quizScore}/{COURSE_QUIZZES[courseQuizActive].length}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {quizScore >= Math.ceil(COURSE_QUIZZES[courseQuizActive].length * 0.66)
                    ? 'Course Complete! ✓'
                    : 'Keep Studying'}
                </h3>
                <p className="text-[#A9ACAF] text-sm mb-6">
                  {quizScore >= Math.ceil(COURSE_QUIZZES[courseQuizActive].length * 0.66)
                    ? `Nice work, ${userName}! You\'ve earned your badge for this course.`
                    : `Review the slides and try again, ${userName}. You need 66% to pass.`}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => startCourseQuiz(courseQuizActive)}
                    className="px-5 py-2.5 text-sm border border-[#A9ACAF]/25 text-white rounded-lg hover:bg-[#111111] transition-colors"
                  >
                    Retake Quiz
                  </button>
                  <button
                    onClick={closeCourse}
                    className="px-5 py-2.5 text-sm bg-[#c8a84b] text-black font-bold rounded-lg hover:bg-[#d4b65c] transition-colors"
                  >
                    Back to Courses
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Main Portal View ──────────────────────────────────────────────── */
        <div>
          {/* ── Hero Banner ──────────────────────────────────────────────── */}
          <div className="w-full">
            <img
              src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Training_Camp_Hero_Banner.png?v=1775339073"
              alt="Highsman Budtender Training Camp"
              className="w-full h-auto block"
            />
          </div>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#c8a84b]/8 via-transparent to-[#c8a84b]/3" />
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#c8a84b]/5 to-transparent hidden md:block" />
            <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-4 pb-6 sm:pt-6 sm:pb-8 md:pt-8 md:pb-10 relative">

              {/* ── Account button (top right) ──────────────────────── */}
              <div className="flex justify-between items-start mb-6 sm:mb-8">
                <div className="text-xs sm:text-sm uppercase tracking-[0.2em] text-[#c8a84b] font-semibold" style={{fontFamily: 'Teko, sans-serif', fontSize: '0.95rem', letterSpacing: '0.25em'}}>
                  Welcome back, {userName}
                </div>
                  {/* Account dropdown */}
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#A9ACAF]/20 bg-[#111111] hover:bg-[#1a1a1a] hover:border-[#A9ACAF]/30 transition-all cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#c8a84b] flex items-center justify-center text-black font-bold shrink-0" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.1rem'}}>
                        {userName ? userName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <svg className="w-3.5 h-3.5 text-[#A9ACAF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-[#A9ACAF]/15 rounded-2xl shadow-2xl overflow-hidden z-50">
                        <div className="px-5 py-4 border-b border-[#A9ACAF]/15">
                          <div className="text-base font-semibold text-white" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.25rem'}}>{userName}</div>
                          {userEmail && (
                            <div className="text-xs text-[#A9ACAF] mt-0.5 truncate">{userEmail}</div>
                          )}
                        </div>
                        <div className="px-5 py-4 border-b border-[#A9ACAF]/15">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs uppercase tracking-wider text-[#A9ACAF]" style={{fontFamily: 'Teko, sans-serif'}}>Progress</span>
                            <span className="text-xs text-[#A9ACAF]">{completedCourses.size}/{COURSES.length}</span>
                          </div>
                          <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden mb-3">
                            <div
                              className="h-full bg-[#c8a84b] rounded-full transition-all"
                              style={{width: `${(completedCourses.size / COURSES.length) * 100}%`}}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider text-[#A9ACAF]" style={{fontFamily: 'Teko, sans-serif'}}>Rewards</span>
                            <span className="text-sm font-bold text-[#c8a84b]" style={{fontFamily: 'Teko, sans-serif', fontSize: '1rem'}}>
                              {calculatePoints(completedCourses, COURSES.length).toLocaleString()} pts · ${pointsToDollars(calculatePoints(completedCourses, COURSES.length))}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-5 py-3.5 text-sm text-[#A9ACAF] hover:text-white hover:bg-[#111111] transition-colors"
                        >
                          Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              {/* ── Main heading ────────────────────────────────────── */}
              <h1 className="mb-4 text-center" style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, lineHeight: 0.95}}>
                <span className="block text-white" style={{fontSize: 'clamp(2.4rem, 7vw, 4.5rem)'}}>WELCOME TO HIGHSMAN</span>
                <span className="block text-white" style={{fontSize: 'clamp(3.2rem, 9vw, 5.5rem)'}}>BUDTENDER TRAINING CAMP</span>
              </h1>
              <p className="text-[#A9ACAF] text-base sm:text-lg md:text-xl leading-relaxed mb-8 max-w-2xl mx-auto text-center">
                Work your way from <span className="text-white font-semibold">Unsigned</span> to the <span className="text-white font-semibold">Hall of Flame</span>, earning credits with every module you complete. Finish the full program and walk away with <span className="text-[#c8a84b] font-bold">$50 in store credit</span> at the Highsman Budtender Store.
              </p>

              {/* ── Progression Tracker ─────────────────────────────── */}
              {(() => {
                const rookieDone = completedCourses.has('meet-ricky') && completedCourses.has('meet-highsman');
                const startingDone = completedCourses.has('the-science') && completedCourses.has('triple-threat') && completedCourses.has('ground-game');
                const franchiseDone = completedCourses.has('hit-sticks');
                const hallOfFlameDone = completedCourses.size >= COURSES.length;
                const tiers = [
                  {
                    label: 'UNSIGNED',
                    img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Unsigned_Image.svg?v=1775343989',
                    unlocked: true,
                  },
                  {
                    label: 'ROOKIE',
                    img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Rookie.svg?v=1775343989',
                    unlocked: rookieDone,
                  },
                  {
                    label: 'STARTING LINEUP',
                    img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Starting_Lineup.svg?v=1775343990',
                    unlocked: startingDone,
                  },
                  {
                    label: 'FRANCHISE PLAYER',
                    img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Franchise_Player.svg?v=1775343989',
                    unlocked: franchiseDone,
                  },
                  {
                    label: 'HALL OF FLAME',
                    img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Hall_of_Flame.svg?v=1775343989',
                    unlocked: hallOfFlameDone,
                  },
                ];
                return (
                  <div className="mb-8">
                    <div className="grid grid-cols-5 gap-1 sm:gap-2 md:gap-3">
                      {tiers.map((tier, i) => (
                        <div key={i} className="relative group">
                          <div
                            className="relative overflow-hidden rounded-lg sm:rounded-xl transition-all duration-700"
                            style={{
                              filter: tier.unlocked ? 'none' : 'grayscale(100%)',
                              opacity: tier.unlocked ? 1 : 0.3,
                            }}
                          >
                            <img
                              src={tier.img}
                              alt={tier.label}
                              className="w-full h-auto block"
                            />
                            {tier.unlocked && (
                              <div className="absolute inset-0 rounded-lg sm:rounded-xl" style={{boxShadow: 'inset 0 0 20px rgba(200,168,75,0.15)'}} />
                            )}
                            {i === 4 && hallOfFlameDone && (
                              <div className="absolute inset-x-0 bottom-[18%] sm:bottom-[20%] flex items-center justify-center pointer-events-none">
                                <span
                                  className="text-[#c8a84b] text-center uppercase leading-none"
                                  style={{
                                    fontFamily: 'Teko, sans-serif',
                                    fontWeight: 700,
                                    fontSize: 'clamp(0.45rem, 1.8vw, 1rem)',
                                    letterSpacing: '0.05em',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                  }}
                                >
                                  {userName}
                                </span>
                              </div>
                            )}
                          </div>
                          <div
                            className={`text-center mt-1 sm:mt-2 uppercase tracking-wider ${tier.unlocked ? 'text-white' : 'text-[#444]'}`}
                            style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(0.5rem, 1.5vw, 0.8rem)', fontWeight: tier.unlocked ? 600 : 400}}
                          >
                            {tier.label}
                            {tier.unlocked && i > 0 && <span className="ml-1 text-[#c8a84b]">✓</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 sm:mt-3 mx-[10%] h-[2px] bg-[#222] rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${(() => {
                            if (hallOfFlameDone) return 100;
                            if (franchiseDone) return 80;
                            if (startingDone) return 60;
                            if (rookieDone) return 40;
                            return 10;
                          })()}%`,
                          background: 'linear-gradient(90deg, #c8a84b, #e0c66a)',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* ── Points Hero Card ────────────────────────────────── */}
              {(() => {
                const pts = calculatePoints(completedCourses, COURSES.length);
                const dollars = pointsToDollars(pts);
                const allDone = completedCourses.size === COURSES.length;
                // Find next uncompleted course
                const nextCourse = COURSES.find(c => !completedCourses.has(c.id));
                const nextCoursePts = nextCourse ? getCoursePoints(nextCourse.id) : 0;
                const bonusAvailable = !allDone && completedCourses.size === COURSES.length - 1;
                return (
                  <div className="mb-8 rounded-2xl sm:rounded-3xl overflow-hidden" style={{background: 'linear-gradient(135deg, rgba(200,168,75,0.12) 0%, rgba(15,36,23,0.8) 100%)'}}>
                    <div className="border border-[#A9ACAF]/20 rounded-2xl sm:rounded-3xl p-6 sm:p-8">
                      {/* Top row: pts + dollars */}
                      <div className="flex items-end justify-between gap-4 mb-5">
                        <div>
                          <div className="uppercase tracking-[0.2em] text-[#c8a84b] mb-1" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', fontWeight: 500}}>Your Rewards</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-white" style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, fontSize: 'clamp(3rem, 10vw, 4.5rem)', lineHeight: 1}}>{pts.toLocaleString()}</span>
                            <span className="uppercase tracking-wider text-[#A9ACAF]" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(1rem, 3vw, 1.5rem)', fontWeight: 400}}>PTS</span>
                          </div>
                          <div className="text-[#c8a84b] mt-1" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(1.2rem, 4vw, 1.75rem)', fontWeight: 600}}>${dollars} store credit</div>
                        </div>
                        <div className="text-right shrink-0 hidden sm:block">
                          <div className="uppercase tracking-wider text-[#666666]" style={{fontFamily: 'Teko, sans-serif', fontSize: '0.75rem'}}>Max Possible</div>
                          <div className="text-[#4A5A4A]" style={{fontFamily: 'Teko, sans-serif', fontSize: '2rem', fontWeight: 700, lineHeight: 1}}>{MAX_POINTS.toLocaleString()}</div>
                          <div className="text-[#4A5A4A]" style={{fontFamily: 'Teko, sans-serif', fontSize: '0.875rem'}}>${pointsToDollars(MAX_POINTS)}</div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full h-3 sm:h-4 bg-[#1a1a1a] rounded-full overflow-hidden mb-4">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max((pts / MAX_POINTS) * 100, 2)}%`,
                            background: 'linear-gradient(90deg, #c8a84b, #e0c66a, #c8a84b)',
                            boxShadow: '0 0 12px rgba(200,168,75,0.4)',
                          }}
                        />
                      </div>
                      {/* Next reward hint */}
                      <div className="text-[#A9ACAF]" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', fontWeight: 400}}>
                        {allDone ? (
                          <span className="text-emerald-400" style={{fontWeight: 600}}>HALL OF FLAME — ALL COURSES COMPLETE — MAXIMUM REWARDS UNLOCKED 🏆</span>
                        ) : bonusAvailable ? (
                          <span>Finish the last course for <span className="text-[#c8a84b]" style={{fontWeight: 600}}>+{nextCoursePts} pts</span> plus a <span className="text-[#c8a84b]" style={{fontWeight: 600}}>1,000 pt completion bonus!</span></span>
                        ) : (
                          <span>Complete the next course for <span className="text-[#c8a84b]" style={{fontWeight: 600}}>+{nextCoursePts} pts</span> — {COURSES.length - completedCourses.size} courses left</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── How It Works row ─────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {[
                  {icon: '🎉', label: 'SIGN UP', value: `+${POINTS_SIGNUP}`, sub: 'pts'},
                  {icon: '📚', label: 'COURSES', value: '+200–1K', sub: 'pts each'},
                  {icon: '🏃', label: 'RUSHING BONUS', value: '+100', sub: 'survey'},
                  {icon: '🏆', label: 'HALL OF FLAME', value: `+${POINTS_ALL_COMPLETE_BONUS.toLocaleString()}`, sub: 'bonus'},
                ].map((item, i) => (
                  <div key={i} className="bg-[#111111]/80 border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-center hover:border-[#A9ACAF]/20 transition-colors">
                    <div className="text-2xl sm:text-3xl mb-2">{item.icon}</div>
                    <div className="text-[#c8a84b]" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, lineHeight: 1}}>{item.value}</div>
                    <div className="text-[#A9ACAF] uppercase tracking-wider" style={{fontFamily: 'Teko, sans-serif', fontSize: '0.7rem', fontWeight: 500}}>{item.sub}</div>
                    <div className="text-[#666666] mt-1 uppercase tracking-wider" style={{fontFamily: 'Teko, sans-serif', fontSize: '0.65rem', fontWeight: 400}}>{item.label}</div>
                  </div>
                ))}
              </div>

            </div>
          </section>

          {/* ── Course Grid ──────────────────────────────────────────────── */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
            <div className="flex items-center justify-between mb-6 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider" style={{fontFamily: 'Teko, sans-serif'}}>Training Courses</h2>
              <span className="text-[10px] sm:text-xs text-[#A9ACAF]">{completedCourses.size} of {COURSES.length} complete</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {COURSES.filter(c => c.id !== 'rushing-bonus').map((course, idx) => {
                const isComplete = completedCourses.has(course.id);
                return (
                  <button
                    key={course.id}
                    onClick={() => openCourse(course.id)}
                    className="text-left bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl p-5 sm:p-6 hover:border-[#A9ACAF]/30 hover:bg-[#1a1a1a] transition-all group relative overflow-hidden"
                  >
                    {/* Subtle top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{background: course.color, opacity: 0.5}} />

                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xl sm:text-2xl">{course.icon}</span>
                        <span
                          className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
                          style={{color: course.color, background: course.color + '15'}}
                        >
                          {course.level}
                        </span>
                      </div>
                      {isComplete ? (
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                          Completed ✓
                        </span>
                      ) : (
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#666666]">
                          {course.duration}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-[#A9ACAF] transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-[#A9ACAF] text-xs sm:text-sm leading-relaxed">{course.subtitle}</p>
                    <div className="flex items-center gap-2 mt-3 sm:mt-4">
                      <div className="text-[10px] sm:text-xs text-[#666666]">
                        {course.videoUrl ? (COURSE_QUIZZES[course.id] ? '📹 Video + Quiz' : '📹 Video') : (COURSE_QUIZZES[course.id] ? `${course.slides.length} slides + Quiz` : `${course.slides.length} slides`)}
                      </div>
                      <span className="text-[#3B4B3B]">·</span>
                      <div className="text-[10px] sm:text-xs text-[#666666]">
                        {COURSE_QUIZZES[course.id] ? 'Quiz included' : 'Quiz coming soon'}
                      </div>
                      <span className="text-[#3B4B3B]">·</span>
                      {isComplete ? (
                        <div className="text-[10px] sm:text-xs text-emerald-400 font-semibold">+{getCoursePoints(course.id)} pts earned</div>
                      ) : (
                        <div className="text-[10px] sm:text-xs text-[#c8a84b] font-semibold">+{getCoursePoints(course.id)} pts</div>
                      )}
                    </div>
                    {/* Progress bar */}
                    {!isComplete && (
                      <div className="w-full h-[2px] bg-[#111111] rounded-full mt-3 sm:mt-4">
                        <div className="h-full rounded-full" style={{background: course.color, width: '0%'}} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Rushing Bonus + Hall of Flame Tracker ──────────────────────── */}
            {(() => {
              const nonBonusCourses = COURSES.filter(c => c.id !== 'rushing-bonus');
              const completedNonBonus = nonBonusCourses.filter(c => completedCourses.has(c.id)).length;
              const rushingComplete = completedCourses.has('rushing-bonus');
              const allDone = completedCourses.size >= COURSES.length;
              const completionPct = Math.round((completedCourses.size / COURSES.length) * 100);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
                  {/* Rushing Bonus Card */}
                  <button
                    onClick={() => openCourse('rushing-bonus')}
                    className="text-left bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl p-5 sm:p-6 hover:border-[#A9ACAF]/30 hover:bg-[#1a1a1a] transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#c8a84b] opacity-50" />
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="text-xl sm:text-2xl">🏃</span>
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded text-[#c8a84b] bg-[#c8a84b]/15">
                          Final Step
                        </span>
                      </div>
                      {rushingComplete ? (
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                          Completed ✓
                        </span>
                      ) : (
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#666666]">3 min</span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-[#A9ACAF] transition-colors">
                      Rushing Bonus
                    </h3>
                    <p className="text-[#A9ACAF] text-xs sm:text-sm leading-relaxed">Tell us about yourself — earn your final 100 pts</p>
                    <div className="flex items-center gap-2 mt-3 sm:mt-4">
                      <div className="text-[10px] sm:text-xs text-[#666666]">📝 Survey</div>
                      <span className="text-[#3B4B3B]">·</span>
                      {rushingComplete ? (
                        <div className="text-[10px] sm:text-xs text-emerald-400 font-semibold">+100 pts earned</div>
                      ) : (
                        <div className="text-[10px] sm:text-xs text-[#c8a84b] font-semibold">+100 pts</div>
                      )}
                    </div>
                  </button>

                  {/* Hall of Flame Tracker */}
                  <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 relative overflow-hidden border ${allDone ? 'border-[#A9ACAF]/40 bg-gradient-to-br from-[#c8a84b]/15 to-[#151515]' : 'border-[#A9ACAF]/15 bg-[#111111]'}`}>
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{background: allDone ? '#c8a84b' : '#555', opacity: allDone ? 1 : 0.5}} />
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl sm:text-2xl">🏆</span>
                      <span className={`text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded ${allDone ? 'text-[#c8a84b] bg-[#c8a84b]/15' : 'text-[#666666] bg-[#111111]'}`}>
                        {allDone ? 'Unlocked' : 'Locked'}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 700}}>
                      HALL OF FLAME
                    </h3>
                    <p className="text-[#A9ACAF] text-xs sm:text-sm mb-4">
                      {allDone ? 'You made it! Maximum rewards unlocked.' : `Complete all ${COURSES.length} modules to earn the ${POINTS_ALL_COMPLETE_BONUS.toLocaleString()} pt bonus.`}
                    </p>

                    {/* Completion tracker */}
                    <div className="space-y-2 mb-4">
                      {COURSES.map((c) => {
                        const done = completedCourses.has(c.id);
                        return (
                          <div key={c.id} className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0 ${done ? 'bg-emerald-500 text-white' : 'border border-[#A9ACAF]/25 text-transparent'}`}>
                              {done ? '✓' : ''}
                            </div>
                            <span className={`text-xs ${done ? 'text-[#A9ACAF] line-through' : 'text-[#A9ACAF]'}`}>{c.title}</span>
                            <span className={`text-[10px] ml-auto ${done ? 'text-emerald-400' : 'text-[#4A5A4A]'}`}>+{getCoursePoints(c.id)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar + percentage */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${completionPct}%`,
                            background: allDone ? 'linear-gradient(90deg, #c8a84b, #e0c66a)' : '#555',
                          }}
                        />
                      </div>
                      <span className={`text-sm font-bold ${allDone ? 'text-[#c8a84b]' : 'text-[#A9ACAF]'}`} style={{fontFamily: 'Teko, sans-serif', fontSize: '1.1rem'}}>
                        {completionPct}%
                      </span>
                    </div>
                    {allDone && (
                      <div className="mt-3 text-center">
                        <span className="text-[#c8a84b] font-bold" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.5rem'}}>+{POINTS_ALL_COMPLETE_BONUS.toLocaleString()} PTS BONUS 🎉</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          </section>

          {/* ── Budtenders Only Section ───────────────────────────────────── */}
          <section className="border-t border-[#A9ACAF]/15 bg-[#0a0a0a]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
              <div className="text-center mb-8 sm:mb-12">
                <div className="inline-block px-3 py-1 bg-[#A9ACAF]/10 border border-[#A9ACAF]/20 rounded-full text-[9px] sm:text-[10px] uppercase tracking-widest text-[#A9ACAF] font-bold mb-4">
                  Budtenders Only
                </div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2 uppercase tracking-wider" style={{fontFamily: 'Teko, sans-serif'}}>
                  Exclusive Events & Competitions
                </h2>
                <p className="text-[#A9ACAF] text-xs sm:text-sm max-w-md mx-auto">
                  Perks reserved for the Highsman budtender network. Register for events, enter competitions, and win prizes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {EVENTS.map((event, i) => {
                  const isRegistered = registeredEvents.has(i);
                  const tagColors: Record<string, string> = {
                    UPCOMING: 'text-blue-400 bg-blue-400/10',
                    COMPETITION: 'text-amber-400 bg-amber-400/10',
                    EXCLUSIVE: 'text-purple-400 bg-purple-400/10',
                  };
                  return (
                    <div
                      key={i}
                      className="bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl p-5 sm:p-6"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded ${tagColors[event.tag] || 'text-[#A9ACAF]'}`}>
                          {event.tag}
                        </span>
                        <span className="text-[10px] sm:text-xs text-[#666666]">{event.date}</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1">{event.title}</h3>
                      <p className="text-[#A9ACAF] text-[10px] sm:text-xs mb-1">{event.location}</p>
                      <p className="text-[#888888] text-xs sm:text-sm leading-relaxed mb-4">{event.description}</p>
                      <button
                        onClick={() => registerEvent(i)}
                        disabled={isRegistered}
                        className={`w-full py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                          isRegistered
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                            : 'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a] border border-[#A9ACAF]/20'
                        }`}
                      >
                        {isRegistered ? 'Registered ✓' : 'Register Interest'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Monthly Prize Banner */}
              <div className="mt-6 sm:mt-8 bg-[#111111] border border-[#A9ACAF]/20 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                <div className="text-2xl sm:text-3xl mb-3">🏆</div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Monthly Sales Competition</h3>
                <p className="text-[#888888] text-xs sm:text-sm max-w-lg mx-auto mb-4">
                  Top-selling Highsman budtender each month wins <span className="text-[#c8a84b] font-bold">$500 cash</span> + a signed Ricky Williams jersey.
                  Track your sales and submit your numbers weekly.
                </p>
                <div className="text-[#A9ACAF] text-[10px] sm:text-xs">
                  Contact your Highsman rep or email <span className="text-[#c8a84b]">team@highsman.com</span> to submit sales numbers.
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer className="border-t border-white/5 py-6 sm:py-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-3 sm:gap-4">
              <img src={SPARK_URL} alt="Spark Greatness" className="h-5 sm:h-6 opacity-40" />
              <p className="text-[#4A5A4A] text-[9px] sm:text-[10px] text-center">
                © Highsman · For authorized budtender use only · Not for public distribution
              </p>
            </div>
          </footer>
        </div>
      )}

      {/* ── Points Toast ──────────────────────────────────────────────── */}
      {pointsToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-bounce">
          <div className="bg-[#c8a84b] text-black px-6 py-3 rounded-2xl shadow-2xl shadow-[#c8a84b]/30 flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <div className="font-black text-lg">{pointsToast.msg}</div>
              <div className="text-xs font-semibold opacity-80">
                ${pointsToDollars(pointsToast.pts)} added to your store credit
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
