import {type ActionFunctionArgs, json} from '@shopify/remix-oxygen';

/*  ── Klaviyo constants ────────────────────────────── */
const KLAVIYO_REVISION = '2024-10-15';
const REFERRAL_LIST_ID = 'Yxw2eR';   // "Budtender Referrals" list
const BUDTENDER_LIST_ID = 'WBSrLZ';  // "Budtenders" list

/*  ── helpers ──────────────────────────────────────── */
async function klaviyoFetch(
  url: string,
  apiKey: string,
  options: RequestInit = {},
) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: KLAVIYO_REVISION,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo ${res.status}: ${text}`);
  }
  return res.json();
}

/*  ── action ───────────────────────────────────────── */
export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  const KLAVIYO_API_KEY = context.env.KLAVIYO_PRIVATE_KEY;
  if (!KLAVIYO_API_KEY) {
    return json({error: 'Server configuration error'}, {status: 500});
  }

  let body: {
    referrerName: string;
    referrerEmail: string;
    budtenderName: string;
    budtenderEmail: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({error: 'Invalid JSON'}, {status: 400});
  }

  const {referrerName, referrerEmail, budtenderName, budtenderEmail} = body;

  /* ── validate ──────────────────────────────────── */
  if (!referrerName?.trim() || !referrerEmail?.trim() || !budtenderName?.trim() || !budtenderEmail?.trim()) {
    return json({error: 'All fields are required'}, {status: 400});
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(referrerEmail) || !emailRe.test(budtenderEmail)) {
    return json({error: 'Invalid email address'}, {status: 400});
  }

  if (referrerEmail.toLowerCase() === budtenderEmail.toLowerCase()) {
    return json({error: "You can't refer yourself"}, {status: 400});
  }

  try {
    /* ── 1. Create / upsert referred budtender profile ── */
    const [firstName, ...lastParts] = budtenderName.trim().split(' ');
    const lastName = lastParts.join(' ');

    const upsertRes = await klaviyoFetch(
      'https://a.klaviyo.com/api/profile-import/',
      KLAVIYO_API_KEY,
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'profile',
            attributes: {
              email: budtenderEmail.toLowerCase().trim(),
              first_name: firstName,
              ...(lastName ? {last_name: lastName} : {}),
              properties: {
                is_budtender: true,
                referred_by_name: referrerName.trim(),
                referred_by_email: referrerEmail.toLowerCase().trim(),
                referral_date: new Date().toISOString(),
              },
            },
          },
        }),
      },
    );

    const referredProfileId = upsertRes?.data?.id;

    /* ── 2. Subscribe referred budtender to Referral list ── */
    await klaviyoFetch(
      'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/',
      KLAVIYO_API_KEY,
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'profile-subscription-bulk-create-job',
            attributes: {
              profiles: {
                data: [
                  {
                    type: 'profile',
                    attributes: {
                      email: budtenderEmail.toLowerCase().trim(),
                      subscriptions: {
                        email: {marketing: {consent: 'SUBSCRIBED'}},
                      },
                    },
                  },
                ],
              },
              historical_import: false,
            },
            relationships: {
              list: {
                data: {type: 'list', id: REFERRAL_LIST_ID},
              },
            },
          },
        }),
      },
    );

    /* ── 3. Track "Budtender Referral" event on referred profile ── */
    await klaviyoFetch(
      'https://a.klaviyo.com/api/events/',
      KLAVIYO_API_KEY,
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'event',
            attributes: {
              metric: {
                data: {type: 'metric', attributes: {name: 'Budtender Referral Received'}},
              },
              profile: {
                data: {
                  type: 'profile',
                  attributes: {email: budtenderEmail.toLowerCase().trim()},
                },
              },
              properties: {
                referrer_name: referrerName.trim(),
                referrer_email: referrerEmail.toLowerCase().trim(),
                referred_name: budtenderName.trim(),
                referred_email: budtenderEmail.toLowerCase().trim(),
              },
              time: new Date().toISOString(),
              unique_id: `ref-${referrerEmail}-${budtenderEmail}-${Date.now()}`,
            },
          },
        }),
      },
    );

    /* ── 4. Update referrer profile with referral count ── */
    // Find referrer profile
    const searchRes = await klaviyoFetch(
      `https://a.klaviyo.com/api/profiles/?filter=equals(email,"${encodeURIComponent(referrerEmail.toLowerCase().trim())}")`,
      KLAVIYO_API_KEY,
    );

    const referrerProfile = searchRes?.data?.[0];
    if (referrerProfile) {
      const currentCount = referrerProfile.attributes?.properties?.referral_count || 0;
      await klaviyoFetch(
        `https://a.klaviyo.com/api/profiles/${referrerProfile.id}/`,
        KLAVIYO_API_KEY,
        {
          method: 'PATCH',
          body: JSON.stringify({
            data: {
              type: 'profile',
              id: referrerProfile.id,
              attributes: {
                properties: {
                  referral_count: currentCount + 1,
                  last_referral_date: new Date().toISOString(),
                  last_referred_name: budtenderName.trim(),
                },
              },
            },
          }),
        },
      );
    }

    return json({
      success: true,
      message: `Referral sent! ${budtenderName} will receive an invite to Training Camp.`,
    });
  } catch (err: any) {
    console.error('Referral error:', err);
    return json(
      {error: 'Something went wrong. Please try again.'},
      {status: 500},
    );
  }
}
