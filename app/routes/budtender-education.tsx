import type {MetaFunction} from '@shopify/remix-oxygen';
import {useState, useEffect, useRef} from 'react';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Budtender Education'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

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
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  icon: string;
  color: string;
  slides: CourseSlide[];
  audioSummary: string;
  quizLink?: string;
}

const COURSES: Course[] = [
  {
    id: 'meet-ricky',
    title: 'Meet Ricky',
    subtitle: "Ricky Williams' journey — from the NFL to cannabis",
    duration: '5 min',
    level: 'Beginner',
    icon: '🏈',
    color: '#c8a84b',
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to Meet Ricky',
        content:
          'This course is a brand video that takes you through Ricky Williams\' journey — from Heisman Trophy winner and NFL star to cannabis advocate and founder of Highsman. Highsman sits at the intersection of Sports and Cannabis.',
        keyPoints: [
          'Video coming soon — check back shortly',
          'Ricky Williams: Heisman winner, NFL star, cannabis pioneer',
          'Highsman = Sports × Cannabis',
          'Quiz will follow once the video is live',
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
  {
    id: 'meet-highsman',
    title: 'Meet Highsman',
    subtitle: 'The brand — where we came from and what we stand for',
    duration: '8 min',
    level: 'Beginner',
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
  {
    id: 'the-science',
    title: 'The Science',
    subtitle: 'Triple Infusion — the process that sets us apart',
    duration: '15 min',
    level: 'Intermediate',
    icon: '🔬',
    color: '#059669',
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
    id: 'the-products',
    title: 'The Products',
    subtitle: 'Know every SKU inside and out',
    duration: '12 min',
    level: 'Beginner',
    icon: '📦',
    color: '#dc2626',
    audioSummary: '',
    slides: [
      {
        title: 'Welcome to The Products',
        content:
          'This course covers every Highsman product in detail — what it is, who it is for, and how to sell it. Full product deep-dives and a quiz are coming soon. For now, here is a quick overview of the lineup.',
        keyPoints: [
          'Detailed product content coming soon',
          'Quiz will be added once content is finalized',
          'Learn the lineup so you can match product to customer',
        ],
      },
      {
        title: 'Ground Game — 7G Ready To Roll Flower',
        content:
          'Ground Game is Highsman\'s premium flower product — 7 grams of Triple Infused flower for consumers who prefer to roll their own. It is the highest-value SKU in the lineup and a great entry point for new customers.',
        keyPoints: [
          '7 grams of Triple Infused flower',
          'Highest value SKU for roll-your-own consumers',
          'Premium quality at a compelling price point',
          'Great for daily consumers',
        ],
      },
      {
        title: 'Triple Threat — 1.2G Pre Roll',
        content:
          'Triple Threat is the flagship pre-roll — 1.2 grams of Triple Infused goodness, ready to spark. This is the product that showcases the full Triple Infusion process at its best.',
        keyPoints: [
          '1.2 grams per pre-roll',
          'Full Triple Infusion process',
          'Showcase product for new customers',
          'Perfect for the "try before you commit" buyer',
        ],
      },
      {
        title: 'Hit Sticks — 0.5G Pre Roll',
        content:
          'Hit Sticks are the grab-and-go option — 0.5 grams of Triple Infused pre-roll. Lower commitment, same premium quality. Ideal for customers who want a quick session or are trying Highsman for the first time.',
        keyPoints: [
          '0.5 grams — compact and convenient',
          'Same Triple Infusion quality',
          'Perfect trial product',
          'Lower price point, easy impulse buy',
        ],
      },
      {
        title: 'Selling the Lineup',
        content:
          'Every customer interaction should match the product to their need. Roll-your-own? Ground Game. Want the full experience? Triple Threat. Quick session or first timer? Hit Stick. Always use the assumptive close.',
        keyPoints: [
          'Match product to consumption style',
          'Always recommend up: "Single or two-pack?"',
          'Use the 10-second intercept for switching brands',
          '"Hey — before you order, we\'re running a great deal today."',
        ],
      },
    ],
  },
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
  // The Products — quiz coming once content is finalized
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
type Screen = 'gate' | 'portal';

export default function BudtenderEducation() {
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

  const [screen, setScreen] = useState<Screen>('gate');
  const [userName, setUserName] = useState('');

  // Gate
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [dispensary, setDispensary] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const portalRef = useRef<HTMLDivElement>(null);

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
    setUserName(name.split(' ')[0]);
    setScreen('portal');
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
        setCompletedCourses(new Set([...completedCourses, courseQuizActive]));
      }
    }
  }

  function registerEvent(idx: number) {
    setRegisteredEvents(new Set([...registeredEvents, idx]));
  }

  // ── GATE SCREEN ─────────────────────────────────────────────────────────────
  if (screen === 'gate') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Budtender Education Portal
            </h1>
            <div className="w-12 h-0.5 bg-[#c8a84b] mx-auto mt-3 mb-4" />
            <p className="text-[#999] text-sm leading-relaxed">
              Exclusive training courses, product knowledge, and sales tools
              for authorized Highsman budtenders.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleGateSubmit} className="bg-white rounded-xl p-6 md:p-8 shadow-2xl">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm text-black outline-none transition-colors ${
                    errors.name ? 'border-red-400 bg-red-50' : 'border-[#ddd] focus:border-[#c8a84b]'
                  }`}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dispensary.com"
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm text-black outline-none transition-colors ${
                    errors.email ? 'border-red-400 bg-red-50' : 'border-[#ddd] focus:border-[#c8a84b]'
                  }`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              {/* State */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">
                  State
                </label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm text-black outline-none transition-colors bg-white ${
                    errors.state ? 'border-red-400 bg-red-50' : 'border-[#ddd] focus:border-[#c8a84b]'
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
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">
                  Dispensary Name <span className="text-[#999] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={dispensary}
                  onChange={(e) => setDispensary(e.target.value)}
                  placeholder="Where do you work?"
                  className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm text-black outline-none transition-colors focus:border-[#c8a84b]"
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
                <span className="text-xs text-[#666] leading-relaxed">
                  I agree to receive training updates and exclusive budtender offers from Highsman via email.
                </span>
              </label>
              {errors.consent && <p className="text-red-500 text-xs mt-0.5 ml-1">{errors.consent}</p>}
            </div>

            <button
              type="submit"
              className="w-full mt-6 py-3 bg-[#0a0a0a] text-white font-semibold text-sm rounded-lg hover:bg-[#222] transition-colors"
            >
              ACCESS TRAINING PORTAL
            </button>
          </form>

          <p className="text-center text-[#555] text-[10px] mt-6">
            © Highsman · For authorized budtender use only
          </p>
        </div>
      </div>
    );
  }

  // ── PORTAL SCREEN ───────────────────────────────────────────────────────────
  const currentCourse = COURSES.find((c) => c.id === activeCourse);

  return (
    <div ref={portalRef} className="min-h-screen bg-[#0a0a0a]">
      {/* ── Sub-Header (below global nav) ────────────────────────────────── */}
      <div className="bg-[#111] border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#c8a84b]/20 flex items-center justify-center">
              <span className="text-[#c8a84b] text-xs font-bold">BE</span>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold text-white tracking-wide">Budtender Education</div>
              <div className="text-[10px] text-[#666] uppercase tracking-wider hidden sm:block">Highsman Training Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-[10px] sm:text-xs text-[#999]">
              {completedCourses.size}/{COURSES.length} completed
            </span>
            <div className="w-16 sm:w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#c8a84b] rounded-full transition-all duration-500"
                style={{width: `${(completedCourses.size / COURSES.length) * 100}%`}}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Course Viewer (when a course is open) ──────────────────────────── */}
      {currentCourse && !courseQuizActive ? (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Back button */}
          <button
            onClick={closeCourse}
            className="text-[#888] text-xs sm:text-sm hover:text-white transition-colors mb-5 sm:mb-6 flex items-center gap-2"
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
            <p className="text-[#888] text-xs sm:text-sm mt-1">{currentCourse.subtitle}</p>
          </div>

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
          <div className="bg-[#151515] border border-white/8 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-10 mb-5 sm:mb-6">
            <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#777] mb-2">
              Slide {slideIndex + 1} of {currentCourse.slides.length}
            </div>
            <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-3 sm:mb-4">
              {currentCourse.slides[slideIndex].title}
            </h3>
            <p className="text-[#bbb] text-sm sm:text-base leading-relaxed mb-5 sm:mb-6">
              {currentCourse.slides[slideIndex].content}
            </p>
            {currentCourse.slides[slideIndex].keyPoints && (
              <div className="bg-white/5 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#c8a84b] font-bold mb-2 sm:mb-3">
                  Key Takeaways
                </div>
                {currentCourse.slides[slideIndex].keyPoints!.map((point, i) => (
                  <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                    <span className="text-[#c8a84b] mt-0.5 text-xs sm:text-sm">▸</span>
                    <span className="text-[#ccc] text-xs sm:text-sm leading-relaxed">{point}</span>
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
              className="px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg border border-white/15 text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                  setCompletedCourses(prev => new Set([...prev, currentCourse.id]));
                  setActiveCourse(null);
                  setSlideIndex(0);
                }}
                className="px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-lg text-white transition-colors"
                style={{background: currentCourse.color}}
              >
                Complete Course ✓
              </button>
            )}
          </div>

          {/* Audio summary */}
          <div className="mt-8 bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                style={{background: currentCourse.color + '30'}}
              >
                🎧
              </div>
              <div className="flex-1">
                <div className="text-white text-sm font-semibold">Audio Overview</div>
                <div className="text-[#999] text-xs">Listen to a summary of this course</div>
              </div>
              <div className="text-[#999] text-xs px-3 py-1 bg-white/5 rounded-full">
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
            className="text-[#888] text-xs sm:text-sm hover:text-white transition-colors mb-5 sm:mb-6 flex items-center gap-2"
          >
            ← Back to course
          </button>

          {!quizComplete ? (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">
                {COURSES.find((c) => c.id === courseQuizActive)?.title} — Quiz
              </h2>
              <div className="text-[#999] text-sm mb-6">
                Question {quizQ + 1} of {COURSE_QUIZZES[courseQuizActive].length}
              </div>

              {/* Progress */}
              <div className="w-full h-1 bg-white/10 rounded-full mb-8">
                <div
                  className="h-full bg-[#c8a84b] rounded-full transition-all duration-500"
                  style={{width: `${((quizQ + 1) / COURSE_QUIZZES[courseQuizActive].length) * 100}%`}}
                />
              </div>

              {/* Question */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
                <p className="text-white font-semibold mb-6">{COURSE_QUIZZES[courseQuizActive][quizQ].q}</p>
                <div className="space-y-3">
                  {COURSE_QUIZZES[courseQuizActive][quizQ].options.map((opt, i) => {
                    const isCorrect = i === COURSE_QUIZZES[courseQuizActive][quizQ].correct;
                    const isSelected = quizSelected === i;
                    let btnClass = 'border-white/20 text-[#ddd] hover:bg-white/5';
                    if (quizAnswered) {
                      if (isCorrect) btnClass = 'border-emerald-500 bg-emerald-500/10 text-emerald-400';
                      else if (isSelected) btnClass = 'border-red-500 bg-red-500/10 text-red-400';
                      else btnClass = 'border-white/10 text-[#666]';
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
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 md:p-12">
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
                <p className="text-[#999] text-sm mb-6">
                  {quizScore >= Math.ceil(COURSE_QUIZZES[courseQuizActive].length * 0.66)
                    ? `Nice work, ${userName}! You\'ve earned your badge for this course.`
                    : `Review the slides and try again, ${userName}. You need 66% to pass.`}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => startCourseQuiz(courseQuizActive)}
                    className="px-5 py-2.5 text-sm border border-white/20 text-white rounded-lg hover:bg-white/5 transition-colors"
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
          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#c8a84b]/8 via-transparent to-[#c8a84b]/3" />
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#c8a84b]/5 to-transparent hidden md:block" />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-24 relative">
              <div className="max-w-2xl">
                <div className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-[#c8a84b] font-semibold mb-4">
                  Welcome back, {userName}
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white leading-tight mb-5">
                  Become a Certified{' '}
                  <span className="text-[#c8a84b]">Highsman</span>{' '}
                  Expert
                </h1>
                <p className="text-[#aaa] text-sm sm:text-base md:text-lg leading-relaxed mb-10 max-w-xl">
                  Master our products, perfect your pitch, and unlock exclusive
                  budtender rewards. Complete all courses to earn your Highsman
                  Certified status.
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-4 sm:gap-8">
                  <div>
                    <div className="text-xl sm:text-2xl font-bold text-white">{COURSES.length}</div>
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#777] mt-0.5">Courses</div>
                  </div>
                  <div className="w-px h-8 sm:h-10 bg-white/10" />
                  <div>
                    <div className="text-xl sm:text-2xl font-bold text-white">{completedCourses.size}</div>
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#777] mt-0.5">Completed</div>
                  </div>
                  <div className="w-px h-8 sm:h-10 bg-white/10" />
                  <div>
                    <div className="text-xl sm:text-2xl font-bold text-[#c8a84b]">
                      {completedCourses.size === COURSES.length ? '✓' : '—'}
                    </div>
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#777] mt-0.5">Certified</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Course Grid ──────────────────────────────────────────────── */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
            <div className="flex items-center justify-between mb-6 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-bold text-white">Training Courses</h2>
              <span className="text-[10px] sm:text-xs text-[#777]">{completedCourses.size} of {COURSES.length} complete</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {COURSES.map((course, idx) => {
                const isComplete = completedCourses.has(course.id);
                return (
                  <button
                    key={course.id}
                    onClick={() => openCourse(course.id)}
                    className="text-left bg-[#151515] border border-white/8 rounded-xl sm:rounded-2xl p-5 sm:p-6 hover:border-[#c8a84b]/30 hover:bg-[#1a1a1a] transition-all group relative overflow-hidden"
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
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#555]">
                          {course.duration}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-[#c8a84b] transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-[#888] text-xs sm:text-sm leading-relaxed">{course.subtitle}</p>
                    <div className="flex items-center gap-2 mt-3 sm:mt-4">
                      <div className="text-[10px] sm:text-xs text-[#555]">
                        {(course.id === 'meet-ricky' || course.id === 'meet-highsman') ? '📹 Video' : `${course.slides.length} slides`}
                      </div>
                      <span className="text-[#333]">·</span>
                      <div className="text-[10px] sm:text-xs text-[#555]">
                        {COURSE_QUIZZES[course.id] ? 'Quiz included' : 'Quiz coming soon'}
                      </div>
                    </div>
                    {/* Progress bar */}
                    {!isComplete && (
                      <div className="w-full h-[2px] bg-white/5 rounded-full mt-3 sm:mt-4">
                        <div className="h-full rounded-full" style={{background: course.color, width: '0%'}} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Full certification quiz link */}
            <div className="mt-6 sm:mt-8 bg-[#151515] border border-[#c8a84b]/20 rounded-xl sm:rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <h3 className="text-base sm:text-lg font-bold text-white mb-1">Ready for the Full Certification?</h3>
                <p className="text-[#888] text-xs sm:text-sm">
                  Complete the comprehensive 11-question Highsman Certification Quiz to prove your mastery.
                </p>
              </div>
              <a
                href="/budtender-quiz"
                className="w-full sm:w-auto text-center px-6 py-3 bg-[#c8a84b] text-black font-bold text-xs sm:text-sm rounded-lg hover:bg-[#d4b65c] transition-colors whitespace-nowrap"
              >
                Take Certification Quiz →
              </a>
            </div>
          </section>

          {/* ── Budtenders Only Section ───────────────────────────────────── */}
          <section className="border-t border-white/8 bg-[#0d0d0d]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
              <div className="text-center mb-8 sm:mb-12">
                <div className="inline-block px-3 py-1 bg-[#c8a84b]/10 border border-[#c8a84b]/20 rounded-full text-[9px] sm:text-[10px] uppercase tracking-widest text-[#c8a84b] font-bold mb-4">
                  Budtenders Only
                </div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">
                  Exclusive Events & Competitions
                </h2>
                <p className="text-[#888] text-xs sm:text-sm max-w-md mx-auto">
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
                      className="bg-[#151515] border border-white/8 rounded-xl sm:rounded-2xl p-5 sm:p-6"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-[9px] sm:text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded ${tagColors[event.tag] || 'text-[#999]'}`}>
                          {event.tag}
                        </span>
                        <span className="text-[10px] sm:text-xs text-[#555]">{event.date}</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1">{event.title}</h3>
                      <p className="text-[#777] text-[10px] sm:text-xs mb-1">{event.location}</p>
                      <p className="text-[#aaa] text-xs sm:text-sm leading-relaxed mb-4">{event.description}</p>
                      <button
                        onClick={() => registerEvent(i)}
                        disabled={isRegistered}
                        className={`w-full py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                          isRegistered
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                            : 'bg-white/8 text-white hover:bg-white/12 border border-white/15'
                        }`}
                      >
                        {isRegistered ? 'Registered ✓' : 'Register Interest'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Monthly Prize Banner */}
              <div className="mt-6 sm:mt-8 bg-[#151515] border border-[#c8a84b]/20 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                <div className="text-2xl sm:text-3xl mb-3">🏆</div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Monthly Sales Competition</h3>
                <p className="text-[#aaa] text-xs sm:text-sm max-w-lg mx-auto mb-4">
                  Top-selling Highsman budtender each month wins <span className="text-[#c8a84b] font-bold">$500 cash</span> + a signed Ricky Williams jersey.
                  Track your sales and submit your numbers weekly.
                </p>
                <div className="text-[#777] text-[10px] sm:text-xs">
                  Contact your Highsman rep or email <span className="text-[#c8a84b]">team@highsman.com</span> to submit sales numbers.
                </div>
              </div>
            </div>
          </section>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer className="border-t border-white/5 py-6 sm:py-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-3 sm:gap-4">
              <img src={SPARK_URL} alt="Spark Greatness" className="h-5 sm:h-6 opacity-40" />
              <p className="text-[#444] text-[9px] sm:text-[10px] text-center">
                © Highsman · For authorized budtender use only · Not for public distribution
              </p>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
