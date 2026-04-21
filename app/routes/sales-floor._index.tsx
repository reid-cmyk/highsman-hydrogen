import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useActionData, Form} from '@remix-run/react';
import {json, redirect} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Sales Floor'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

const AUTH_COOKIE = 'sales_floor_auth=1';
const COOKIE_HEADER = `${AUTH_COOKIE}; Path=/sales-floor; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;

function isAuthenticated(request: Request): boolean {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.includes(AUTH_COOKIE);
}

export async function loader({request}: LoaderFunctionArgs) {
  // Already authenticated — bounce straight to the dashboard resource route
  if (isAuthenticated(request)) {
    return redirect('/sales-floor/app');
  }
  return json({authenticated: false, error: null});
}

export async function action({request}: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = (formData.get('password') as string) || '';
  // Sales Floor uses its own dedicated password — intentionally not tied to SALES_DASHBOARD_PASSWORD
  const correct = 'hmexec2025$$';

  if (password === correct) {
    // Server-side redirect with cookie → browser follows, cookie is stored,
    // subsequent GET hits the resource route which serves the dashboard HTML.
    return redirect('/sales-floor/app', {
      headers: {'Set-Cookie': COOKIE_HEADER},
    });
  }

  return json({authenticated: false, error: 'Incorrect password'});
}

export default function SalesFloorLogin() {
  const actionData = useActionData<typeof action>();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#FFF',
        fontFamily: "'Barlow Semi Condensed', sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '40px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{textAlign: 'center', marginBottom: '32px'}}>
          <img
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
            alt="Highsman"
            style={{height: '48px', marginBottom: '16px'}}
          />
          <h1
            style={{
              fontFamily: "'Teko', sans-serif",
              fontWeight: 600,
              fontSize: '32px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Sales Floor
          </h1>
          <p
            style={{
              color: '#A9ACAF',
              fontSize: '14px',
              marginTop: '6px',
              letterSpacing: '0.03em',
            }}
          >
            Authorized reps only.
          </p>
        </div>

        <Form method="post" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#A9ACAF',
            }}
          >
            Password
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              style={{
                background: '#000',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#FFF',
                padding: '14px 16px',
                fontSize: '16px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </label>

          {actionData && 'error' in actionData && actionData.error ? (
            <div
              style={{
                color: '#ff6b6b',
                fontSize: '13px',
                padding: '10px 12px',
                background: 'rgba(255, 107, 107, 0.08)',
                border: '1px solid rgba(255, 107, 107, 0.25)',
                borderRadius: '6px',
              }}
            >
              {actionData.error}
            </div>
          ) : null}

          <button
            type="submit"
            style={{
              background: '#FFF',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '14px 18px',
              fontFamily: "'Teko', sans-serif",
              fontWeight: 600,
              fontSize: '20px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              minHeight: '52px',
            }}
          >
            Enter Floor
          </button>
        </Form>

        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
            fontSize: '11px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#6a6d70',
          }}
        >
          Spark Greatness<span style={{fontSize: '9px'}}>™</span>
        </div>
      </div>
    </div>
  );
}
