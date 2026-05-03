/**
 * app/components/SalesFloorNav.tsx
 * Shared left nav for all /sales-staging pages.
 */

const T = {
  bg: '#0A0A0A', border: '#1F1F1F', yellow: '#FFD500', textSubtle: '#9C9C9C',
};

const NAV_ITEMS: [string, string][] = [
  ['Dashboard',     '/sales-floor/app'],
  ['New Customers', '/sales-floor/app'],
  ['Reorders Due',  '/sales-floor/app'],
  ['Leads',         '/sales-floor/app'],
  ['Sales Orders',  '/sales-staging/orders'],
  ['Accounts',      '/sales-staging'],
  ['Funnel',        '/sales-floor/app'],
  ['Email',         '/sales-floor/app'],
  ['Text',          '/sales-floor/app'],
  ['Issues',        '/sales-floor/app'],
  ['Vibes',         '/sales-floor/app'],
];

export function SalesFloorNav({current}: {current: string}) {
  return (
    <div style={{width:200, flexShrink:0, background:T.bg, borderRight:`1px solid ${T.border}`, paddingTop:8}}>
      {NAV_ITEMS.map(([label, href]) => {
        const active = label === current;
        return (
          <a key={label} href={href}
            style={{
              display:'block', padding:'9px 16px',
              fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.10em',
              color: active ? T.yellow : T.textSubtle,
              borderLeft: active ? `2px solid ${T.yellow}` : '2px solid transparent',
              textTransform:'uppercase', textDecoration:'none',
              background: active ? 'rgba(255,213,0,0.05)' : 'transparent',
            }}>
            {label}
          </a>
        );
      })}
    </div>
  );
}
