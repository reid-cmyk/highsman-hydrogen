import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Privacy Policy'}];
};

export default function PrivacyPolicy() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-20 md:py-32">
        <h1 className="font-headline text-4xl md:text-6xl font-bold uppercase mb-12">
          Privacy Policy
        </h1>

        <div className="font-body text-sm md:text-base leading-relaxed text-on-surface-variant space-y-8">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant/60">
            Last updated: March 30, 2026
          </p>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Introduction
            </h2>
            <p>
              Highsman (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting the privacy of our customers and website visitors. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website at highsman.com.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Information We Collect
            </h2>
            <p>
              We may collect personal information that you voluntarily provide to us when you make a purchase, register on the site, subscribe to our newsletter, respond to a survey, fill out a form, or enter information on our site. This may include your name, email address, mailing address, phone number, and payment information.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              How We Use Your Information
            </h2>
            <p>
              We may use the information we collect from you to process transactions, send periodic emails regarding your order or other products and services, improve our website, improve customer service, and administer promotions, surveys, or other site features.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              SMS/Text Messaging Consent &amp; Terms
            </h2>
            <p>
              By providing your phone number and opting in, you are agreeing to receive SMS customer care and promotional messages from Highsman. Message frequency may vary. Standard Message and Data Rates may apply. Reply STOP to opt out. Reply HELP for help.{' '}
              <Link to="/policies/privacy-policy" className="underline text-primary">
                Privacy Policy
              </Link>{' '}
              <Link to="/policies/terms-of-service" className="underline text-primary">
                Terms of Service
              </Link>
            </p>
            <p className="mt-4">
              We will not share your opt-in to an SMS campaign with any third party for purposes unrelated to providing you with the services of that campaign. We may share your Personal Data, including your SMS opt-in or consent status, with third parties that help us provide our messaging services, including but not limited to platform providers, phone companies, and any other vendors who assist us in the delivery of text messages.
            </p>
            <p className="mt-4">
              All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Third-Party Disclosure
            </h2>
            <p>
              We do not sell, trade, or otherwise transfer to outside parties your personally identifiable information unless we provide users with advance notice. This does not include website hosting partners and other parties who assist us in operating our website, conducting our business, or serving our users, so long as those parties agree to keep this information confidential.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Cookies
            </h2>
            <p>
              We use cookies to help us remember and process the items in your shopping cart, understand and save your preferences for future visits, and compile aggregate data about site traffic and site interaction so that we can offer better site experiences and tools in the future.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Your Rights
            </h2>
            <p>
              You may opt out of receiving future communications from us at any time by contacting us at info@highsman.com. If you are a California resident, you have specific rights regarding your personal information under the California Consumer Privacy Act (CCPA).
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Contact Us
            </h2>
            <p>
              If you have any questions regarding this Privacy Policy, you may contact us at:
            </p>
            <p className="mt-2">
              Highsman<br />
              Email: info@highsman.com<br />
              Website: highsman.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
