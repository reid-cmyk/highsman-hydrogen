import type {MetaFunction} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Terms of Service'}];
};

export default function TermsOfService() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-20 md:py-32">
        <h1 className="font-headline text-4xl md:text-6xl font-bold uppercase mb-12">
          Terms of Service
        </h1>

        <div className="font-body text-sm md:text-base leading-relaxed text-on-surface-variant space-y-8">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant/60">
            Last updated: March 30, 2026
          </p>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Agreement to Terms
            </h2>
            <p>
              By accessing or using the Highsman website at highsman.com, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the website.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Age Requirement
            </h2>
            <p>
              You must be at least 21 years of age to access this website and purchase any products. By using this site, you represent and warrant that you are at least 21 years old and that you have the legal right to consume cannabis products in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Products &amp; Availability
            </h2>
            <p>
              All products displayed on this website are subject to availability. Highsman cannabis products are only available in jurisdictions where their sale and use are legal. We reserve the right to limit quantities, refuse service, and discontinue products at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              SMS/Text Messaging Terms
            </h2>
            <p>
              By opting in to receive SMS messages from Highsman, you agree to receive customer care and promotional text messages at the phone number you provided. Message frequency may vary. Standard Message and Data Rates may apply.
            </p>
            <p className="mt-4">
              You may opt out at any time by replying STOP. For assistance, reply HELP. See our{' '}
              <a href="/policies/privacy-policy" className="underline text-primary">Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Intellectual Property
            </h2>
            <p>
              All content on this website, including text, graphics, logos, images, and software, is the property of Highsman or its content suppliers and is protected by United States and international copyright laws.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Limitation of Liability
            </h2>
            <p>
              Highsman shall not be liable for any damages arising from the use or inability to use the materials on this site. Cannabis products should be used responsibly and in accordance with all applicable laws and regulations.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Governing Law
            </h2>
            <p>
              These Terms of Service shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Contact Us
            </h2>
            <p>If you have questions about these Terms, contact us at:</p>
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
