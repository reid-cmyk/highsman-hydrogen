import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form} from '@remix-run/react';
import {json} from '@shopify/remix-oxygen';
import {useState, useEffect} from 'react';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Staff Dashboard'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// ── Constants ────────────────────────────────────────────────────────────────
const KLAVIYO_LIST_ID = 'WBSrLZ';
const COURSE_COMPLETED_METRIC_ID = 'UwTaBd';
const SIGNUP_METRIC_ID = 'Uir9Fc';

const COURSE_ORDER = [
  {id: 'meet-ricky', title: 'Meet Ricky', level: 'Rookie'},
  {id: 'meet-highsman', title: 'Highsman Brand Training', level: 'Starting Lineup'},
  {id: 'the-science', title: 'The Science', level: 'Franchise Player'},
  {id: 'product-training', title: 'Highsman Product Training', level: 'Hall of Flame'},
  {id: 'rushing-bonus', title: 'Rushing Bonus', level: 'Hall of Flame'},
];

const TIER_NAMES = ['Unsigned', 'Rookie', 'Starting Lineup', 'Franchise Player', 'Hall of Flame'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function computeTier(completedCourses: Set<string>): string {
  const allDone = completedCourses.size >= COURSE_ORDER.length;
  const franchDone = completedCourses.has('meet-ricky') && completedCourses.has('meet-highsman') && completedCourses.has('the-science');
  const startDone = completedCourses.has('meet-ricky') && completedCourses.has('meet-highsman');
  const rookDone = completedCourses.has('meet-ricky');
  if (allDone) return 'Hall of Flame';
  if (franchDone) return 'Franchise Player';
  if (startDone) return 'Starting Lineup';
  if (rookDone) return 'Rookie';
  return 'Unsigned';
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Klaviyo API fetch helper ────────────────────────────────────────────────
async function klaviyoFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: 'application/json',
      revision: '2024-10-15',
    },
  });
  if (!res.ok) throw new Error(`Klaviyo API error: ${res.status}`);
  return res.json();
}

async function fetchAllPages(baseUrl: string, apiKey: string) {
  const results: any[] = [];
  let url: string | null = baseUrl;
  while (url) {
    const data = await klaviyoFetch(url, apiKey);
    results.push(...(data.data || []));
    url = data.links?.next || null;
  }
  return results;
}

// ── Types ────────────────────────────────────────────────────────────────────
type BudtenderRow = {
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  dispensary: string;
  state: string;
  currentTier: string;
  coursesCompleted: number;
  lastActivityDate: string;
  daysSinceLastActivity: number;
  signupDate: string;
  completedCourseIds: string[];
};

// ── Action (password check) ─────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get('password') as string;
  const correctPassword = context.env.STAFF_DASHBOARD_PASSWORD || 'highsman2026';

  if (password === correctPassword) {
    // Set a simple auth cookie
    return json(
      {authenticated: true, error: null},
      {
        headers: {
          'Set-Cookie': `staff_auth=1; Path=/staff-dashboard; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
      },
    );
  }
  return json({authenticated: false, error: 'Incorrect password'});
}

// ── Loader ──────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  // Check auth cookie
  const cookie = request.headers.get('Cookie') || '';
  const isAuth = cookie.includes('staff_auth=1');
  if (!isAuth) {
    return json({authenticated: false, budtenders: [], summary: null});
  }

  const apiKey = context.env.KLAVIYO_PRIVATE_KEY;
  if (!apiKey) {
    return json({
      authenticated: true,
      budtenders: [],
      summary: null,
      error: 'KLAVIYO_PRIVATE_KEY not configured in Oxygen env vars.',
    });
  }

  try {
    // 1. Fetch all profiles on the Budtenders list
    const profilesUrl = `https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/profiles/?fields[profile]=email,first_name,last_name,properties,created&page[size]=100`;
    const profiles = await fetchAllPages(profilesUrl, apiKey);

    // 2. Fetch all course completion events
    const eventsUrl = `https://a.klaviyo.com/api/events/?filter=equals(metric_id,"${COURSE_COMPLETED_METRIC_ID}")&fields[event]=event_properties,datetime&page[size]=100&sort=-datetime`;
    const events = await fetchAllPages(eventsUrl, apiKey);

    // 3. Build a map of profile_id → events
    const eventsByProfile = new Map<string, any[]>();
    for (const ev of events) {
      const pid = ev.relationships?.profile?.data?.id;
      if (!pid) continue;
      if (!eventsByProfile.has(pid)) eventsByProfile.set(pid, []);
      eventsByProfile.get(pid)!.push(ev);
    }

    // 4. Build budtender rows
    const now = new Date();
    const budtenders: BudtenderRow[] = profiles.map((p: any) => {
      const pid = p.id;
      const attrs = p.attributes || {};
      const props = attrs.properties || {};
      const profileEvents = eventsByProfile.get(pid) || [];

      // Determine completed courses from events
      const completedCourseIds = new Set<string>();
      let lastActivityDate = attrs.created || now.toISOString();

      for (const ev of profileEvents) {
        const ep = ev.attributes?.eventProperties || {};
        if (ep.course_id) completedCourseIds.add(ep.course_id);
        const dt = ev.attributes?.datetime;
        if (dt && dt > lastActivityDate) lastActivityDate = dt;
      }

      // If they have events, use the most recent one's datetime
      if (profileEvents.length > 0) {
        // Events are sorted -datetime, so first is most recent
        const mostRecent = profileEvents[0]?.attributes?.datetime;
        if (mostRecent) lastActivityDate = mostRecent;
      }

      const tier = computeTier(completedCourseIds);
      const lastDate = new Date(lastActivityDate);
      const daysSince = daysBetween(lastDate, now);

      return {
        profileId: pid,
        firstName: attrs.first_name || '',
        lastName: attrs.last_name || '',
        email: attrs.email || '',
        dispensary: props.dispensary_name || '',
        state: props.budtender_state || '',
        currentTier: tier,
        coursesCompleted: completedCourseIds.size,
        lastActivityDate: lastActivityDate,
        daysSinceLastActivity: daysSince,
        signupDate: attrs.created || '',
        completedCourseIds: Array.from(completedCourseIds),
      };
    });

    // 5. Summary counts
    const tierCounts: Record<string, number> = {};
    for (const t of TIER_NAMES) tierCounts[t] = 0;
    for (const b of budtenders) {
      tierCounts[b.currentTier] = (tierCounts[b.currentTier] || 0) + 1;
    }

    // Sort by days since activity descending (most stale first)
    budtenders.sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);

    return json({
      authenticated: true,
      budtenders,
      summary: {
        total: profiles.length,
        tierCounts,
        avgDaysSinceActivity: budtenders.length
          ? Math.round(budtenders.reduce((s, b) => s + b.daysSinceLastActivity, 0) / budtenders.length)
          : 0,
      },
    });
  } catch (err: any) {
    return json({
      authenticated: true,
      budtenders: [],
      summary: null,
      error: `Failed to fetch data: ${err.message}`,
    });
  }
}

// ── Component ───────────────────────────────────────────────────────────────
export default function StaffDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // After successful login action, reload to trigger authenticated loader
  useEffect(() => {
    if (actionData?.authenticated) {
      window.location.reload();
    }
  }, [actionData]);

  const isAuth = loaderData.authenticated;

  // Load Teko font
  useEffect(() => {
    if (document.getElementById('teko-font-link')) return;
    const link = document.createElement('link');
    link.id = 'teko-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  if (!isAuth) {
    return <LoginScreen error={actionData?.error} />;
  }

  if ((loaderData as any).error) {
    return (
      <Shell>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
          <p className="text-red-400 text-lg font-bold mb-2">Configuration Error</p>
          <p className="text-[#A9ACAF]">{(loaderData as any).error}</p>
        </div>
      </Shell>
    );
  }

  const {budtenders, summary} = loaderData as any;

  return (
    <Shell>
      <DashboardContent budtenders={budtenders} summary={summary} />
    </Shell>
  );
}

// ── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({error}: {error?: string | null}) {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png"
            alt="Highsman"
            className="mx-auto mb-6"
            style={{width: 140}}
          />
          <h1
            className="text-white text-2xl uppercase tracking-wider mb-1"
            style={{fontFamily: 'Teko, sans-serif', fontWeight: 700}}
          >
            STAFF DASHBOARD
          </h1>
          <p className="text-[#A9ACAF] text-sm">Enter your password to access</p>
        </div>
        <Form method="post" className="space-y-4">
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b] transition-colors"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider cursor-pointer"
            style={{fontFamily: 'Teko, sans-serif', background: '#c8a84b', color: '#000', fontSize: '1.1rem', border: 'none'}}
          >
            LOGIN
          </button>
        </Form>
      </div>
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────
function Shell({children}: {children: React.ReactNode}) {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <img
              src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png"
              alt="Highsman"
              style={{width: 120}}
            />
            <div>
              <h1
                className="text-xl sm:text-2xl uppercase tracking-wider"
                style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, color: '#c8a84b'}}
              >
                BUDTENDER TRAINING DASHBOARD
              </h1>
              <p className="text-[#A9ACAF] text-xs uppercase tracking-widest">Internal — Staff Only</p>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Tier Colors ─────────────────────────────────────────────────────────────
const TIER_COLORS: Record<string, {bg: string; border: string; text: string}> = {
  Unsigned: {bg: 'rgba(169,172,175,0.08)', border: 'rgba(169,172,175,0.2)', text: '#A9ACAF'},
  Rookie: {bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', text: '#3B82F6'},
  'Starting Lineup': {bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.3)', text: '#A855F7'},
  'Franchise Player': {bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.3)', text: '#EAB308'},
  'Hall of Flame': {bg: 'rgba(200,168,75,0.12)', border: 'rgba(200,168,75,0.4)', text: '#c8a84b'},
};

// ── Dashboard Content ───────────────────────────────────────────────────────
function DashboardContent({budtenders, summary}: {budtenders: BudtenderRow[]; summary: any}) {
  const [filterTier, setFilterTier] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = budtenders.filter((b: BudtenderRow) => {
    if (filterTier !== 'All' && b.currentTier !== filterTier) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const fullName = `${b.firstName} ${b.lastName}`.toLowerCase();
      return fullName.includes(q) || b.email.toLowerCase().includes(q) || b.dispensary.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {/* Total */}
        <div className="bg-[#111] border border-[#A9ACAF]/15 rounded-xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">Total Enrolled</div>
          <div className="text-3xl font-bold text-white" style={{fontFamily: 'Teko, sans-serif'}}>{summary.total}</div>
        </div>
        {/* Per-tier counts */}
        {TIER_NAMES.map((tier) => {
          const colors = TIER_COLORS[tier];
          return (
            <div
              key={tier}
              className="rounded-xl p-4 text-center cursor-pointer transition-all hover:scale-105"
              style={{background: colors.bg, border: `1px solid ${colors.border}`}}
              onClick={() => setFilterTier(filterTier === tier ? 'All' : tier)}
            >
              <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{color: colors.text}}>
                {tier}
              </div>
              <div className="text-3xl font-bold" style={{fontFamily: 'Teko, sans-serif', color: colors.text}}>
                {summary.tierCounts[tier] || 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or dispensary..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 w-full sm:w-auto px-4 py-2 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b] transition-colors"
        />
        <div className="flex flex-wrap gap-2">
          {['All', ...TIER_NAMES].map((tier) => (
            <button
              key={tier}
              onClick={() => setFilterTier(tier)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              style={{
                fontFamily: 'Teko, sans-serif',
                fontSize: '0.85rem',
                background: filterTier === tier ? '#c8a84b' : '#111',
                color: filterTier === tier ? '#000' : '#A9ACAF',
                border: filterTier === tier ? '1px solid #c8a84b' : '1px solid rgba(169,172,175,0.2)',
              }}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="text-[#666] text-xs mb-3 uppercase tracking-wider">
        Showing {filtered.length} of {budtenders.length} budtenders
        {filterTier !== 'All' && <span className="text-[#c8a84b]"> — {filterTier}</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold">Name</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold hidden sm:table-cell">Dispensary</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold hidden md:table-cell">State</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold">Current Tier</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold">Courses</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold">Days Stale</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold hidden lg:table-cell">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b: BudtenderRow) => {
              const colors = TIER_COLORS[b.currentTier] || TIER_COLORS.Unsigned;
              const staleDanger = b.daysSinceLastActivity >= 7;
              const staleWarning = b.daysSinceLastActivity >= 3 && b.daysSinceLastActivity < 7;
              return (
                <tr
                  key={b.profileId}
                  className="border-b border-[#A9ACAF]/8 hover:bg-[#111] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="text-white font-semibold">
                      {b.firstName} {b.lastName}
                    </div>
                    <div className="text-[#666] text-xs sm:hidden">{b.dispensary}</div>
                    <div className="text-[#555] text-xs">{b.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[#A9ACAF] hidden sm:table-cell">{b.dispensary || '—'}</td>
                  <td className="px-4 py-3 text-[#A9ACAF] hidden md:table-cell">{b.state || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider"
                      style={{background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`}}
                    >
                      {b.currentTier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-white font-bold" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.2rem'}}>
                      {b.coursesCompleted}
                    </span>
                    <span className="text-[#666]">/{COURSE_ORDER.length}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                      style={{
                        background: staleDanger ? 'rgba(239,68,68,0.15)' : staleWarning ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                        color: staleDanger ? '#EF4444' : staleWarning ? '#EAB308' : '#22C55E',
                      }}
                    >
                      {b.currentTier === 'Hall of Flame' ? '✓' : `${b.daysSinceLastActivity}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#666] text-xs hidden lg:table-cell">
                    {b.lastActivityDate ? new Date(b.lastActivityDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '—'}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#666]">
                  No budtenders found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stale Warning Summary */}
      {budtenders.filter((b: BudtenderRow) => b.daysSinceLastActivity >= 7 && b.currentTier !== 'Hall of Flame').length > 0 && (
        <div className="mt-6 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-400 text-sm font-bold mb-1" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.1rem'}}>
            STALE BUDTENDERS (7+ DAYS WITHOUT PROGRESS)
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {budtenders
              .filter((b: BudtenderRow) => b.daysSinceLastActivity >= 7 && b.currentTier !== 'Hall of Flame')
              .slice(0, 20)
              .map((b: BudtenderRow) => (
                <span
                  key={b.profileId}
                  className="inline-block px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20"
                >
                  {b.firstName} {b.lastName} — {b.daysSinceLastActivity}d at {b.currentTier}
                </span>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
