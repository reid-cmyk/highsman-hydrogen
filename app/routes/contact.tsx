import type {MetaFunction} from '@shopify/remix-oxygen';
import {useState} from 'react';

export const meta: MetaFunction = () => {
  return [{title: 'HIGHSMAN | Contact'}];
};

export default function Contact() {
  const [formData, setFormData] = useState({
    enquiryType: '',
    name: '',
    email: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    setFormData((prev) => ({...prev, [e.target.name]: e.target.value}));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const subject = `[${formData.enquiryType}] Contact from ${formData.name}`;
      const body = `Enquiry Type: ${formData.enquiryType}\nName: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`;
      window.location.href = `mailto:Sales@highsman.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-20 md:py-32">
        <h1 className="font-headline text-4xl md:text-6xl font-bold uppercase mb-4">
          Contact Us
        </h1>
        <p className="font-body text-sm md:text-base text-on-surface-variant mb-12">
          Have questions about our products, wholesale inquiries, or just want to
          connect? Fill out the form below and we&apos;ll get back to you.
        </p>

        {status === 'sent' ? (
          <div className="bg-primary/10 border border-primary/30 p-8 text-center">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4">
              Thank You!
            </h2>
            <p className="font-body text-on-surface-variant">
              Your email client should have opened with your message. If it
              didn&apos;t, please email us directly at{' '}
              <a href="mailto:Sales@highsman.com" className="text-primary underline">
                Sales@highsman.com
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label htmlFor="enquiryType" className="block font-headline text-sm font-bold uppercase tracking-widest mb-3 text-on-surface">
                Enquiry Type
              </label>
              <select id="enquiryType" name="enquiryType" required value={formData.enquiryType} onChange={handleChange} className="w-full bg-surface-container border border-outline-variant/50 text-on-surface font-body text-sm px-4 py-3 focus:outline-none focus:border-primary appearance-none">
                <option value="" disabled>Select an enquiry type</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Consumer">Consumer</option>
                <option value="Press">Press</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="name" className="block font-headline text-sm font-bold uppercase tracking-widest mb-3 text-on-surface">
                Name
              </label>
              <input type="text" id="name" name="name" required value={formData.name} onChange={handleChange} placeholder="Your name" className="w-full bg-surface-container border border-outline-variant/50 text-on-surface font-body text-sm px-4 py-3 focus:outline-none focus:border-primary placeholder:text-on-surface-variant/40" />
            </div>

            <div>
              <label htmlFor="email" className="block font-headline text-sm font-bold uppercase tracking-widest mb-3 text-on-surface">
                Email
              </label>
              <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} placeholder="your@email.com" className="w-full bg-surface-container border border-outline-variant/50 text-on-surface font-body text-sm px-4 py-3 focus:outline-none focus:border-primary placeholder:text-on-surface-variant/40" />
            </div>

            <div>
              <label htmlFor="message" className="block font-headline text-sm font-bold uppercase tracking-widest mb-3 text-on-surface">
                Message
              </label>
              <textarea id="message" name="message" required rows={6} value={formData.message} onChange={handleChange} placeholder="How can we help you?" className="w-full bg-surface-container border border-outline-variant/50 text-on-surface font-body text-sm px-4 py-3 focus:outline-none focus:border-primary placeholder:text-on-surface-variant/40 resize-vertical" />
            </div>

            <button type="submit" disabled={status === 'sending'} className="bg-primary text-on-primary px-12 py-4 font-headline text-lg font-bold uppercase hover:bg-primary-container transition-colors disabled:opacity-50">
              {status === 'sending' ? 'Sending...' : 'Submit'}
            </button>
          </form>
        )}

        <div className="mt-20 pt-12 border-t border-outline-variant/30">
          <p className="font-body text-sm text-on-surface-variant">
            You can also reach us directly at{' '}
            <a href="mailto:Sales@highsman.com" className="text-primary underline">Sales@highsman.com</a>
          </p>
          <div className="flex gap-6 mt-4">
            <a href="https://instagram.com/highsman" target="_blank" rel="noopener noreferrer" className="font-body text-sm text-primary hover:underline">Instagram</a>
            <a href="https://twitter.com/highsman" target="_blank" rel="noopener noreferrer" className="font-body text-sm text-primary hover:underline">Twitter</a>
          </div>
        </div>
      </div>
    </div>
  );
}
