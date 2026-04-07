import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ── Server-side Auth Constants ───────────────────────────────────────────────
const KLAVIYO_LIST_ID_SERVER = 'WBSrLZ';
const AUTH_COOKIE_NAME = 'budtender_auth';
const AUTH_COOKIE_MAX_AGE = 14 * 24 * 60 * 60; // 14 days

// ── Server-side password hashing (SHA-256) ──────────────────────────────────
async function serverHashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'highsman_budtender_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Klaviyo server-side helpers ─────────────────────────────────────────────
async function klaviyoServerFetch(url: string, apiKey: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      revision: '2024-10-15',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function findProfileByEmail(email: string, apiKey: string) {
  const url = `https://a.klaviyo.com/api/profiles/?filter=equals(email,"${encodeURIComponent(email)}")&fields[profile]=email,first_name,last_name,organization,properties,created`;
  const data = await klaviyoServerFetch(url, apiKey);
  return data.data?.[0] || null;
}

// ── Resource Route Action (no default export = returns JSON directly) ───────
export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent') as string;
  const apiKey = context.env.KLAVIYO_PRIVATE_KEY;

  if (!apiKey) {
    return json({ok: false, error: 'Server configuration error.'}, {status: 500});
  }

  try {

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if (intent === 'login') {
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const password = formData.get('password') as string || '';
    if (!email || !password) return json({ok: false, error: 'Email and password required.'});

    const profile = await findProfileByEmail(email, apiKey).catch(() => null);
    if (!profile) return json({ok: false, error: 'No account found. Please create an account first.'});

    const props = profile.attributes?.properties || {};
    const storedHash = props.budtender_password;
    if (!storedHash) return json({ok: false, error: 'No password set. Please use "Forgot password" to set one.'});

    const hashed = await serverHashPassword(password);
    if (hashed !== storedHash) return json({ok: false, error: 'Invalid email or password.'});

    const cookieValue = encodeURIComponent(JSON.stringify({email, profileId: profile.id}));
    return json({ok: true}, {
      headers: {
        'Set-Cookie': `${AUTH_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE}`,
      },
    });
  }

  // ── REGISTER ─────────────────────────────────────────────────────────────
  if (intent === 'register') {
    const name = (formData.get('name') as string || '').trim();
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const password = formData.get('password') as string || '';
    const state = formData.get('state') as string || '';
    const dispensary = formData.get('dispensary') as string || '';

    if (!name || !email || !password || !state) {
      return json({ok: false, error: 'All fields required.'});
    }

    // Check if already registered (has password in Klaviyo)
    const existing = await findProfileByEmail(email, apiKey).catch(() => null);
    if (existing?.attributes?.properties?.budtender_password) {
      return json({ok: false, error: 'This email is already registered. Please sign in.'});
    }

    const hashed = await serverHashPassword(password);
    const [firstName, ...rest] = name.split(' ');
    const lastName = rest.join(' ');

    // Create or update profile in Klaviyo with password + properties
    const profilePayload: any = {
      data: {
        type: 'profile',
        attributes: {
          email,
          first_name: firstName,
          last_name: lastName,
          organization: dispensary,
          properties: {
            budtender_state: state,
            dispensary_name: dispensary,
            is_budtender: true,
            budtender_education_signup: true,
            budtender_password: hashed,
            completed_courses: [],
            consent_date: new Date().toISOString(),
          },
        },
      },
    };

    let profileId: string;
    if (existing) {
      // Update existing profile
      profilePayload.data.id = existing.id;
      await klaviyoServerFetch(`https://a.klaviyo.com/api/profiles/${existing.id}/`, apiKey, {
        method: 'PATCH',
        body: JSON.stringify(profilePayload),
      });
      profileId = existing.id;
    } else {
      // Create new profile
      const created = await klaviyoServerFetch('https://a.klaviyo.com/api/profiles/', apiKey, {
        method: 'POST',
        body: JSON.stringify(profilePayload),
      });
      profileId = created.data.id;
    }

    // Add to budtenders list
    await klaviyoServerFetch(`https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID_SERVER}/relationships/profiles/`, apiKey, {
      method: 'POST',
      body: JSON.stringify({data: [{type: 'profile', id: profileId}]}),
    }).catch(() => {}); // Don't fail if already on list

    const cookieValue = encodeURIComponent(JSON.stringify({email, profileId}));
    return json({ok: true}, {
      headers: {
        'Set-Cookie': `${AUTH_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE}`,
      },
    });
  }

  // ── RESET PASSWORD ───────────────────────────────────────────────────────
  if (intent === 'reset') {
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const password = formData.get('password') as string || '';
    if (!email || !password) return json({ok: false, error: 'Email and new password required.'});

    const profile = await findProfileByEmail(email, apiKey).catch(() => null);
    if (!profile) return json({ok: false, error: 'No account found with that email. Please create an account first.'});

    const hashed = await serverHashPassword(password);
    await klaviyoServerFetch(`https://a.klaviyo.com/api/profiles/${profile.id}/`, apiKey, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'profile',
          id: profile.id,
          attributes: {
            properties: {budtender_password: hashed},
          },
        },
      }),
    });

    return json({ok: true});
  }

  // ── COMPLETE COURSE ──────────────────────────────────────────────────────
  if (intent === 'complete-course') {
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const courseId = formData.get('courseId') as string || '';
    if (!email || !courseId) return json({ok: false, error: 'Missing data.'});

    const profile = await findProfileByEmail(email, apiKey).catch(() => null);
    if (!profile) return json({ok: false, error: 'Profile not found.'});

    const props = profile.attributes?.properties || {};
    const currentCourses: string[] = props.completed_courses || [];
    if (!currentCourses.includes(courseId)) {
      currentCourses.push(courseId);
    }

    await klaviyoServerFetch(`https://a.klaviyo.com/api/profiles/${profile.id}/`, apiKey, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'profile',
          id: profile.id,
          attributes: {
            properties: {completed_courses: currentCourses},
          },
        },
      }),
    });

    return json({ok: true, completedCourses: currentCourses});
  }

  // ── LOGOUT ───────────────────────────────────────────────────────────────
  if (intent === 'logout') {
    return json({ok: true}, {
      headers: {
        'Set-Cookie': `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  return json({ok: false, error: 'Unknown action.'}, {status: 400});

  } catch (err: any) {
    console.error('Budtender action error:', err);
    return json({ok: false, error: err?.message || 'Server error. Please try again.'}, {status: 500});
  }
}
