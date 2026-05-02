import type {MetaFunction, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {useEffect} from 'react';
import {useSearchParams} from '@remix-run/react';

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
  }, [searchParams]);

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
