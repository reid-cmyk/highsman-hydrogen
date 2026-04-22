import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {
  AUTH_COOKIE_NAME,
  buildLogoutCookie,
  buildSessionCookie,
  createZohoBuyer,
  findZohoBuyerByEmail,
  getZohoAccessToken,
  sendMagicLinkEmail,
  signMagicLinkToken,
  signSession,
  verifyMagicLinkToken,
  type BuyerSession,
  type ZohoBuyer,
} from '../lib/njmenu-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/njmenu-auth — Magic Link Auth Resource Route
// ─────────────────────────────────────────────────────────────────────────────
// Single endpoint that handles every auth intent so the UI only has to know
// one URL. Intents:
//   * intent=lookup      → does this email exist in Zoho? returns {exists}
//                          (used by the login form to decide login vs signup)
//   * intent=request-link → existing buyer: send magic link to email
//   * intent=signup      → new buyer: create Zoho Account+Contact, send link
//   * intent=logout      → clear session cookie
//
// GET handles the magic-link landing:
//   GET /api/njmenu-auth?token=XXX&return=/njmenu
//     → validates token, sets 90-day session cookie, redirects to `return`
//
// All Zoho writes are best-effort: if Zoho is briefly unreachable we still
// return a friendly error so the buyer knows to retry, never a stack trace.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RETURN = '/njmenu';
const VERIFY_PATH = '/api/njmenu-auth'; // GET handler is on this same route

function safeReturn(returnPath: string | null): string {
  // Only allow same-origin paths (must start with /). Defends against open
  // redirects, e.g. ?return=https://evil.com.
  if (!returnPath) return DEFAULT_RETURN;
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) return DEFAULT_RETURN;
  return returnPath;
}

// ── Loader: handles magic-link landing (GET) ────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const returnTo = safeReturn(url.searchParams.get('return'));

  const env = context.env as any;
  const secret = env.SESSION_SECRET;

  if (!token || !secret) {
    return redirect(`/njmenu/login?error=invalid_link&return=${encodeURIComponent(returnTo)}`);
  }

  const email = await verifyMagicLinkToken(token, secret);
  if (!email) {
    return redirect(`/njmenu/login?error=expired&return=${encodeURIComponent(returnTo)}`);
  }

  // Re-fetch the buyer from Zoho at verification time so the session has the
  // freshest Account info (license #, name, etc.). If Zoho is down we still
  // create a minimal session so the buyer isn't locked out — they can order,
  // and the LeafLink handler will fall back to the email-only path.
  let zohoBuyer: ZohoBuyer | null = null;
  try {
    const accessToken = await getZohoAccessToken({
      ZOHO_CLIENT_ID: env.ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET: env.ZOHO_CLIENT_SECRET,
      ZOHO_REFRESH_TOKEN: env.ZOHO_REFRESH_TOKEN,
    });
    zohoBuyer = await findZohoBuyerByEmail(email, accessToken);
  } catch (err: any) {
    console.error('[api/njmenu-auth] Zoho lookup at verify failed:', err?.message);
  }

  const session: BuyerSession = {
    email,
    firstName: zohoBuyer?.firstName || '',
    lastName: zohoBuyer?.lastName || '',
    contactId: zohoBuyer?.contactId || '',
    accountId: zohoBuyer?.accountId || '',
    accountName: zohoBuyer?.accountName || '',
    licenseNumber: zohoBuyer?.licenseNumber || null,
    role: zohoBuyer?.role || null,
    phone: zohoBuyer?.phone || null,
    iat: Math.floor(Date.now() / 1000),
  };

  const signed = await signSession(session, secret);
  return redirect(returnTo, {
    headers: {'Set-Cookie': buildSessionCookie(signed)},
  });
}

// ── Action: handles all POST intents ─────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = (formData.get('intent') as string) || '';
  const env = context.env as any;
  const secret = env.SESSION_SECRET;

  if (!secret) {
    return json({ok: false, error: 'Server not configured (SESSION_SECRET missing).'}, {status: 500});
  }

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  if (intent === 'logout') {
    return json({ok: true}, {headers: {'Set-Cookie': buildLogoutCookie()}});
  }

  // Common: pull email + the return path the form wants to land on after verify
  const email = ((formData.get('email') as string) || '').trim().toLowerCase();
  const returnTo = safeReturn((formData.get('return') as string) || null);
  const origin = new URL(request.url).origin;

  if (!isValidEmail(email)) {
    return json({ok: false, error: 'Please enter a valid email address.'}, {status: 400});
  }

  // ── LOOKUP (does this email exist in Zoho?) ──────────────────────────────
  // The login form calls this on submit to decide whether to send a magic
  // link immediately or to swap into the signup view.
  if (intent === 'lookup') {
    try {
      const accessToken = await getZohoAccessToken({
        ZOHO_CLIENT_ID: env.ZOHO_CLIENT_ID,
        ZOHO_CLIENT_SECRET: env.ZOHO_CLIENT_SECRET,
        ZOHO_REFRESH_TOKEN: env.ZOHO_REFRESH_TOKEN,
      });
      const buyer = await findZohoBuyerByEmail(email, accessToken);
      return json({ok: true, exists: !!buyer});
    } catch (err: any) {
      console.error('[api/njmenu-auth] Lookup error:', err?.message);
      // Fail open: if Zoho is down, treat as new buyer so signup form appears.
      return json({ok: true, exists: false, degraded: true});
    }
  }

  // ── REQUEST LINK (existing buyer) ────────────────────────────────────────
  if (intent === 'request-link') {
    try {
      const accessToken = await getZohoAccessToken({
        ZOHO_CLIENT_ID: env.ZOHO_CLIENT_ID,
        ZOHO_CLIENT_SECRET: env.ZOHO_CLIENT_SECRET,
        ZOHO_REFRESH_TOKEN: env.ZOHO_REFRESH_TOKEN,
      });
      const buyer = await findZohoBuyerByEmail(email, accessToken);
      if (!buyer) {
        // Tell the UI to swap into signup — keeps friction at zero.
        return json({ok: true, needsSignup: true});
      }

      const token = await signMagicLinkToken(email, secret);
      const magicLinkUrl = `${origin}${VERIFY_PATH}?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`;

      const sent = await sendMagicLinkEmail(env, {
        to: email,
        firstName: buyer.firstName || null,
        magicLinkUrl,
      });
      if (!sent) {
        return json(
          {ok: false, error: 'We had trouble sending the link. Try again in a moment.'},
          {status: 502},
        );
      }
      return json({ok: true, sent: true});
    } catch (err: any) {
      console.error('[api/njmenu-auth] Request-link error:', err?.message);
      return json({ok: false, error: 'Something went wrong. Try again or email njsales@highsman.com.'}, {status: 500});
    }
  }

  // ── SIGNUP (new buyer) ───────────────────────────────────────────────────
  if (intent === 'signup') {
    const firstName = ((formData.get('firstName') as string) || '').trim();
    const lastName = ((formData.get('lastName') as string) || '').trim();
    const phone = ((formData.get('phone') as string) || '').trim();
    const dispensaryName = ((formData.get('dispensaryName') as string) || '').trim();
    const licenseNumber = ((formData.get('licenseNumber') as string) || '').trim();
    const role = ((formData.get('role') as string) || '').trim();

    if (!firstName || !lastName || !dispensaryName) {
      return json(
        {ok: false, error: 'First name, last name, and dispensary are required.'},
        {status: 400},
      );
    }

    try {
      const accessToken = await getZohoAccessToken({
        ZOHO_CLIENT_ID: env.ZOHO_CLIENT_ID,
        ZOHO_CLIENT_SECRET: env.ZOHO_CLIENT_SECRET,
        ZOHO_REFRESH_TOKEN: env.ZOHO_REFRESH_TOKEN,
      });

      // Race-safety: if a Contact was created between lookup and signup
      // (e.g. by another tab), just send the magic link instead of dup-creating.
      const existing = await findZohoBuyerByEmail(email, accessToken);
      if (!existing) {
        await createZohoBuyer(
          {email, firstName, lastName, phone, dispensaryName, licenseNumber, role},
          accessToken,
        );
      }

      const token = await signMagicLinkToken(email, secret);
      const magicLinkUrl = `${origin}${VERIFY_PATH}?token=${encodeURIComponent(token)}&return=${encodeURIComponent(returnTo)}`;

      const sent = await sendMagicLinkEmail(env, {
        to: email,
        firstName,
        magicLinkUrl,
      });
      if (!sent) {
        return json(
          {ok: false, error: 'Account created, but we had trouble sending the link. Try requesting a new link.'},
          {status: 502},
        );
      }
      return json({ok: true, sent: true});
    } catch (err: any) {
      console.error('[api/njmenu-auth] Signup error:', err?.message);
      return json(
        {ok: false, error: 'Could not create your account. Try again or email njsales@highsman.com.'},
        {status: 500},
      );
    }
  }

  return json({ok: false, error: 'Unknown intent.'}, {status: 400});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  // Permissive but not insane. Real validation is a confirmed magic-link click.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Re-export cookie name so other routes/loaders can clear it cleanly.
export {AUTH_COOKIE_NAME};
