import type {MetaFunction} from '@shopify/remix-oxygen';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Contact'}];
};

export default function Contact() {
  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-20 md:py-32">
        <h1 className="font-headline text-4xl md:text-6xl font-bold uppercase mb-12">
          Contact Us
        </h1>

        <div className="font-body text-sm md:text-base leading-relaxed text-on-surface-variant space-y-12">
          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Get in Touch
            </h2>
            <p>
              Have questions about our products, wholesale inquiries, or just want to connect? We&apos;d love to hear from you.
            </p>
          </section>

          <section className="space-y-6">
            <div>
              <h3 className="font-headline text-lg font-bold uppercase mb-2 text-on-surface">
                Email
              </h3>
              <a href="mailto:info@highsman.com" className="text-primary hover:underline">
                info@highsman.com
              </a>
            </div>

            <div>
              <h3 className="font-headline text-lg font-bold uppercase mb-2 text-on-surface">
                Follow Us
              </h3>
              <div className="flex gap-6">
                <a href="https://instagram.com/highsman" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Instagram</a>
                <a href="https://twitter.com/highsman" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Twitter</a>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-headline text-xl md:text-2xl font-bold uppercase mb-4 text-on-surface">
              Wholesale Inquiries
            </h2>
            <p>
              Interested in carrying Highsman products at your dispensary or retail location? Reach out to us at{' '}
              <a href="mailto:info@highsman.com" className="text-primary hover:underline">info@highsman.com</a>
              {' '}with &quot;Wholesale&quot; in the subject line and we&apos;ll get back to you.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
