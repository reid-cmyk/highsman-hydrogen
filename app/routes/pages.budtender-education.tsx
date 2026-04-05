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
const RICKY_VIDEO_2_URL =
  'https://cdn.shopify.com/videos/c/o/v/93d7bb4e46784b2691cb719857996010.mp4';
const SCIENCE_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/1cc08c0fac4146038fd4b5106e564094.mp4';
const TRIPLE_THREAT_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/76404371b6444253bae19c6bb6cdd08f.mp4';
const HIGHSMAN_BRAND_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/0a370965a6d343c0bb4215c5d57566d4.mp4';
const PRODUCT_VIDEO_URL =
  'https://cdn.shopify.com/videos/c/o/v/2258a7eb83fb4868b504da29efbbdf4e.mp4';

// ── Points / Rewards System ─────────────────────────────────────────────────
const POINTS_SIGNUP = 200;           // Unsigned → 200 pts on signup
const POINTS_ALL_COMPLETE_BONUS = 0; // No separate bonus — points sum to 5000
const POINTS_PER_DOLLAR = 100;       // 100 pts = $1

// Tier credits: Signup 200 + Rookie 300 + Starting Lineup 500 + Franchise Player 750 + Products 1250 + Hall of Flame 2000 = 5000 ($50)
const COURSE_POINTS: Record<string, number> = {
  'meet-ricky': 300,            // Rookie
  'meet-highsman': 500,         // Starting Lineup
  'the-science': 750,           // Franchise Player
  'product-training': 1250,     // Toward Hall of Flame
  'rushing-bonus': 2000,        // Completes Hall of Flame
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

// Max: 200 + 300+500+750+1250+2000 = 5,000 pts → $50.00
const MAX_POINTS = POINTS_SIGNUP + 300 + 500 + 750 + 1250 + 2000;

// ── Helper: Check if a course is unlocked based on sequential progression ─────
function isCourseUnlocked(courseId: string, completedCourses: Set<string>): boolean {
  const courseIdx = COURSES.findIndex(c => c.id === courseId);
  if (courseIdx <= 0) return true;
  for (let i = 0; i < courseIdx; i++) {
    if (!completedCourses.has(COURSES[i].id)) return false;
  }
  return true;
}

// ── Session Persistence ──────────────────────────────────────────────────────
const SESSION_KEY = 'highsman_budtender_session';
const SESSION_EXPIRY_DAYS = 14; // 14-day auto-login

interface SessionData {
  name: string;
  email: string;
  password: string;
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

// ── Klaviyo Event Tracking ───────────────────────────────────────────────────
function trackKlaviyoEvent(email: string, eventName: string, properties: Record<string, any>) {
  // Use Klaviyo JS SDK for real-time event processing (faster flow triggers)
  const w = typeof window !== 'undefined' ? (window as any) : null;
  if (w?.klaviyo?.push) {
    // Identify the user first so the event is attributed
    w.klaviyo.push(['identify', {email}]);
    w.klaviyo.push(['track', eventName, properties]);
    return;
  }
  // Fallback to REST API if SDK not loaded
  fetch(
    `https://a.klaviyo.com/client/events/?company_id=${KLAVIYO_PUBLIC_KEY}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', revision: '2024-10-15'},
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            metric: {data: {type: 'metric', attributes: {name: eventName}}},
            profile: {data: {type: 'profile', attributes: {email}}},
            properties,
          },
        },
      }),
    },
  ).catch(() => {});
}

// Course order & next-course lookup for email automation
const COURSE_ORDER = [
  {id: 'meet-ricky', title: 'Meet Ricky', level: 'Rookie', icon: '🏈'},
  {id: 'meet-highsman', title: 'Highsman Brand Training', level: 'Starting Lineup', icon: '🏆'},
  {id: 'the-science', title: 'The Science', level: 'Franchise Player', icon: '🔬'},
  {id: 'product-training', title: 'Highsman Product Training', level: 'Hall of Flame', icon: '🔥'},
  {id: 'rushing-bonus', title: 'Rushing Bonus', level: 'Hall of Flame', icon: '🏃'},
];

function getNextCourse(completedId: string): {id: string; title: string; level: string} | null {
  const idx = COURSE_ORDER.findIndex(c => c.id === completedId);
  if (idx < 0 || idx >= COURSE_ORDER.length - 1) return null;
  return COURSE_ORDER[idx + 1];
}

// ── Simple password hashing (SHA-256, client-side) ──────────────────────────
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'highsman_budtender_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
  level: 'Rookie' | 'Starting Lineup' | 'Franchise Player' | 'Hall of Flame';
  icon: string;
  color: string;
  slides: CourseSlide[];
  audioSummary: string;
  quizLink?: string;
  videoUrl?: string;
  videoUrls?: {url: string; label: string}[];
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
    videoUrls: [
      {url: RICKY_VIDEO_URL, label: 'Part 1: Meet Ricky Williams'},
      {url: RICKY_VIDEO_2_URL, label: 'Part 2: The Highsman Story'},
    ],
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
  // ── Rookie (Highsman Brand Training) ────────────────────────────────────
  {
    id: 'meet-highsman',
    title: 'Highsman Brand Training',
    subtitle: 'The brand — where we came from and what we stand for',
    duration: '8 min',
    level: 'Starting Lineup',
    icon: '🏆',
    color: '#7c3aed',
    videoUrl: HIGHSMAN_BRAND_VIDEO_URL,
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to Highsman Brand Training',
        content:
          'This course covers the Highsman brand — our origin story, what we stand for, and how we show up in the world. Watch the brand video above, then review these key pillars every budtender should know.',
        keyPoints: [
          'Watch the brand video first',
          'Complete the quiz to finish this module',
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
  // ── Franchise Player ────────────────────────────────────────────────────
  {
    id: 'the-science',
    title: 'The Science',
    subtitle: 'Triple Infusion — the process that sets us apart',
    duration: '15 min',
    level: 'Franchise Player',
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
  // ── Highsman Product Training (combined: Triple Threat + Ground Game + Hit Sticks) ──
  {
    id: 'product-training',
    title: 'Highsman Product Training',
    subtitle: 'The full Highsman product lineup — every SKU, every pitch',
    duration: '15 min',
    level: 'Hall of Flame',
    icon: '🔥',
    color: '#ea580c',
    videoUrl: PRODUCT_VIDEO_URL,
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to Highsman Product Training',
        content:
          'Watch the product training video above, then review the key details on every SKU in the Highsman lineup. This module covers Triple Threat, Ground Game, and Hit Sticks — everything you need to match the right product to the right customer.',
        keyPoints: [
          'Watch the full video above before continuing',
          'Three SKUs: Triple Threat, Ground Game, Hit Sticks',
          'All products use the Triple Infusion process',
          'Complete the quiz to finish this module',
        ],
      },
      {
        title: 'Triple Threat — The Flagship Pre-Roll',
        content:
          'Triple Threat is the flagship — 1.2 grams of Triple Infused pre-roll with a built-in glass tip. This is the lead recommendation when someone asks "what is your best?" Premium indoor whole flower only, no trim or filler.',
        keyPoints: [
          '1.2 grams — 20% more than the industry standard 1.0g',
          'Full Triple Infusion: THCA Diamonds + Live Resin + HTE',
          'Built-in glass tip for unrestricted airflow and smoother pull',
          'Premium indoor whole flower only — no trim, shake, or filler',
          'Pitch: "Flavor lasts the full smoke, not just the first hit"',
        ],
      },
      {
        title: 'Ground Game — Ready To Roll Flower',
        content:
          'Ground Game is 7 grams of Triple Infused flower for consumers who roll their own. Highest-value SKU in the lineup and the highest repeat purchase rate. Same Triple Infusion process as the pre-rolls — just unrolled.',
        keyPoints: [
          '7 grams of Triple Infused flower',
          'Highest value SKU and highest repeat purchase rate',
          'For daily consumers who prefer to roll their own',
          'Pitch: "Same Triple Infusion, you roll it your way"',
          'Cross-sell with pre-rolls for variety',
        ],
      },
      {
        title: 'Hit Sticks — The Grab-and-Go',
        content:
          'Hit Sticks are 0.5 grams of Triple Infused pre-roll — half pre-roll, half chillum. The entry point to the Highsman lineup. Lower commitment, same premium quality. Perfect trial product and impulse buy.',
        keyPoints: [
          '0.5 grams — compact and convenient',
          'Gateway product for first-time Highsman customers',
          'Lower price point, easy impulse buy',
          'Upsell path: Hit Stick → Triple Threat → Ground Game',
          'Pitch: "Try the best infused pre-roll in the game"',
        ],
      },
      {
        title: 'Matching the Customer to the Product',
        content:
          'Every customer is different. Your job is to match them to the right SKU. Ask what they are looking for, then make the recommendation with confidence. Always use the assumptive close.',
        keyPoints: [
          '"What\'s your best?" → Triple Threat',
          '"I roll my own" → Ground Game',
          '"Something quick" or first-timer → Hit Sticks',
          'Always close: "Single or the two-pack?" / "One or two?"',
          'Cross-sell across the lineup to build basket size',
        ],
      },
    ],
  },
  // ── Rushing Bonus (Survey) ──────────────────────────────────────────────
  {
    id: 'rushing-bonus',
    title: 'Rushing Bonus',
    subtitle: 'Tell us about yourself — earn your final 2,000 pts',
    duration: '3 min',
    level: 'Hall of Flame',
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
          '+2,000 pts upon submission',
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
  explanation?: string;
}

const COURSE_QUIZZES: Record<string, QuizQuestion[]> = {
  'meet-ricky': [
    {
      q: 'What year did Ricky Williams win the Heisman Trophy at the University of Texas?',
      options: ['1996', '1997', '1998', '1999'],
      correct: 2,
      explanation: 'Ricky won the Heisman Trophy in 1998, his senior season at UT.',
    },
    {
      q: 'Whose all-time rushing record did Ricky Williams break at the University of Texas?',
      options: ['Vince Young', 'Earl Campbell', 'Cedric Benson', 'Colt McCoy'],
      correct: 1,
      explanation: 'Ricky broke Earl Campbell\'s all-time rushing record at UT. He also set 21 NCAA records and 46 UT records.',
    },
    {
      q: 'How many NCAA records did Ricky Williams set during his college career at Texas?',
      options: ['5 records', '12 records', '21 records', '46 records'],
      correct: 2,
      explanation: 'Ricky set 21 NCAA records at Texas — the most dominant college running back of his era.',
    },
    {
      q: 'What was Ricky Williams\' rushing total when he led the entire NFL in 2002?',
      options: ['1,200 yards', '1,500 yards', '1,853 yards', '2,100 yards'],
      correct: 2,
      explanation: 'Ricky led the entire NFL with 1,853 rushing yards in 2002 as a Miami Dolphin.',
    },
    {
      q: 'Why did Ricky Williams use cannabis during his NFL career?',
      options: [
        'Recreationally — just for fun',
        'As a tool for physical recovery and mental well-being, not rebellion',
        'To cope with career-ending injuries',
        'Because he disagreed with the NFL supplement program',
      ],
      correct: 1,
      explanation: 'Cannabis was a recovery and wellness tool — managing the physical punishment of the NFL and shifting his mindset. Not recreation. Not rebellion. Recovery.',
    },
    {
      q: 'Approximately how many drug tests did Ricky Williams face during his NFL career?',
      options: ['About 50', 'Around 150', 'Approximately 300', 'An estimated 500'],
      correct: 3,
      explanation: 'Ricky faced an estimated 500 drug tests — the NFL put him under extraordinary scrutiny throughout his career.',
    },
    {
      q: 'How many seasons was Ricky Williams suspended from the NFL due to cannabis use?',
      options: ['1 season', '2 seasons', '3 seasons', '4 seasons'],
      correct: 2,
      explanation: '3 seasons — right in the prime of his career. It cost him an estimated $10 million and roughly 4,000 rushing yards.',
    },
    {
      q: 'Why is Ricky\'s story important when selling Highsman?',
      options: [
        'Customers like celebrity stories',
        'It explains the THC percentage',
        'Highsman IS the story — it is his answer to everything the NFL took from him',
        'It explains the product pricing',
      ],
      correct: 2,
      explanation: 'Highsman is Ricky\'s answer to everything the NFL took from him. When you sell Highsman, you are selling the comeback. The story is the pitch.',
    },
  ],
  'meet-highsman': [
    {
      q: 'Highsman is positioned as a brand existing at the intersection of which two core areas?',
      options: ['Performance and recovery', 'Fitness and nutrition', 'Wellness and technology', 'Sports and cannabis'],
      correct: 3,
      explanation: 'Highsman defines its unique market position specifically at the crossroads of sports culture and cannabis usage. It is not a stoner brand or a wellness brand — it is a performance brand.',
    },
    {
      q: 'Which of the following phrases serves as the Highsman brand tagline?',
      options: ['Spark Greatness', 'Pure Intent', 'Peak Performance', 'Elevate the Game'],
      correct: 0,
      explanation: 'SPARK GREATNESS™ is the official Highsman tagline — the north star of everything the brand stands for. Every budtender interaction should embody it.',
    },
    {
      q: 'Highsman emphasizes \'intentional\' use as part of its brand pillar. What does this specifically mean for the consumer?',
      options: [
        'Consuming only during designated athletic training sessions',
        'Switching to low-potency products to maintain clarity',
        'Using cannabis for a specific purpose like recovery or focus',
        'Following a clinical or medical prescription strictly',
      ],
      correct: 2,
      explanation: 'The brand encourages thoughtful consumption that serves a goal — such as reflection, balance, or being in tune with oneself. Cannabis and peak performance go hand in hand.',
    },
    {
      q: 'The brand archetype for Highsman is \'The High Performer.\' Which description best fits the voice and tone of this archetype?',
      options: [
        'Playful, humorous, and trend-focused',
        'Highly technical and lineage-focused',
        'Artistic, complex, and deeply descriptive',
        'Confident and declarative without being arrogant',
      ],
      correct: 3,
      explanation: 'The High Performer archetype is built on credible confidence and direct communication that avoids sounding clinical or arrogant. Fewest words, strongest impact.',
    },
    {
      q: 'To maintain a premium and authentic identity, which of the following words is a budtender instructed NEVER to use when describing Highsman?',
      options: ['Growth', 'Premium', 'Artisan', 'Authentic'],
      correct: 2,
      explanation: 'Words like \'artisan,\' \'small batch,\' and \'crafted\' are forbidden because Highsman relies on a direct, declarative voice rather than generic buzzwords. Stick to outcome-led language.',
    },
    {
      q: 'Highsman\'s \'Authenticity\' pillar is defined by which of the following characteristics?',
      options: [
        'Following current cannabis trends and aesthetic hype',
        'Having a clear point of view and a real cultural lane',
        'Offering the lowest possible price point for consumers',
        'Focusing exclusively on the history of the founder',
      ],
      correct: 1,
      explanation: 'Authenticity for Highsman means being credible, grounded, and true to the specific community it speaks to — not chasing trends or competing solely on price.',
    },
    {
      q: 'When representing the Highsman brand voice, what should a budtender lead with when talking to a customer?',
      options: [
        'The full strain lineage',
        'The scientific method of extraction',
        'Sensory outcomes',
        'Detailed terpene breakdowns',
      ],
      correct: 2,
      explanation: 'The brand protocol dictates leading with the experience and outcomes rather than technical data or lineage. Avoid jargon — let the product speak through sensation and results.',
    },
    {
      q: 'What is the primary goal of Highsman\'s mission beyond simply selling products?',
      options: [
        'To become the largest discount retailer in the nation',
        'To reshape the conversation around cannabis and normalization',
        'To replace traditional medicine for professional athletes',
        'To focus solely on the high-potency concentrate market',
      ],
      correct: 1,
      explanation: 'The mission is to make cannabis use more open, intentional, and connected to culture and performance — changing the mindset around the category, not just moving units.',
    },
  ],
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
  'product-training': [
    {
      q: 'What is the weight of a Triple Threat pre-roll?',
      options: ['0.5 grams', '0.75 grams', '1.0 grams', '1.2 grams'],
      correct: 3,
      explanation: 'Triple Threat is 1.2 grams — 20% more than the industry standard 1.0g pre-roll. That extra weight is a key selling point.',
    },
    {
      q: 'How much flower is in a Ground Game pouch?',
      options: ['3.5 grams', '5 grams', '7 grams', '14 grams'],
      correct: 2,
      explanation: 'Ground Game is 7 grams of Triple Infused flower — the highest-value SKU in the Highsman lineup with the highest repeat purchase rate.',
    },
    {
      q: 'What size is a Hit Stick?',
      options: ['0.25 grams', '0.5 grams', '0.75 grams', '1.0 grams'],
      correct: 1,
      explanation: 'Hit Sticks are 0.5 grams — half pre-roll, half chillum. The compact, grab-and-go entry point to the Highsman lineup.',
    },
    {
      q: 'What is the primary benefit of the Triple Threat\'s built-in glass tip?',
      options: [
        'It keeps the pre-roll from unraveling',
        'It makes the pre-roll look more premium on the shelf',
        'It filters out THC for a milder experience',
        'Unrestricted airflow and a cooler, smoother pull',
      ],
      correct: 3,
      explanation: 'The glass tip provides unrestricted airflow and a cooler, smoother pull — a premium feature that sets Triple Threat apart from standard pre-rolls.',
    },
    {
      q: 'A customer says "I roll my own." Which product do you recommend?',
      options: ['Hit Sticks', 'Triple Threat', 'Ground Game', 'Any of the above'],
      correct: 2,
      explanation: 'Ground Game is built for the roll-your-own crowd. "Same Triple Infusion, you roll it your way." 7 grams of flower for daily consumers.',
    },
    {
      q: 'A first-time customer wants to try Highsman but is not ready to commit. What do you recommend?',
      options: [
        'Triple Threat — always lead with the flagship',
        'Ground Game — best value per gram',
        'Hit Sticks — low commitment, same premium quality',
        'Tell them to come back when they are ready',
      ],
      correct: 2,
      explanation: 'Hit Sticks are the gateway product — low price, low commitment, same Triple Infusion quality. Once they try it, upsell to Triple Threat or Ground Game next visit.',
    },
    {
      q: 'Why does the Triple Threat burn differently than a standard infused pre-roll?',
      options: [
        'It uses a slower-burning wrap',
        'The THC content is lower, producing less harsh smoke',
        'Concentrates are spun into the flower — not coated on the outside',
        'It contains CBD that counteracts harshness',
      ],
      correct: 2,
      explanation: 'The centrifuge spins concentrates INTO the microstructure of the flower at 10,000 RPM. Standard infused pre-rolls just coat the outside, which causes harsh spots and uneven burn.',
    },
    {
      q: 'A customer asks "what is your best?" How do you respond?',
      options: [
        '"Let me show you our full menu"',
        '"1.2 grams of Triple Infused flower — flavor lasts the full smoke"',
        '"That depends on the use case you are looking for"',
        '"Our Hit Sticks are our most popular"',
      ],
      correct: 2,
      explanation: 'Always qualify the customer first. "That depends on the use case you are looking for" opens the conversation so you can match them to the right product — Hit Sticks, Triple Threat, or Ground Game.',
    },
    {
      q: 'What is the correct upsell path across the Highsman lineup?',
      options: [
        'Ground Game → Triple Threat → Hit Sticks',
        'Triple Threat → Hit Sticks → Ground Game',
        'Hit Sticks → Triple Threat → Ground Game',
        'Any order works — there is no preferred path',
      ],
      correct: 2,
      explanation: 'The upsell path is Hit Sticks → Triple Threat → Ground Game. Start with the gateway, move to the flagship, then lock them in as a daily consumer with the flower.',
    },
    {
      q: 'What close should you always use when selling Highsman products?',
      options: [
        '"Would you like to buy one?"',
        '"Let me know if you have questions"',
        '"So what product type do you prefer, The Hit Stick, The 1.2g pre roll or the 7g ready to roll flower?"',
        '"I will leave you to think about it"',
      ],
      correct: 2,
      explanation: 'Always use the assumptive close. Guide them to choose between products — not whether to buy. "So what product type do you prefer, The Hit Stick, The 1.2g pre roll or the 7g ready to roll flower?" assumes the sale.',
    },
  ],
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
function subscribeToKlaviyo(name: string, email: string, state: string, dispensaryName: string) {
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ');
  fetch(
    `https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_PUBLIC_KEY}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', revision: '2024-10-15'},
      body: JSON.stringify({
        data: {
          type: 'subscription',
          attributes: {
            custom_source: 'Budtender Education Portal',
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email,
                  first_name: firstName,
                  last_name: lastName,
                  organization: dispensaryName,
                  properties: {
                    budtender_state: state,
                    dispensary_name: dispensaryName,
                    is_budtender: true,
                    budtender_education_signup: true,
                    marketing_consent: true,
                    consent_date: new Date().toISOString(),
                  },
                },
              },
            },
          },
          relationships: {
            list: {
              data: {
                type: 'list',
                id: BUDTENDER_LIST_ID,
              },
            },
          },
        },
      }),
    },
  ).catch(() => {});
}

// ── Main Component ────────────────────────────────────────────────────────────
type Screen = 'loading' | 'gate' | 'portal';
type GateMode = 'login' | 'register' | 'reset';

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
  const [userFullName, setUserFullName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Gate
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [dispensary, setDispensary] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [password, setPassword] = useState('');  // registration password
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

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
  const [videoStep, setVideoStep] = useState(0); // tracks which video in a multi-video course
  const [videosWatched, setVideosWatched] = useState<Set<number>>(new Set()); // tracks which videos have ended

  const portalRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ── Auto-login: check localStorage on mount ─────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setUserName(session.name.split(' ')[0]);
      setUserFullName(session.name);
      setUserEmail(session.email);
      setCompletedCourses(new Set(session.completedCourses || []));
      setScreen('portal');
    } else {
      setScreen('gate');
    }
  }, []);

  // ── Persist completed courses whenever they change ──────────────────────
  useEffect(() => {
    if (screen !== 'portal') return;
    const session = loadSession();
    if (session) {
      const updated = {...session, completedCourses: [...completedCourses]};
      saveSession(updated);
      saveAccount(updated);
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

  // ── Login with email + password ─────────────────────────────────────────
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
      setLoginError('Enter a valid email address.');
      return;
    }
    if (!loginPassword) {
      setLoginError('Enter your password.');
      return;
    }
    // Check localStorage for a matching account
    hashPassword(loginPassword).then((hashed) => {
      const allAccounts = getAllAccounts();
      const account = allAccounts.find(
        (a) => a.email.toLowerCase() === loginEmail.trim().toLowerCase() && a.password === hashed
      );
      if (!account) {
        setLoginError('Invalid email or password. Please try again or create an account.');
        return;
      }
      // Refresh session with 14-day expiry
      saveSession({
        ...account,
        completedCourses: account.completedCourses || [],
      });
      setUserName(account.name.split(' ')[0]);
      setUserFullName(account.name);
      setUserEmail(account.email);
      setCompletedCourses(new Set(account.completedCourses || []));
      setScreen('portal');
    });
  }

  // ── Get all registered accounts from localStorage ─────────────────────
  function getAllAccounts(): SessionData[] {
    try {
      const raw = localStorage.getItem('highsman_budtender_accounts');
      if (!raw) return [];
      return JSON.parse(raw);
    } catch { return []; }
  }

  function saveAccount(data: SessionData) {
    try {
      const accounts = getAllAccounts();
      const idx = accounts.findIndex((a) => a.email.toLowerCase() === data.email.toLowerCase());
      if (idx >= 0) {
        accounts[idx] = data;
      } else {
        accounts.push(data);
      }
      localStorage.setItem('highsman_budtender_accounts', JSON.stringify(accounts));
    } catch {}
  }

  // ── Reset Password ─────────────────────────────────────────────────────
  function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetSuccess(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      setResetError('Enter a valid email address.');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }
    const accounts = getAllAccounts();
    const idx = accounts.findIndex(
      (a) => a.email.toLowerCase() === resetEmail.trim().toLowerCase()
    );
    if (idx < 0) {
      setResetError('No account found with that email. Please create an account first.');
      return;
    }
    hashPassword(resetNewPassword).then((hashed) => {
      accounts[idx].password = hashed;
      localStorage.setItem('highsman_budtender_accounts', JSON.stringify(accounts));
      setResetSuccess(true);
      setResetNewPassword('');
    });
  }

  // ── Register (full form with password) ──────────────────────────────────
  function handleGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = 'Enter a valid email.';
    if (!password || password.length < 6) newErrors.password = 'Password must be at least 6 characters.';
    if (!dispensary.trim()) newErrors.dispensary = 'Enter your dispensary name.';
    if (!state) newErrors.state = 'Select your state.';
    if (!consent) newErrors.consent = 'You must agree to continue.';
    // Check if email already registered
    const existing = getAllAccounts().find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (existing) newErrors.email = 'This email is already registered. Please sign in.';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    hashPassword(password).then((hashed) => {
      subscribeToKlaviyo(name.trim(), email.trim(), state, dispensary.trim());
      // Track signup event for Klaviyo automation
      trackKlaviyoEvent(email.trim(), 'Budtender Education Signup', {
        budtender_name: name.trim(),
        dispensary: dispensary.trim(),
        state,
        signup_points: POINTS_SIGNUP,
        first_course_title: COURSE_ORDER[0].title,
        first_course_id: COURSE_ORDER[0].id,
        portal_url: 'https://highsman.com/pages/budtender-education',
      });
      const sessionData = {
        name: name.trim(),
        email: email.trim(),
        password: hashed,
        state,
        dispensary: dispensary.trim() || undefined,
        completedCourses: [] as string[],
      };
      saveSession(sessionData);
      saveAccount({
        ...sessionData,
        completedCourses: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      });
      setUserName(name.split(' ')[0]);
      setUserFullName(name.trim());
      setUserEmail(email.trim());
      setScreen('portal');
    });
  }

  // ── Logout ──────────────────────────────────────────────────────────────
  function handleLogout() {
    clearSession();
    setScreen('gate');
    setGateMode('login');
    setUserName('');
    setUserFullName('');
    setUserEmail('');
    setCompletedCourses(new Set());
    setActiveCourse(null);
    setCourseQuizActive(null);
    setLoginEmail('');
    setLoginPassword('');
    setLoginError('');
  }

  function openCourse(id: string) {
    setActiveCourse(id);
    setSlideIndex(0);
    setCourseQuizActive(null);
    setQuizComplete(false);
    setVideoStep(0);
    setVideosWatched(new Set());
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

  // ── Track course completion in Klaviyo ─────────────────────────────────
  function getCurrentTier(completed: Set<string>): {name: string; img: string} {
    const hallDone = completed.size >= COURSES.length;
    const franchDone = completed.has('meet-ricky') && completed.has('meet-highsman') && completed.has('the-science');
    const startDone = completed.has('meet-ricky') && completed.has('meet-highsman');
    const rookDone = completed.has('meet-ricky');
    if (hallDone) return {name: 'Hall of Flame', img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Hall_of_Flame.svg?v=1775343989'};
    if (franchDone) return {name: 'Franchise Player', img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Franchise_Player.svg?v=1775343989'};
    if (startDone) return {name: 'Starting Lineup', img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Starting_Lineup.svg?v=1775343990'};
    if (rookDone) return {name: 'Rookie', img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Rookie.svg?v=1775343989'};
    return {name: 'Unsigned', img: 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Budtender_Education_Unsigned_Image.svg?v=1775343989'};
  }

  function trackCourseCompletion(courseId: string, newCompletedSet: Set<string>) {
    const courseInfo = COURSE_ORDER.find(c => c.id === courseId);
    if (!courseInfo || !userEmail) return;
    const next = getNextCourse(courseId);
    const totalCompleted = newCompletedSet.size;
    const isAllDone = totalCompleted >= COURSES.length;
    const tier = getCurrentTier(newCompletedSet);
    // Check if tier changed (for tier_unlocked banner in email)
    const prevSet = new Set(newCompletedSet);
    prevSet.delete(courseId);
    const prevTier = getCurrentTier(prevSet);
    const tierUnlocked = tier.name !== prevTier.name;
    // Convert points to store credit dollars
    const coursePoints = getCoursePoints(courseId);
    const totalPoints = calculatePoints(newCompletedSet, COURSES.length);
    trackKlaviyoEvent(userEmail, 'Budtender Course Completed', {
      course_id: courseId,
      course_title: courseInfo.title,
      course_level: courseInfo.level,
      course_icon: courseInfo.icon,
      courses_completed: totalCompleted,
      courses_total: COURSES.length,
      completion_pct: Math.round((totalCompleted / COURSES.length) * 100),
      points_earned: coursePoints,
      total_points: totalPoints,
      store_credit_earned: '+$' + pointsToDollars(coursePoints),
      total_store_credit: '$' + pointsToDollars(totalPoints),
      all_courses_done: isAllDone,
      current_tier: tier.name,
      current_tier_img: tier.img,
      tier_unlocked: tierUnlocked,
      next_course_id: next?.id || null,
      next_course_title: next?.title || null,
      next_course_level: next?.level || null,
      portal_url: 'https://highsman.com/pages/budtender-education',
    });
  }

  function prevSlide() {
    if (slideIndex > 0) {
      setSlideIndex(slideIndex - 1);
    }
  }

  // ── Certificate Generator (Canvas → PNG) ────────────────────────────────────
  function generateCertificate() {
    const canvas = document.createElement('canvas');
    const W = 1600;
    const H = 1100;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    // Gold border (double line)
    ctx.strokeStyle = '#c8a84b';
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(45, 45, W - 90, H - 90);

    // Corner accents (gold dots)
    const corners = [[55, 55], [W - 55, 55], [55, H - 55], [W - 55, H - 55]];
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#c8a84b';
      ctx.fill();
    });

    // Top label
    ctx.fillStyle = '#c8a84b';
    ctx.font = '500 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('HIGHSMAN BUDTENDER TRAINING', W / 2, 120);
    ctx.letterSpacing = '0px';

    // Main title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 58px Arial, sans-serif';
    ctx.fillText('CERTIFICATE OF COMPLETION', W / 2, 200);

    // Divider line
    ctx.strokeStyle = '#c8a84b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 200, 230);
    ctx.lineTo(W / 2 + 200, 230);
    ctx.stroke();

    // "This certifies that"
    ctx.fillStyle = '#A9ACAF';
    ctx.font = '400 20px Arial, sans-serif';
    ctx.fillText('This certifies that', W / 2, 300);

    // User name (large, gold)
    ctx.fillStyle = '#c8a84b';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.fillText(userFullName || userName || 'Budtender', W / 2, 375);

    // Underline beneath name
    const nameWidth = ctx.measureText(userFullName || userName || 'Budtender').width;
    ctx.strokeStyle = '#c8a84b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - nameWidth / 2 - 20, 390);
    ctx.lineTo(W / 2 + nameWidth / 2 + 20, 390);
    ctx.stroke();

    // Description text
    ctx.fillStyle = '#A9ACAF';
    ctx.font = '400 20px Arial, sans-serif';
    ctx.fillText('has successfully completed the', W / 2, 445);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillText('HIGHSMAN BUDTENDER TRAINING PROGRAM', W / 2, 495);

    ctx.fillStyle = '#A9ACAF';
    ctx.font = '400 18px Arial, sans-serif';
    ctx.fillText('and has achieved the rank of', W / 2, 545);

    // Hall of Flame
    ctx.fillStyle = '#c8a84b';
    ctx.font = 'bold 46px Arial, sans-serif';
    ctx.fillText('HALL OF FLAME', W / 2, 610);

    // Spark Greatness
    ctx.fillStyle = '#c8a84b';
    ctx.font = '500 14px Arial, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('SPARK GREATNESS™', W / 2, 665);
    ctx.letterSpacing = '0px';

    // Bottom divider
    ctx.strokeStyle = '#c8a84b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 300, 700);
    ctx.lineTo(W / 2 + 300, 700);
    ctx.stroke();

    // Date
    const completionDate = new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});
    ctx.fillStyle = '#A9ACAF';
    ctx.font = '400 18px Arial, sans-serif';
    ctx.fillText('Date of Completion', W / 2 - 250, 760);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText(completionDate, W / 2 - 250, 795);

    // Issued by
    ctx.fillStyle = '#A9ACAF';
    ctx.font = '400 18px Arial, sans-serif';
    ctx.fillText('Issued by', W / 2 + 250, 760);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText('Highsman', W / 2 + 250, 795);

    // Bottom tagline
    ctx.fillStyle = '#666666';
    ctx.font = '400 13px Arial, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('SPORTS × CANNABIS — THE INTERSECTION OF GREATNESS', W / 2, 880);
    ctx.letterSpacing = '0px';

    // Ricky Williams signature line
    ctx.fillStyle = '#A9ACAF';
    ctx.font = '400 16px Arial, sans-serif';
    ctx.fillText('Ricky Williams, Founder', W / 2, 950);

    // Signature underline
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 100, 925);
    ctx.lineTo(W / 2 + 100, 925);
    ctx.stroke();

    // Download as PNG via Blob (prevents navigation, forces download)
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `Highsman_Certificate_${(userFullName || userName || 'Budtender').replace(/\s+/g, '_')}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
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
      const passed = (quizScore + (quizSelected === questions[quizQ].correct ? 1 : 0)) >= Math.ceil(questions.length * 0.7);
      if (passed) {
        const newCompleted = new Set([...completedCourses, courseQuizActive]);
        setCompletedCourses(newCompleted);
        trackCourseCompletion(courseQuizActive, newCompleted);
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
        trackCourseCompletion('rushing-bonus', newCompleted);
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

          {/* Login / Register Toggle (hidden on reset screen) */}
          {gateMode !== 'reset' && (
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
          )}

          {gateMode === 'login' ? (
            /* ── LOGIN FORM (email + password) ──────────────────────────── */
            <div className="bg-[#111111] border border-[#A9ACAF]/20 rounded-xl p-6 md:p-8 shadow-2xl">
              <div className="text-center mb-5">
                <h2 className="text-lg font-bold text-white mb-1">Welcome Back</h2>
                <p className="text-[#A9ACAF] text-xs">Sign in to continue your training</p>
              </div>

              <form onSubmit={handleLogin}>
                <div className="space-y-4">
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
                        loginError ? 'border-red-400' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                      placeholder="Enter your password"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                        loginError ? 'border-red-400' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    />
                  </div>

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
              <p className="text-center text-[#888888] text-xs mt-2">
                <button onClick={() => { setGateMode('reset'); setResetEmail(loginEmail); setResetError(''); setResetSuccess(false); setResetNewPassword(''); }} className="text-[#A9ACAF] hover:text-white hover:underline transition-colors">
                  Forgot your password?
                </button>
              </p>
            </div>
          ) : gateMode === 'reset' ? (
            /* ── RESET PASSWORD FORM ────────────────────────────────────── */
            <div className="bg-[#111111] border border-[#A9ACAF]/20 rounded-xl p-6 md:p-8 shadow-2xl">
              <div className="text-center mb-5">
                <h2 className="text-lg font-bold text-white mb-1">Reset Password</h2>
                <p className="text-[#A9ACAF] text-xs">Enter your email and set a new password</p>
              </div>

              {resetSuccess ? (
                <div className="text-center">
                  <div className="text-3xl mb-3">✅</div>
                  <p className="text-emerald-400 font-semibold text-sm mb-4">Password updated successfully!</p>
                  <button
                    onClick={() => { setGateMode('login'); setResetSuccess(false); }}
                    className="w-full py-3 bg-[#FFEB3B] text-black font-semibold text-sm rounded-lg hover:bg-[#ffd700] transition-colors"
                  >
                    SIGN IN NOW
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => { setResetEmail(e.target.value); setResetError(''); }}
                        placeholder="you@dispensary.com"
                        className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                          resetError ? 'border-red-400' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={resetNewPassword}
                        onChange={(e) => { setResetNewPassword(e.target.value); setResetError(''); }}
                        placeholder="At least 6 characters"
                        className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                          resetError ? 'border-red-400' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                        }`}
                      />
                    </div>

                    {resetError && <p className="text-red-500 text-xs mt-1">{resetError}</p>}
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-5 py-3 bg-[#FFEB3B] text-black font-semibold text-sm rounded-lg hover:bg-[#ffd700] transition-colors"
                  >
                    RESET PASSWORD
                  </button>
                </form>
              )}

              <p className="text-center text-[#888888] text-xs mt-4">
                <button onClick={() => setGateMode('login')} className="text-white font-semibold hover:underline">
                  Back to Sign In
                </button>
              </p>
            </div>
          ) : (
            /* ── REGISTER FORM (full form with password) ─────────────────── */
            <div className="bg-[#111111] border border-[#A9ACAF]/20 rounded-xl p-6 md:p-8 shadow-2xl">
              <div className="text-center mb-5">
                <h2 className="text-lg font-bold text-white mb-1">Create Your Account</h2>
                <p className="text-[#A9ACAF] text-xs">Register once, then sign in instantly for 14 days</p>
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

                  {/* Password */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#666666] mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                        errors.password ? 'border-red-400' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    />
                    {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
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
                      Dispensary Name
                    </label>
                    <input
                      type="text"
                      value={dispensary}
                      onChange={(e) => setDispensary(e.target.value)}
                      placeholder="Where do you work?"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm text-white outline-none transition-colors bg-[#000000] ${
                        errors.dispensary ? 'border-red-400' : 'border-[#A9ACAF]/20 focus:border-[#A9ACAF]'
                      }`}
                    />
                    {errors.dispensary && <p className="text-red-500 text-xs mt-1">{errors.dispensary}</p>}
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

          {/* ── Video Player (multi-video or single) ────────────────────── */}
          {currentCourse.videoUrls && currentCourse.videoUrls.length > 1 ? (
            <div className="mb-6 sm:mb-8">
              {/* Video step indicator */}
              <div className="flex items-center gap-2 mb-3">
                {currentCourse.videoUrls.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => { if (i === 0 || videosWatched.has(i - 1)) setVideoStep(i); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-all"
                    style={{
                      background: videoStep === i ? currentCourse.color : 'rgba(255,255,255,0.06)',
                      color: videoStep === i ? '#000' : (videosWatched.has(i) ? '#4ade80' : '#A9ACAF'),
                      opacity: (i === 0 || videosWatched.has(i - 1)) ? 1 : 0.4,
                      cursor: (i === 0 || videosWatched.has(i - 1)) ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {videosWatched.has(i) ? '✓' : `${i + 1}`}
                    <span className="hidden sm:inline">{v.label}</span>
                  </button>
                ))}
              </div>
              {/* Current video */}
              <div className="bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl overflow-hidden">
                <video
                  key={`video-${videoStep}`}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full aspect-video bg-black"
                  onEnded={() => {
                    const next = new Set(videosWatched);
                    next.add(videoStep);
                    setVideosWatched(next);
                    // Auto-advance to next video
                    if (videoStep < currentCourse.videoUrls!.length - 1) {
                      setVideoStep(videoStep + 1);
                    }
                  }}
                >
                  <source src={currentCourse.videoUrls[videoStep].url} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="flex items-center gap-2 mt-3 px-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{background: currentCourse.color}}
                />
                <span className="text-[10px] sm:text-xs text-[#A9ACAF]">
                  {videosWatched.size >= currentCourse.videoUrls.length
                    ? 'All videos watched — scroll down for key takeaways and quiz'
                    : `Watch video ${videoStep + 1} of ${currentCourse.videoUrls.length}: ${currentCourse.videoUrls[videoStep].label}`}
                </span>
              </div>
            </div>
          ) : currentCourse.videoUrl ? (
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
          ) : null}

          {/* Gate: if multi-video course, require all videos watched before showing slides */}
          {currentCourse.videoUrls && currentCourse.videoUrls.length > 1 && videosWatched.size < currentCourse.videoUrls.length ? (
            <div className="bg-[#111111] border border-[#A9ACAF]/15 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center mb-5 sm:mb-6">
              <div className="text-3xl mb-3">🎬</div>
              <h3 className="text-white font-bold text-base sm:text-lg mb-2">Watch Both Videos to Continue</h3>
              <p className="text-[#A9ACAF] text-xs sm:text-sm mb-4">
                Complete video {videosWatched.size + 1} of {currentCourse.videoUrls.length} to unlock the key takeaways and quiz.
              </p>
              <div className="flex justify-center gap-2">
                {currentCourse.videoUrls.map((v, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span style={{color: videosWatched.has(i) ? '#4ade80' : '#A9ACAF'}}>
                      {videosWatched.has(i) ? '✓' : '○'}
                    </span>
                    <span className="text-[#A9ACAF]">{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <>
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
                  trackCourseCompletion(currentCourse.id, newCompleted);
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
          </>
          )}

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

                {/* Explanation after answering */}
                {quizAnswered && COURSE_QUIZZES[courseQuizActive][quizQ].explanation && (
                  <div className="mt-4 bg-[#c8a84b]/10 border-l-[3px] border-[#c8a84b] rounded-r-xl px-4 py-3 text-sm text-[#d4d4d4] leading-relaxed">
                    <span className="font-bold text-[#c8a84b]">
                      {quizSelected === COURSE_QUIZZES[courseQuizActive][quizQ].correct ? 'Correct. ' : 'Not quite. '}
                    </span>
                    {COURSE_QUIZZES[courseQuizActive][quizQ].explanation}
                  </div>
                )}
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
                  {quizScore >= Math.ceil(COURSE_QUIZZES[courseQuizActive].length * 0.7)
                    ? 'Course Complete! ✓'
                    : 'Keep Studying'}
                </h3>
                <p className="text-[#A9ACAF] text-sm mb-6">
                  {quizScore >= Math.ceil(COURSE_QUIZZES[courseQuizActive].length * 0.7)
                    ? `Nice work, ${userName}! You\'ve earned your badge for this course.`
                    : `Review the slides and try again, ${userName}. You need 70% to pass.`}
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
                const rookieDone = completedCourses.has('meet-ricky');
                const startingDone = rookieDone && completedCourses.has('meet-highsman');
                const franchiseDone = startingDone && completedCourses.has('the-science');
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
                              filter: tier.unlocked ? 'none' : 'grayscale(80%)',
                              opacity: tier.unlocked ? 1 : 0.5,
                            }}
                          >
                            <img
                              src={tier.img}
                              alt={tier.label}
                              className="w-full h-auto block"
                            />
                            {/* Highsman logo on Unsigned locker — baked into SVG image */}
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
                            if (startingDone) return 50;
                            if (rookieDone) return 25;
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
                  {icon: '📚', label: 'COURSES', value: '+300–1.25K', sub: 'pts each'},
                  {icon: '🏃', label: 'RUSHING BONUS', value: '+2,000', sub: 'survey'},
                  {icon: '🏆', label: 'HALL OF FLAME', value: '$50', sub: 'total credit'},
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
                const isUnlocked = isCourseUnlocked(course.id, completedCourses);
                return (
                  <button
                    key={course.id}
                    onClick={() => isUnlocked && openCourse(course.id)}
                    disabled={!isUnlocked}
                    className={`text-left rounded-xl sm:rounded-2xl p-5 sm:p-6 transition-all group relative overflow-hidden ${
                      !isUnlocked
                        ? 'bg-[#111111] border border-[#A9ACAF]/15 cursor-not-allowed'
                        : 'bg-[#111111] border border-[#A9ACAF]/15 hover:border-[#A9ACAF]/30 hover:bg-[#1a1a1a]'
                    }`}
                    style={!isUnlocked ? {opacity: 0.55} : undefined}
                  >
                    {/* Subtle top accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{background: course.color, opacity: 0.5}} />
                    {/* Lock overlay for locked courses */}
                    {!isUnlocked && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 text-2xl" style={{opacity: 1}}>🔒</div>
                    )}

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
                        {course.videoUrls && course.videoUrls.length > 1
                          ? (COURSE_QUIZZES[course.id] ? `📹 ${course.videoUrls.length} Videos + Quiz` : `📹 ${course.videoUrls.length} Videos`)
                          : course.videoUrl ? (COURSE_QUIZZES[course.id] ? '📹 Video + Quiz' : '📹 Video') : (COURSE_QUIZZES[course.id] ? `${course.slides.length} slides + Quiz` : `${course.slides.length} slides`)}
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

            {/* ── Rushing Bonus + Hall of Flame Tracker (only visible once rushing-bonus is unlocked) ── */}
            {(() => {
              const nonBonusCourses = COURSES.filter(c => c.id !== 'rushing-bonus');
              const completedNonBonus = nonBonusCourses.filter(c => completedCourses.has(c.id)).length;
              const rushingComplete = completedCourses.has('rushing-bonus');
              const rushingUnlocked = isCourseUnlocked('rushing-bonus', completedCourses);
              const allDone = completedCourses.size >= COURSES.length;
              const completionPct = Math.round((completedCourses.size / COURSES.length) * 100);
              if (!rushingUnlocked) return null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
                  {/* Rushing Bonus Card */}
                  <button
                    onClick={() => rushingUnlocked && openCourse('rushing-bonus')}
                    disabled={!rushingUnlocked}
                    className={`text-left rounded-xl sm:rounded-2xl p-5 sm:p-6 transition-all group relative overflow-hidden ${
                      !rushingUnlocked
                        ? 'bg-[#111111] border border-[#A9ACAF]/15 cursor-not-allowed'
                        : 'bg-[#111111] border border-[#A9ACAF]/15 hover:border-[#A9ACAF]/30 hover:bg-[#1a1a1a]'
                    }`}
                    style={!rushingUnlocked ? {opacity: 0.55} : undefined}
                  >
                    {!rushingUnlocked && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 text-2xl" style={{opacity: 1}}>🔒</div>
                    )}
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
                    <p className="text-[#A9ACAF] text-xs sm:text-sm leading-relaxed">Tell us about yourself — earn your final 2,000 pts</p>
                    <div className="flex items-center gap-2 mt-3 sm:mt-4">
                      <div className="text-[10px] sm:text-xs text-[#666666]">📝 Survey</div>
                      <span className="text-[#3B4B3B]">·</span>
                      {rushingComplete ? (
                        <div className="text-[10px] sm:text-xs text-emerald-400 font-semibold">+2,000 pts earned</div>
                      ) : (
                        <div className="text-[10px] sm:text-xs text-[#c8a84b] font-semibold">+2,000 pts</div>
                      )}
                    </div>
                  </button>

                  {/* Certificate Card */}
                  <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 relative overflow-hidden border ${allDone ? 'border-[#c8a84b]/40 bg-gradient-to-br from-[#c8a84b]/15 to-[#151515]' : 'border-[#A9ACAF]/15 bg-[#111111]'}`}
                    style={!allDone ? {opacity: 0.55} : undefined}
                  >
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{background: allDone ? '#c8a84b' : '#555', opacity: allDone ? 1 : 0.5}} />
                    {!allDone && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 text-2xl" style={{opacity: 1}}>🔒</div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl sm:text-2xl">🏆</span>
                      <span className={`text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded ${allDone ? 'text-[#c8a84b] bg-[#c8a84b]/15' : 'text-[#666666] bg-[#111111]'}`}>
                        {allDone ? 'Certificate Earned' : 'Locked'}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1" style={{fontFamily: 'Teko, sans-serif', fontSize: 'clamp(1.2rem, 3vw, 1.5rem)', fontWeight: 700}}>
                      CERTIFICATE
                    </h3>
                    <p className="text-[#A9ACAF] text-xs sm:text-sm mb-4">
                      {allDone ? 'Congratulations! You completed all courses.' : `Complete all ${COURSES.length} modules to earn your certificate and the ${POINTS_ALL_COMPLETE_BONUS.toLocaleString()} pt bonus.`}
                    </p>

                    {allDone ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-full max-w-[280px] rounded-lg border border-[#c8a84b]/30 bg-black p-4 text-center">
                          <div className="text-[10px] uppercase tracking-[3px] text-[#c8a84b] mb-2">Highsman Budtender Training</div>
                          <div className="text-white font-bold text-sm mb-1" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.1rem'}}>CERTIFICATE OF COMPLETION</div>
                          <div className="h-[1px] bg-[#c8a84b] w-16 mx-auto mb-2" />
                          <div className="text-[#c8a84b] font-bold" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.3rem'}}>{userFullName || userName}</div>
                          <div className="text-[#A9ACAF] text-[10px] mt-1">HALL OF FLAME</div>
                        </div>
                        <button
                          onClick={generateCertificate}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition-all cursor-pointer"
                          style={{fontFamily: 'Teko, sans-serif', background: '#FFEB3B', color: '#000', border: 'none'}}
                        >
                          Download Certificate
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-full max-w-[280px] h-[160px] rounded-lg border border-[#A9ACAF]/15 bg-[#0a0a0a] flex items-center justify-center">
                          <span className="text-4xl">📜</span>
                        </div>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{width: `${completionPct}%`, background: '#555'}}
                            />
                          </div>
                          <span className="text-sm font-bold text-[#A9ACAF]" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.1rem'}}>
                            {completionPct}%
                          </span>
                        </div>
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
