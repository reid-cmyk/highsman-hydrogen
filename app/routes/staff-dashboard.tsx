import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form} from '@remix-run/react';
import {json} from '@shopify/remix-oxygen';
import {useState, useEffect, useMemo} from 'react';
import {
  COURSE_ORDER,
  computeTier,
  fetchTrainingProfilesAndEvents,
} from '~/lib/vibes-klaviyo-training';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Staff Dashboard'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// ââ Constants ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Training list ID, metric IDs, course order, tier computation and the Klaviyo
// fetch layer all live in `~/lib/vibes-klaviyo-training` so the /vibes store
// cards and this dashboard never drift.

const TIER_NAMES = ['Unsigned', 'Rookie', 'Starting Lineup', 'Franchise Player', 'Hall of Flame'];

// ââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}


// Klaviyo fetch layer is imported from `~/lib/vibes-klaviyo-training`.

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  referralCount: number;
  lastReferralDate: string;
};

// ââ Action (password check) âââââââââââââââââââââââââââââââââââââââââââââââââ
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

// ââ Loader ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
    // Hit Klaviyo once: list profiles + course-completion events, indexed by profile.
    // Shared with /vibes so per-store rollups and this flat table never drift.
    const {profiles, eventsByProfile} = await fetchTrainingProfilesAndEvents(apiKey);

    // 4. Build budtender rows
    const now = new Date();
    const registeredProfiles = profiles.filter((p: any) => {
    const rProps = p.attributes?.properties || {};
    return !!(rProps.budtender_education_signup) || !!(rProps.budtender_password);
  });
  const budtenders: BudtenderRow[] = registeredProfiles.map((p: any) => {
      const pid = p.id;
      const attrs = p.attributes || {};
      // Properties may be under attrs.properties or directly on attrs depending on API response format
      const props = attrs.properties || {};

      const profileEvents = eventsByProfile.get(pid) || [];

      // Determine completed courses from events
      const completedCourseIds = new Set<string>();
      let lastActivityDate = attrs.created || now.toISOString();

      for (const ev of profileEvents) {
        // Klaviyo raw API uses snake_case: event_properties (not eventProperties)
        const ep = ev.attributes?.event_properties || ev.attributes?.eventProperties || {};
        if (ep.course_id) completedCourseIds.add(ep.course_id);
        const dt = ev.attributes?.datetime;
        if (dt && dt > lastActivityDate) lastActivityDate = dt;
      }

      // If they have events, use the most recent one's datetime
      if (profileEvents.length > 0) {
        const mostRecent = profileEvents[0]?.attributes?.datetime;
        if (mostRecent) lastActivityDate = mostRecent;
      }

      const tier = computeTier(completedCourseIds);
      const lastDate = new Date(lastActivityDate);
      const daysSince = daysBetween(lastDate, now);

      // State: check multiple possible field names
      const stateVal = props.budtender_state || props.state || attrs.location?.region || '';
      // Dispensary: check multiple possible field names
      const dispVal = props.dispensary_name || attrs.organization || '';

      return {
        profileId: pid,
        firstName: attrs.first_name || '',
        lastName: attrs.last_name || '',
        email: attrs.email || '',
        dispensary: dispVal,
        state: stateVal,
        currentTier: tier,
        coursesCompleted: completedCourseIds.size,
        lastActivityDate: lastActivityDate,
        daysSinceLastActivity: daysSince,
        signupDate: attrs.created || '',
        completedCourseIds: Array.from(completedCourseIds),
        referralCount: props.referral_count || 0,
        lastReferralDate: props.last_referral_date || '',
      };
    });

    // 5. Summary counts
    const tierCounts: Record<string, number> = {};
    for (const t of TIER_NAMES) tierCounts[t] = 0;
    for (const b of budtenders) {
      tierCounts[b.currentTier] = (tierCounts[b.currentTier] || 0) + 1;
    }

    // 6. State and dispensary breakdowns
    const stateCounts: Record<string, number> = {};
    const dispensaryCounts: Record<string, number> = {};
    for (const b of budtenders) {
      if (b.state) stateCounts[b.state] = (stateCounts[b.state] || 0) + 1;
      if (b.dispensary) dispensaryCounts[b.dispensary] = (dispensaryCounts[b.dispensary] || 0) + 1;
    }

    // Referral stats
    const totalReferrals = budtenders.reduce((s: number, b: BudtenderRow) => s + b.referralCount, 0);
    const budtendersWithReferrals = budtenders.filter((b: BudtenderRow) => b.referralCount > 0).length;

    // Sort by days since activity descending (most stale first)
    budtenders.sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);

    return json({
      authenticated: true,
      budtenders,
      summary: {
        total: registeredProfiles.length,
        tierCounts,
        stateCounts,
        dispensaryCounts,
        avgDaysSinceActivity: budtenders.length
          ? Math.round(budtenders.reduce((s, b) => s + b.daysSinceLastActivity, 0) / budtenders.length)
          : 0,
        totalReferrals,
        budtendersWithReferrals,
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

// ââ Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

// ââ Login Screen ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

// ââ Shell ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
              <p className="text-[#A9ACAF] text-xs uppercase tracking-widest">Internal â Staff Only</p>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ââ Tier Colors âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const TIER_COLORS: Record<string, {bg: string; border: string; text: string}> = {
  Unsigned: {bg: 'rgba(169,172,175,0.08)', border: 'rgba(169,172,175,0.2)', text: '#A9ACAF'},
  Rookie: {bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', text: '#3B82F6'},
  'Starting Lineup': {bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.3)', text: '#A855F7'},
  'Franchise Player': {bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.3)', text: '#EAB308'},
  'Hall of Flame': {bg: 'rgba(200,168,75,0.12)', border: 'rgba(200,168,75,0.4)', text: '#c8a84b'},
};

// ââ Dashboard Content âââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function DashboardContent({budtenders, summary}: {budtenders: BudtenderRow[]; summary: any}) {
  const [filterTier, setFilterTier] = useState<string>('All');
  const [filterState, setFilterState] = useState<string>('All');
  const [filterDispensary, setFilterDispensary] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Unique states and dispensaries for filter dropdowns
  const states = Array.from(new Set(budtenders.map((b: BudtenderRow) => b.state).filter(Boolean))).sort();
  const dispensaries = Array.from(new Set(
    budtenders
      .filter((b: BudtenderRow) => filterState === 'All' || b.state === filterState)
      .map((b: BudtenderRow) => b.dispensary)
      .filter(Boolean)
  )).sort();

  const filtered = useMemo(() => budtenders.filter((b: BudtenderRow) => {
    if (filterTier !== 'All' && (b.currentTier || 'Unsigned') !== filterTier) return false;
    if (filterState !== 'All' && (b.state || '') !== filterState) return false;
    if (filterDispensary !== 'All' && (b.dispensary || '') !== filterDispensary) return false;
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const fullName = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
      const email = (b.email || '').toLowerCase();
      const dispensary = (b.dispensary || '').toLowerCase();
      return fullName.includes(q) || email.includes(q) || dispensary.includes(q);
    }
    return true;
  }), [budtenders, filterTier, filterState, filterDispensary, searchQuery]);

  const STATE_LABELS: Record<string, string> = {NJ: 'New Jersey', NY: 'New York', MA: 'Massachusetts', RI: 'Rhode Island', MO: 'Missouri'};

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        {/* Total */}
        <div className="bg-[#111] border border-[#A9ACAF]/15 rounded-xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">Total Enrolled</div>
          <div className="text-3xl font-bold text-white" style={{fontFamily: 'Teko, sans-serif'}}>{summary.total}</div>
        </div>
        {/* Referrals */}
        <div className="bg-[#111] border border-[#A9ACAF]/15 rounded-xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">Referrals</div>
          <div className="text-3xl font-bold text-[#22C55E]" style={{fontFamily: 'Teko, sans-serif'}}>{summary.totalReferrals || 0}</div>
          <div className="text-[10px] text-[#666]">{summary.budtendersWithReferrals || 0} referrers</div>
        </div>
        {/* Per-tier counts */}
        {TIER_NAMES.map((tier) => {
          const colors = TIER_COLORS[tier];
          const isActive = filterTier === tier;
          return (
            <div
              key={tier}
              className="rounded-xl p-4 text-center cursor-pointer transition-all hover:scale-105"
              style={{
                background: isActive ? colors.text : colors.bg,
                border: isActive ? `2px solid ${colors.text}` : `1px solid ${colors.border}`,
                transform: isActive ? 'scale(1.05)' : undefined,
              }}
              onClick={() => setFilterTier(filterTier === tier ? 'All' : tier)}
            >
              <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{color: isActive ? '#000' : colors.text}}>
                {tier}
              </div>
              <div className="text-3xl font-bold" style={{fontFamily: 'Teko, sans-serif', color: isActive ? '#000' : colors.text}}>
                {summary.tierCounts[tier] || 0}
              </div>
            </div>
          );
        })}
      </div>

      {/* State + Dispensary Breakdown */}
      {Object.keys(summary.stateCounts || {}).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {/* By State */}
          <div className="bg-[#111] border border-[#A9ACAF]/15 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-3">By State</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.stateCounts as Record<string, number>)
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .map(([st, count]) => (
                  <button
                    key={st}
                    onClick={() => { setFilterState(filterState === st ? 'All' : st); setFilterDispensary('All'); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    style={{
                      background: filterState === st ? '#c8a84b' : 'rgba(169,172,175,0.08)',
                      color: filterState === st ? '#000' : '#A9ACAF',
                      border: filterState === st ? '1px solid #c8a84b' : '1px solid rgba(169,172,175,0.15)',
                    }}
                  >
                    {STATE_LABELS[st] || st} ({count as number})
                  </button>
                ))}
            </div>
          </div>
          {/* Top Dispensaries */}
          <div className="bg-[#111] border border-[#A9ACAF]/15 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-3">Top Dispensaries</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.dispensaryCounts as Record<string, number>)
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .slice(0, 12)
                .map(([disp, count]) => (
                  <button
                    key={disp}
                    onClick={() => setFilterDispensary(filterDispensary === disp ? 'All' : disp)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    style={{
                      background: filterDispensary === disp ? '#c8a84b' : 'rgba(169,172,175,0.08)',
                      color: filterDispensary === disp ? '#000' : '#A9ACAF',
                      border: filterDispensary === disp ? '1px solid #c8a84b' : '1px solid rgba(169,172,175,0.15)',
                    }}
                  >
                    {disp} ({count as number})
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or dispensary..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 w-full sm:w-auto px-4 py-2 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b] transition-colors"
        />
        <select
          value={filterState}
          onChange={(e) => { setFilterState(e.target.value); setFilterDispensary('All'); }}
          className="px-3 py-2 rounded-lg text-sm bg-[#111] text-[#A9ACAF] border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b] cursor-pointer"
        >
          <option value="All">All States</option>
          {states.map((s) => <option key={s} value={s}>{STATE_LABELS[s] || s}</option>)}
        </select>
        <select
          value={filterDispensary}
          onChange={(e) => setFilterDispensary(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-[#111] text-[#A9ACAF] border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b] cursor-pointer max-w-[200px]"
        >
          <option value="All">All Dispensaries</option>
          {dispensaries.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
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

      {/* Active filters + Results count */}
      <div className="text-[#666] text-xs mb-3 uppercase tracking-wider">
        Showing {filtered.length} of {budtenders.length} budtenders
        {filterTier !== 'All' && <span className="text-[#c8a84b]"> â {filterTier}</span>}
        {filterState !== 'All' && <span className="text-[#c8a84b]"> â {STATE_LABELS[filterState] || filterState}</span>}
        {filterDispensary !== 'All' && <span className="text-[#c8a84b]"> â {filterDispensary}</span>}
        {(filterState !== 'All' || filterDispensary !== 'All' || filterTier !== 'All') && (
          <button
            onClick={() => { setFilterTier('All'); setFilterState('All'); setFilterDispensary('All'); setSearchQuery(''); }}
            className="ml-2 text-red-400 hover:text-red-300 cursor-pointer"
          >
            Clear all
          </button>
        )}
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
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold hidden sm:table-cell">Referrals</th>
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
                  <td className="px-4 py-3 text-[#A9ACAF] hidden sm:table-cell">{b.dispensary || 'â'}</td>
                  <td className="px-4 py-3 text-[#A9ACAF] hidden md:table-cell">{b.state || 'â'}</td>
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
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {b.referralCount > 0 ? (
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                        style={{background: 'rgba(34,197,94,0.15)', color: '#22C55E'}}
                        title={b.lastReferralDate ? `Last: ${new Date(b.lastReferralDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}` : ''}
                      >
                        {b.referralCount}
                      </span>
                    ) : (
                      <span className="text-[#444]">â</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                      style={{
                        background: staleDanger ? 'rgba(239,68,68,0.15)' : staleWarning ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                        color: staleDanger ? '#EF4444' : staleWarning ? '#EAB308' : '#22C55E',
                      }}
                    >
                      {b.currentTier === 'Hall of Flame' ? 'â' : `${b.daysSinceLastActivity}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#666] text-xs hidden lg:table-cell">
                    {b.lastActivityDate ? new Date(b.lastActivityDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : 'â'}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[#666]">
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
                  {b.firstName} {b.lastName} â {b.daysSinceLastActivity}d at {b.currentTier}
                </span>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
