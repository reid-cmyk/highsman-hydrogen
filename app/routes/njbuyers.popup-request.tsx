import type {MetaFunction, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useEffect} from 'react';
import {useLoaderData, useSearchParams} from '@remix-run/react';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Pop-Up Request Received'},
    {
      name: 'description',
      content:
        'Your pop-up request has been received. Sky from the Highsman launch team will contact you within 24 hours to lock in a date.',
    },
    {name: 'robots', content: 'noindex'},
  ];
};

// ---------------------------------------------------------------------------
// LOADER — runs server-side on every request
// Pings sky@highsman.com via Gmail Service Account when a buyer lands here
// ---------------------------------------------------------------------------
export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const params = {
    source: url.searchParams.get('source') || 'direct',
    utm_source: url.searchParams.get('utm_source') || '',
    utm_medium: url.searchParams.get('utm_medium') || '',
    utm_campaign: url.searchParams.get('utm_campaign') || '',
    tag: url.searchParams.get('tag') || 'popup_request',
    klaviyo_id: url.searchParams.get('_kx') || '',
  };

  const env = context.env as Record<string, string>;
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const referer = request.headers.get('referer') || 'direct';
  const requestedAt = new Date().toISOString();

  let emailStatus: 'sent' | 'skipped' | 'error' = 'skipped';
  let emailError: string | null = null;

  try {
    const {sendEmailFromUser, isGmailSAConfigured} = await import(
      '~/lib/gmail-sa'
    );

    if (isGmailSAConfigured(env)) {
      const subject = `[POP-UP REQUEST] NJ buyer clicked Book A Pop-Up`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
          <div style="background: #FFEB3B; padding: 16px 20px; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Pop-Up Request &mdash; NJ Launch</h1>
          </div>

          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px;">A buyer just clicked <strong>Book A Pop-Up</strong> from an NJ Launch email and landed on the confirmation page.</p>

          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px; color: #555;">Reach out within 24 hours to lock in a date.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
            <tr>
              <td style="padding: 10px 12px; background: #f6f6f6; font-weight: 600; width: 35%;">Source</td>
              <td style="padding: 10px 12px; background: #fafafa;">${params.source}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f6f6f6; font-weight: 600;">UTM Campaign</td>
              <td style="padding: 10px 12px; background: #fafafa;">${params.utm_campaign || '(none)'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f6f6f6; font-weight: 600;">UTM Source</td>
              <td style="padding: 10px 12px; background: #fafafa;">${params.utm_source || '(none)'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f6f6f6; font-weight: 600;">Tag</td>
              <td style="padding: 10px 12px; background: #fafafa;">${params.tag}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f6f6f6; font-weight: 600;">Klaviyo Profile</td>
              <td style="padding: 10px 12px; background: #fafafa;">
                ${params.klaviyo_id ? `<a href="https://www.klaviyo.com/dashboard/people/profiles?searchKey=${encodeURIComponent(params.klaviyo_id)}" style="color: #c8a84b;">${params.klaviyo_id}</a>` : '(no _kx token in URL)'}
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; background: #f6f6f6; font-weight: 600;">Clicked At</td>
              <td style="padding: 10px 12px; background: #fafafa;">${requestedAt}</td>
            </tr>
          </table>

          <div style="margin: 32px 0 24px; padding: 16px 20px; border-left: 4px solid #FFEB3B; background: #fafafa;">
            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #333;"><strong>Find them in Klaviyo:</strong> Open the campaign <em>${params.utm_campaign || 'NJ Launch'}</em> &rarr; Recipient activity &rarr; filter by clicked <code>${params.tag}</code>. The most recent click is the one that triggered this email.</p>
          </div>

          <p style="font-size: 13px; color: #999; margin: 24px 0 0; line-height: 1.5;">User agent: ${userAgent}<br>Referer: ${referer}</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;">
          <p style="font-size: 11px; color: #aaa; margin: 0; letter-spacing: 2px; text-transform: uppercase;">Highsman &middot; Spark Greatness&trade;</p>
        </div>
      `;

      const text = [
        `POP-UP REQUEST — NJ Launch`,
        ``,
        `A buyer just clicked Book A Pop-Up from an NJ Launch email and landed on the confirmation page.`,
        `Reach out within 24 hours to lock in a date.`,
        ``,
        `Source: ${params.source}`,
        `UTM Campaign: ${params.utm_campaign || '(none)'}`,
        `UTM Source: ${params.utm_source || '(none)'}`,
        `Tag: ${params.tag}`,
        `Klaviyo Profile: ${params.klaviyo_id || '(no _kx token in URL)'}`,
        `Clicked At: ${requestedAt}`,
        ``,
        `Find them in Klaviyo: Open the campaign "${params.utm_campaign || 'NJ Launch'}" → Recipient activity → filter by clicked "${params.tag}".`,
        ``,
        `— Highsman`,
      ].join('\n');

      await sendEmailFromUser('sky@highsman.com', {
        to: 'sky@highsman.com',
        cc: 'reid@highsman.com',
        subject,
        html,
        text,
      } as Parameters<typeof sendEmailFromUser>[1]);

      emailStatus = 'sent';
    }
  } catch (err) {
    emailStatus = 'error';
    emailError = err instanceof Error ? err.message : String(err);
    console.error('[njbuyers.popup-request] sendEmailFromUser failed:', err);
  }

  return json({
    params,
    emailStatus,
    emailError,
    requestedAt,
  });
}

declare global {
  interface Window {
    _learnq?: Array<unknown[]>;
    klaviyo?: {
      push: (event: unknown[]) => void;
      identify: (props: Record<string, unknown>) => void;
      track: (
        event: string,
        properties?: Record<string, unknown>,
      ) => void;
    };
  }
}

export default function PopUpRequestConfirmation() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const eventProps = {
      source: searchParams.get('source') || 'direct',
      utm_source: searchParams.get('utm_source') || '',
      utm_medium: searchParams.get('utm_medium') || '',
      utm_campaign: searchParams.get('utm_campaign') || '',
      tag: searchParams.get('tag') || 'popup_request',
      page: '/njbuyers/popup-request',
      requested_at: new Date().toISOString(),
      gmail_notification_status: data?.emailStatus || 'unknown',
    };

    if (window.klaviyo && typeof window.klaviyo.track === 'function') {
      window.klaviyo.track('Submitted Pop-Up Request', eventProps);
      return;
    }

    if (window._learnq) {
      window._learnq.push([
        'track',
        'Submitted Pop-Up Request',
        eventProps,
      ]);
    }
  }, [searchParams, data?.emailStatus]);

  return (
    <>
      <section className="relative bg-surface overflow-hidden min-h-[80vh] flex items-center">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 80px)',
            }}
          />
        </div>

        <div className="relative max-w-3xl mx-auto px-8 md:px-16 py-24 md:py-32 text-center w-full">
          <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 bg-primary mb-10">
            <span className="material-symbols-outlined text-on-primary text-5xl md:text-6xl font-bold">
              check
            </span>
          </div>

          <span className="font-headline text-xs md:text-sm uppercase tracking-[0.4em] text-primary block mb-6">
            POP-UP REQUEST RECEIVED
          </span>

          <h1 className="font-headline text-5xl md:text-8xl leading-[0.85] font-bold uppercase tracking-tighter mb-8">
            GOT IT.
            <br />
            WE&apos;LL BE
            <br />
            IN TOUCH.
          </h1>

          <p className="font-body text-on-surface-variant text-lg md:text-xl max-w-xl mx-auto mb-12 leading-relaxed">
            Sky from our launch team will reach out within{' '}
            <strong className="text-primary">24 hours</strong> to lock in a date
            and walk through the activation plan for your store.
          </p>

          <div className="border border-outline-variant/20 bg-surface-container-low p-8 md:p-10 mb-12 text-left max-w-2xl mx-auto">
            <span className="font-headline text-xs uppercase tracking-[0.3em] text-on-surface-variant/60 block mb-8">
              WHAT HAPPENS NEXT
            </span>
            <div className="space-y-8">
              <div className="flex gap-6 items-start">
                <span className="font-headline text-3xl md:text-4xl font-bold text-primary shrink-0 leading-none">
                  1
                </span>
                <div>
                  <h3 className="font-headline text-lg md:text-xl uppercase tracking-wide mb-1">
                    SKY REACHES OUT
                  </h3>
                  <p className="font-body text-on-surface-variant text-sm md:text-base">
                    Within 24 hours via the email we have on file. Quick call
                    to confirm preferred dates and store details.
                  </p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <span className="font-headline text-3xl md:text-4xl font-bold text-primary shrink-0 leading-none">
                  2
                </span>
                <div>
                  <h3 className="font-headline text-lg md:text-xl uppercase tracking-wide mb-1">
                    WE BUILD THE PLAN
                  </h3>
                  <p className="font-body text-on-surface-variant text-sm md:text-base">
                    Sampling format, swag inventory, budtender training
                    touchpoints, and any in-store displays you want featured.
                  </p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <span className="font-headline text-3xl md:text-4xl font-bold text-primary shrink-0 leading-none">
                  3
                </span>
                <div>
                  <h3 className="font-headline text-lg md:text-xl uppercase tracking-wide mb-1">
                    WE SHOW UP
                  </h3>
                  <p className="font-body text-on-surface-variant text-sm md:text-base">
                    Highsman team on the floor at your store during launch
                    week. Customers walk in, leave converted.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <a
            href="/njbuyers"
            className="inline-flex items-center gap-3 bg-primary text-on-primary font-headline text-lg md:text-xl font-bold uppercase px-8 md:px-10 py-4 hover:bg-primary-container transition-all group"
          >
            <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">
              arrow_back
            </span>
            BACK TO NJ HUB
          </a>

          <p className="font-headline text-xs uppercase tracking-[0.3em] text-on-surface-variant/50 mt-12">
            NEED TO REACH SKY DIRECTLY?
          </p>
          <a
            href="mailto:sky@highsman.com?subject=Pop-Up%20Request%20-%20NJ%20Launch"
            className="font-headline text-base md:text-lg uppercase tracking-wider text-primary hover:text-primary-container transition-colors mt-1 inline-block"
          >
            sky@highsman.com
          </a>
        </div>
      </section>
    </>
  );
}
