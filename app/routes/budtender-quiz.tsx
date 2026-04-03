import type {MetaFunction} from '@shopify/remix-oxygen';
import {useState} from 'react';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Budtender Training'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// ── Quiz Data ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    q: "What is Highsman's official brand tagline, as it appears on all printed materials?",
    options: ['Hit Different', 'Smoke Better', 'SPARK GREATNESS™', 'Elevate Your Mind'],
    correct: 2,
  },
  {
    q: 'The Triple Infusion process uses a centrifuge spinning at a specific RPM. What is that number?',
    options: ['10,000 RPM', '5,000 RPM', '15,000 RPM', '7,500 RPM'],
    correct: 0,
  },
  {
    q: 'A customer says "I\'m interested in trying Highsman." According to the Assumptive Close technique, what is the ideal next question?',
    options: [
      'Are you sure you want to try it?',
      "What's your budget for this?",
      'Do you want the Hit Stick or the Pre Roll?',
      'Have you tried infused products before?',
    ],
    correct: 2,
  },
  {
    q: 'What is the primary functional purpose of applying heat to the Triple Infusion material, according to the brand materials?',
    options: [
      'Kill pathogens present in the raw cannabis',
      'Create a more uniform product appearance',
      'Release flavor volatiles from THCA complexes',
      'Seal the paper cone for consistent burning',
    ],
    correct: 2,
  },
  {
    q: 'Which Highsman SKU is described as the highest value for consumers who prefer to roll their own?',
    options: ['7g Ready To Roll Flower', '1.2g Pre Roll', '0.5g Hit Stick', '3.5g Ground Flower'],
    correct: 0,
  },
  {
    q: "The 'Floor Pitch' is designed to be delivered in a specific amount of time. What is the maximum time described?",
    options: ['45 seconds', '60 seconds', '30 seconds', '20 seconds'],
    correct: 2,
  },
  {
    q: 'Which statement about the kief coating on Highsman products is accurate according to the training materials?',
    options: [
      'Interior kief creates the Triple Infusion effect and is the key differentiator',
      'The kief is applied to the interior of the product to enhance flavor',
      'Exterior kief provides better visual shelf appeal but is mostly aesthetic',
      'The kief coating is the primary source of cannabinoid content',
    ],
    correct: 2,
  },
  {
    q: "The Highsman 'Floor Register' voice is instructed to lead with sensory outcomes. Which of these is an approved sensory benefit?",
    options: [
      'Processed at exactly 10,000 RPM for maximum density.',
      'Derived from a lineage of OG Kush and Durban Poison.',
      'Flavor that lasts the full smoke, not just the first hit.',
      'A complex terpene profile with high Myrcene content.',
    ],
    correct: 2,
  },
  {
    q: 'In the Triple Infusion liquid mixture, which ingredient is added and stirred after the initial blend of Live Resin, Terpenes, and THCA Isolate?',
    options: ['Butane Isolate', 'Ground Flower', 'Kief', 'THC Distillate'],
    correct: 3,
  },
  {
    q: 'What describes the physical state of the material immediately after being spun in the centrifuge?',
    options: [
      'A loose, dry powder.',
      'Individual pre-rolled sticks.',
      'A viscous, oily sludge.',
      "A dense, pliable 'puck' or 'cake'.",
    ],
    correct: 3,
  },
  {
    q: 'Which brand archetype best describes the Highsman identity according to the voice guidelines?',
    options: ['The Rebel', 'The High Performer', 'The Caregiver', 'The Sage'],
    correct: 1,
  },
];

const LETTERS = ['A', 'B', 'C', 'D'];
const KLAVIYO_PUBLIC_KEY = 'XiTH4j';
const BUDTENDER_LIST_ID = 'WBSrLZ';
const LOGO_URL =
  'https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png';
const SPARK_URL =
  'https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/020ea9cb-72e7-4f81-8cca-a2a70a4c9f16.png';

type Screen = 'gate' | 'quiz' | 'results';
interface UserAnswer {
  selected: number;
  correct: number;
  isCorrect: boolean;
}

// ── Klaviyo ──────────────────────────────────────────────────────────────────
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
                    budtender_quiz_signup: true,
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

// ── Component ────────────────────────────────────────────────────────────────
export default function BudtenderQuiz() {
  const [screen, setScreen] = useState<Screen>('gate');

  // Gate form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quiz state
  const [currentQ, setCurrentQ] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);

  // ── Gate submit ────────────────────────────────────────────────────────────
  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = 'Please enter a valid email address.';
    if (!state) newErrors.state = 'Please select your state.';
    if (!consent) newErrors.consent = 'Please agree to receive emails to continue.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    subscribeToKlaviyo(name.trim(), email.trim(), state);
    setScreen('quiz');
  }

  // ── Answer selection ───────────────────────────────────────────────────────
  function selectAnswer(idx: number) {
    if (answered) return;
    const q = QUESTIONS[currentQ];
    const isCorrect = idx === q.correct;
    setSelectedIdx(idx);
    setAnswered(true);
    if (isCorrect) setScore((s) => s + 1);
    setUserAnswers((prev) => [
      ...prev,
      {selected: idx, correct: q.correct, isCorrect},
    ]);
  }

  function nextQuestion() {
    if (currentQ + 1 >= QUESTIONS.length) {
      setScreen('results');
    } else {
      setCurrentQ((q) => q + 1);
      setAnswered(false);
      setSelectedIdx(null);
    }
  }

  function retake() {
    setScreen('quiz');
    setCurrentQ(0);
    setAnswered(false);
    setSelectedIdx(null);
    setScore(0);
    setUserAnswers([]);
  }

  const pct = Math.round((score / QUESTIONS.length) * 100);
  const passed = pct >= 80;
  const firstName = name.split(' ')[0];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-start py-10 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <img src={LOGO_URL} alt="Highsman" className="h-12 mx-auto mb-2" />
        <img src={SPARK_URL} alt="Spark Greatness" className="h-4 mx-auto opacity-80" />
        <div className="w-10 h-0.5 bg-[#c8a84b] mx-auto mt-4 mb-3" />
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#777]">
          Budtender Certification Quiz
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-xl bg-white rounded-xl shadow-xl p-8 md:p-10">

        {/* ── GATE ── */}
        {screen === 'gate' && (
          <form onSubmit={handleStart} noValidate>
            <h2 className="text-xl font-black mb-2 text-[#0a0a0a]">Know Your Product.</h2>
            <p className="text-sm text-[#555] mb-7 leading-relaxed">
              Before recommending Highsman, you need to understand it. Enter your details below to
              take the official budtender certification quiz — 11 questions, no time limit.
            </p>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#555] mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First and last name"
                className={`w-full px-4 py-3.5 border-2 rounded-lg text-sm outline-none transition-colors ${
                  errors.name ? 'border-red-500' : 'border-[#e8e8e8] focus:border-[#0a0a0a]'
                }`}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#555] mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="youremail@you.com"
                className={`w-full px-4 py-3.5 border-2 rounded-lg text-sm outline-none transition-colors ${
                  errors.email ? 'border-red-500' : 'border-[#e8e8e8] focus:border-[#0a0a0a]'
                }`}
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            {/* State */}
            <div className="mb-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#555] mb-1.5">
                Your State
              </label>
              <div className="relative">
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={`w-full px-4 py-3.5 border-2 rounded-lg text-sm outline-none transition-colors appearance-none bg-white cursor-pointer ${
                    errors.state ? 'border-red-500' : 'border-[#e8e8e8] focus:border-[#0a0a0a]'
                  } ${!state ? 'text-[#aaa]' : 'text-[#0a0a0a]'}`}
                >
                  <option value="">Select your state</option>
                  <option value="NY">New York (NY)</option>
                  <option value="NJ">New Jersey (NJ)</option>
                  <option value="MA">Massachusetts (MA)</option>
                  <option value="RI">Rhode Island (RI)</option>
                  <option value="MO">Missouri (MO)</option>
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M1 1l5 5 5-5" stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              {errors.state && <p className="text-xs text-red-500 mt-1">{errors.state}</p>}
            </div>

            {/* Consent */}
            <div
              className={`flex items-start gap-3 p-4 rounded-lg mb-5 cursor-pointer transition-colors ${
                errors.consent ? 'bg-red-50 border-2 border-red-400' : 'bg-[#f5f5f5] border-2 border-transparent'
              }`}
              onClick={() => setConsent((c) => !c)}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 w-4 h-4 accent-[#0a0a0a] cursor-pointer flex-shrink-0"
              />
              <p className="text-[13px] text-[#555] leading-snug cursor-pointer select-none">
                <strong className="text-[#0a0a0a]">I agree to receive marketing emails from Highsman.</strong>{' '}
                By checking this box you consent to receive budtender training updates, product news,
                and promotional emails. You can unsubscribe at any time.
              </p>
            </div>
            {errors.consent && <p className="text-xs text-red-500 -mt-3 mb-4">{errors.consent}</p>}

            <button
              type="submit"
              className="w-full bg-[#0a0a0a] text-white py-4 rounded-lg text-sm font-bold tracking-wide hover:bg-[#222] transition-colors"
            >
              Start Quiz →
            </button>
          </form>
        )}

        {/* ── QUIZ ── */}
        {screen === 'quiz' && (
          <div>
            {/* Progress */}
            <div className="flex items-center gap-3 mb-7">
              <div className="flex-1 h-1 bg-[#e8e8e8] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0a0a0a] rounded-full transition-all duration-500"
                  style={{width: `${(currentQ / QUESTIONS.length) * 100}%`}}
                />
              </div>
              <span className="text-xs font-semibold text-[#999] whitespace-nowrap">
                {currentQ + 1} / {QUESTIONS.length}
              </span>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c8a84b] mb-2">
              Question {currentQ + 1} of {QUESTIONS.length}
            </p>
            <p className="text-lg font-bold text-[#0a0a0a] leading-snug mb-6">
              {QUESTIONS[currentQ].q}
            </p>

            <div className="flex flex-col gap-2.5 mb-6">
              {QUESTIONS[currentQ].options.map((opt, i) => {
                const q = QUESTIONS[currentQ];
                let btnClass =
                  'w-full flex items-start gap-3 p-4 border-2 rounded-xl text-left transition-all ';
                let letterClass =
                  'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all mt-0.5 ';

                if (!answered) {
                  btnClass += 'border-[#e8e8e8] bg-white hover:border-[#0a0a0a] hover:bg-[#f5f5f5] cursor-pointer';
                  letterClass += 'bg-[#e8e8e8] text-[#555]';
                } else if (i === q.correct) {
                  btnClass += 'border-green-600 bg-green-50';
                  letterClass += 'bg-green-600 text-white';
                } else if (i === selectedIdx && !q.correct) {
                  btnClass += 'border-red-500 bg-red-50';
                  letterClass += 'bg-red-500 text-white';
                } else if (i === selectedIdx) {
                  btnClass += 'border-red-500 bg-red-50';
                  letterClass += 'bg-red-500 text-white';
                } else {
                  btnClass += 'border-[#e8e8e8] bg-white opacity-40';
                  letterClass += 'bg-[#e8e8e8] text-[#555]';
                }

                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(i)}
                    disabled={answered}
                    className={btnClass}
                  >
                    <span className={letterClass}>{LETTERS[i]}</span>
                    <span className="text-sm font-medium text-[#0a0a0a] leading-relaxed">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            {answered && (
              <div
                className={`p-4 rounded-xl mb-6 text-sm font-medium ${
                  selectedIdx === QUESTIONS[currentQ].correct
                    ? 'bg-green-50 border-2 border-green-600 text-green-800'
                    : 'bg-red-50 border-2 border-red-500 text-red-700'
                }`}
              >
                {selectedIdx === QUESTIONS[currentQ].correct ? (
                  <span>✓ <strong>That&apos;s right!</strong></span>
                ) : (
                  <span>
                    ✗ <strong>Not quite.</strong> The correct answer is{' '}
                    <strong>
                      {LETTERS[QUESTIONS[currentQ].correct]}. {QUESTIONS[currentQ].options[QUESTIONS[currentQ].correct]}
                    </strong>
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={nextQuestion}
                disabled={!answered}
                className="bg-[#0a0a0a] text-white px-6 py-3 rounded-lg text-sm font-bold tracking-wide hover:bg-[#222] transition-colors disabled:bg-[#e8e8e8] disabled:text-[#999] disabled:cursor-not-allowed"
              >
                {currentQ < QUESTIONS.length - 1 ? 'Next →' : 'See Results →'}
              </button>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {screen === 'results' && (
          <div>
            <div className="text-center mb-8">
              <div className="inline-flex flex-col items-center justify-center w-32 h-32 rounded-full bg-[#0a0a0a] mb-4">
                <span className="text-4xl font-black text-white leading-none">{score}</span>
                <span className="text-sm text-[#666] leading-none">/ {QUESTIONS.length}</span>
              </div>
              <p className="text-2xl font-black text-[#0a0a0a] mb-1">{pct}%</p>
              <p className={`text-sm font-bold uppercase tracking-widest ${passed ? 'text-green-600' : 'text-red-500'}`}>
                {passed ? 'Certified ✓' : 'Keep Studying'}
              </p>
            </div>

            <div className="bg-[#f5f5f5] rounded-xl p-6 text-center mb-6">
              <h3 className="text-lg font-black text-[#0a0a0a] mb-2">
                {pct === 100
                  ? `Perfect score, ${firstName}.`
                  : passed
                  ? `Well done, ${firstName}.`
                  : `Not there yet, ${firstName}.`}
              </h3>
              <p className="text-sm text-[#555] leading-relaxed">
                {pct === 100
                  ? "You know Highsman inside and out. You're ready to spark greatness on the floor."
                  : passed
                  ? `You passed with ${pct}%. You know the product and you're ready to represent it on the floor.`
                  : `You scored ${pct}%. Review the training materials and try again — you need 80% to certify.`}
              </p>
            </div>

            {/* Review */}
            <div className="flex flex-col gap-2.5 mb-6">
              {userAnswers.map((ans, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 text-sm ${
                    ans.isCorrect
                      ? 'bg-green-50 border-green-600'
                      : 'bg-red-50 border-red-400'
                  }`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{ans.isCorrect ? '✓' : '✗'}</span>
                  <div>
                    <p className="font-semibold text-[#0a0a0a] mb-1">{QUESTIONS[i].q}</p>
                    <p className="text-xs text-[#555]">
                      {ans.isCorrect ? (
                        <span>
                          <strong>Correct</strong> — {LETTERS[ans.correct]}. {QUESTIONS[i].options[ans.correct]}
                        </span>
                      ) : (
                        <>
                          Your answer: {LETTERS[ans.selected]}. {QUESTIONS[i].options[ans.selected]}
                          <br />
                          Correct: <strong>{LETTERS[ans.correct]}. {QUESTIONS[i].options[ans.correct]}</strong>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={retake}
              className="w-full bg-[#0a0a0a] text-white py-4 rounded-lg text-sm font-bold tracking-wide hover:bg-[#222] transition-colors"
            >
              Retake Quiz
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-[#444] mt-6">
        © Highsman &nbsp;·&nbsp; For internal training use only
      </p>
    </div>
  );
}
