/**
 * app/components/SalesFloorLayout.tsx
 *
 * Shared shell for all /sales-staging pages.
 * Renders the top bar + collapsible side nav + page content slot.
 * Single source of truth — no more copy-pasted headers or nav drift.
 *
 * Usage:
 *   <SalesFloorLayout current="Accounts" stageCounts={stageCounts}>
 *     {page content}
 *   </SalesFloorLayout>
 */

import { useState, useEffect } from 'react';
import { Form } from '@remix-run/react';

const T = {
  bg:           '#0A0A0A',
  text:         '#F0F0F0',
  textSubtle:   '#9C9C9C',
  textFaint:    '#5A5A5A',
  textMuted:    '#7A7A7A',
  border:       '#1F1F1F',
  borderStrong: '#2F2F2F',
  yellow:       '#FFD500',
  yellowWarm:   '#FFB800',
  green:        '#00E87A',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  Dashboard:        <Ico><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></Ico>,
  'New Customers':  <Ico><path d="M11 14v-1.5A2.5 2.5 0 0 0 8.5 10h-5A2.5 2.5 0 0 0 1 12.5V14"/><circle cx="6" cy="6" r="2.5"/><path d="M13 5v4m-2-2h4"/></Ico>,
  Onboarding:       <Ico><rect x="2" y="1" width="12" height="14" rx="1"/><path d="M5 5h6M5 8h6M5 11h3"/><path d="M10 10l1.5 1.5L14 9"/></Ico>,
  'Reorders Due':   <Ico><path d="M15 8A7 7 0 1 1 8 1"/><path d="M15 1v5h-5"/></Ico>,
  Leads:            <Ico><path d="M2 2h12L10 9v5l-4-2V9z"/></Ico>,
  'Sales Orders':   <Ico><rect x="3" y="1" width="10" height="14" rx="1"/><path d="M6 5h4M6 8h4M6 11h2"/></Ico>,
  Accounts:         <Ico><path d="M2 14V7l6-5 6 5v7"/><path d="M6 14V9h4v5"/></Ico>,
  Funnel:           <Ico><path d="M2 2h12l-4.5 7v5l-3-1.5V9z"/></Ico>,
  Email:            <Ico><rect x="1" y="4" width="14" height="10" rx="1"/><path d="M1 5l7 5 7-5"/></Ico>,
  Text:             <Ico><path d="M2 2h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5l-4 3V3a1 1 0 0 1 1-1z"/></Ico>,
  Issues:           <Ico><path d="M8 1L1 14h14z"/><path d="M8 6v3"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></Ico>,
  Vibes:            <Ico><path d="M1 8c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0"/></Ico>,
};

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: {
  label: string;
  href: string;
  countKey?: string;
  dot?: boolean;
}[] = [
  { label: 'Dashboard',      href: '/sales-staging' },
  { label: 'Onboarding',     href: '/sales-staging/onboarding',                countKey: 'first_order_pending' },
  { label: 'Reorders Due',   href: '/sales-staging/reorders',                  countKey: 'reorder_due', dot: true },
  { label: 'Leads',          href: '/sales-staging/leads',                     countKey: 'prospect' },
  { label: 'Sales Orders',   href: '/sales-staging/orders' },
  { label: 'Accounts',       href: '/sales-staging' },
  { label: 'Funnel',         href: '/sales' },
  { label: 'Email',          href: '/sales-floor/app' },
  { label: 'Text',           href: '/sales-floor/app' },
  { label: 'Issues',         href: '/sales-floor/app' },
  { label: 'Vibes',          href: '/vibes' },
];

// ─── Layout ───────────────────────────────────────────────────────────────────

export function SalesFloorLayout({
  current,
  children,
  stageCounts = {},
}: {
  current: string;
  children: React.ReactNode;
  stageCounts?: Record<string, number>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed state from localStorage (client only)
  useEffect(() => {
    try {
      if (localStorage.getItem('sf-nav-collapsed') === '1') setCollapsed(true);
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem('sf-nav-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const navW = collapsed ? 52 : 200;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: 'Inter,sans-serif', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(0,232,122,.7) }
          70%  { box-shadow: 0 0 0 8px rgba(0,232,122,0) }
          100% { box-shadow: 0 0 0 0 rgba(0,232,122,0) }
        }
        .sf-nav-item:hover { background: rgba(255,255,255,0.03) !important; }
        @keyframes sweep { 0%{left:-25%} 100%{left:125%} }
        .hs-sweep { position:relative; overflow:hidden; }
        .hs-sweep::after { content:''; position:absolute; bottom:0; left:-25%; height:2px; width:25%; background:linear-gradient(90deg,transparent,#FFD500,transparent); opacity:.75; animation:sweep 14s linear infinite; pointer-events:none; }
        .order-row:hover { background:#141414 !important; }
        @media (max-width:768px) {
          .hs-page-header{padding:12px 16px!important}
          .hs-stats-strip{grid-template-columns:repeat(2,1fr)!important}
          .hs-filter-row{flex-wrap:wrap!important}
          .hs-state-pills{flex-wrap:wrap!important;border:none!important;gap:6px!important}
          .hs-state-pill{border:1px solid var(--bs,#2F2F2F)!important}
          .hs-search{width:100%!important;max-width:none!important}
          .hs-card-grid{grid-template-columns:4px 48px 1fr!important}
          .hs-card-days,.hs-card-contact{display:none!important}
          .hs-card-actions{grid-column:2/-1!important;padding:8px 12px 12px!important;border-left:none!important}
        }
        @media (max-width: 768px) {
          .sf-sidenav        { display: none !important; }
          .sf-topbar-extras  { display: none !important; }
        }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 64, background: T.bg, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', flexShrink: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img
            src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png"
            alt="Highsman" style={{ height: '28px' }}
          />
          <div style={{ width: 1, height: 24, background: T.borderStrong }} />
          <div style={{ fontFamily: 'Teko,sans-serif', fontSize: 20, fontWeight: 500, letterSpacing: '0.28em', color: T.textFaint, textTransform: 'uppercase' }}>
            SALES FLOOR
          </div>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: T.textFaint, letterSpacing: '0.18em', border: `1px solid ${T.border}`, padding: '2px 6px' }}>
            v2.4
          </span>
        </div>

        <div className="sf-topbar-extras" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* LIVE indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}`, animation: 'pulse-ring 2.4s infinite' }} />
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: T.textSubtle, letterSpacing: '0.14em' }}>LIVE</span>
          </div>
          <div style={{ width: 1, height: 20, background: T.border }} />

          {/* User avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/sky-avatar.png"
              alt="Sky Lima"
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
            />
            <span style={{ fontFamily: 'Teko,sans-serif', fontSize: 14, letterSpacing: '0.14em', color: T.textMuted }}>SKY LIMA</span>
          </div>
          <div style={{ width: 1, height: 20, background: T.border }} />

          {/* Links */}
          <a href="/sales" style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: T.textFaint, letterSpacing: '0.14em', textDecoration: 'none' }}>
            ← Live /sales
          </a>
          <Form method="post" action="/sales-staging">
            <input type="hidden" name="intent" value="logout" />
            <button type="submit" style={{ background: 'none', border: 'none', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: T.textFaint, letterSpacing: '0.14em', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
              sign out
            </button>
          </Form>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Side nav ──────────────────────────────────────────────────── */}
        <div
          className="sf-sidenav"
          style={{
            width: navW, flexShrink: 0, background: T.bg,
            borderRight: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column',
            transition: 'width 0.18s ease', overflow: 'hidden',
          }}
        >
          {/* Collapse toggle */}
          <button
            onClick={toggle}
            title={collapsed ? 'Expand nav' : 'Collapse nav'}
            style={{
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-end',
              padding: collapsed ? '11px 0' : '11px 14px',
              background: 'none', border: 'none',
              borderBottom: `1px solid ${T.border}`,
              cursor: 'pointer', color: T.textFaint, flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {collapsed
                ? <><path d="M4 2l5 4.5L4 11"/><path d="M1 6.5h8"/></>
                : <><path d="M9 2L4 6.5 9 11"/><path d="M12 6.5H4"/></>}
            </svg>
          </button>

          {/* Section label — hidden when collapsed */}
          {!collapsed && (
            <div style={{ fontFamily: 'Teko,sans-serif', fontSize: 10, letterSpacing: '0.32em', color: T.textFaint, textTransform: 'uppercase', padding: '8px 16px 4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Workspace
            </div>
          )}

          {/* Nav items */}
          {NAV_ITEMS.map(item => {
            const active  = item.label === current;
            const count   = item.countKey ? (stageCounts[item.countKey] || 0) : null;
            const showDot = item.dot && count && count > 0;

            return (
              <a
                key={item.label}
                href={item.href}
                className="sf-nav-item"
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: 10,
                  padding: collapsed ? '10px 0' : '9px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  textDecoration: 'none',
                  background: active ? 'rgba(255,213,0,0.05)' : 'transparent',
                  borderLeft: active ? `2px solid ${T.yellow}` : '2px solid transparent',
                  color: active ? T.yellow : T.textSubtle,
                  flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                {/* Icon */}
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: active ? T.yellow : T.textSubtle }}>
                  {ICONS[item.label]}
                </span>

                {/* Label + count — hidden when collapsed */}
                {!collapsed && (
                  <>
                    <span style={{ fontFamily: 'Teko,sans-serif', fontSize: 15, letterSpacing: '0.10em', textTransform: 'uppercase', flex: 1 }}>
                      {item.label}
                    </span>
                    {count != null && count > 0 && (
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: showDot ? T.yellow : T.textFaint, letterSpacing: '0.06em' }}>
                        {count}{showDot ? '•' : ''}
                      </span>
                    )}
                  </>
                )}
              </a>
            );
          })}
        </div>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {children}
        </div>

      </div>
    </div>
  );
}
