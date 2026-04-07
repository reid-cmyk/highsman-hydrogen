// Social Proof Component — update content in this file when real quotes/press/partners are ready

const TESTIMONIALS = [
  {
    quote: "The Hit Stick goes everywhere with me. Clean, discreet, hits like a full session.",
    name: "Marcus T.",
    location: "Los Angeles, CA",
  },
  {
    quote: "Best pre-roll I've had. The triple infusion is real — you can taste the difference.",
    name: "Jordan K.",
    location: "Denver, CO",
  },
  {
    quote: "Ground Game is the move. Same quality, I pack my own. Value per gram is unmatched.",
    name: "Darius M.",
    location: "Houston, TX",
  },
];

const PRESS = [
  { name: "High Times", blurb: "A performance brand built different." },
  { name: "Leafly", blurb: "Highsman sets the standard for triple-infused." },
  { name: "Forbes", blurb: "Ricky Williams' cannabis brand is the real deal." },
];

const DISPENSARY_PARTNERS = [
  "MedMen", "Cookies", "Harvest House", "Planet 13", "Curaleaf",
];

export function SocialProof() {
  return (
    <section className="bg-surface-container-low px-8 md:px-16 py-24 space-y-20">

      {/* Testimonials */}
      <div>
        <h2 className="font-headline text-3xl md:text-5xl font-bold uppercase mb-12 text-center tracking-tight">
          WHAT THEY'RE SAYING
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-surface p-10 flex flex-col justify-between border-t-4 border-primary">
              <p className="font-body text-on-surface-variant text-lg leading-relaxed mb-8">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="font-headline text-xl uppercase font-bold">{t.name}</p>
                <p className="font-body text-xs uppercase tracking-widest text-on-surface-variant">{t.location}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Press */}
      <div className="border-t border-outline-variant/20 pt-16">
        <p className="font-headline text-sm uppercase tracking-[0.4em] text-on-surface-variant text-center mb-10">
          AS SEEN IN
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12">
          {PRESS.map((p, i) => (
            <div key={i} className="text-center">
              <p className="font-headline text-2xl md:text-4xl font-bold uppercase text-on-surface-variant/40 tracking-widest">
                {p.name}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Dispensary Partners */}
      <div className="border-t border-outline-variant/20 pt-16">
        <p className="font-headline text-sm uppercase tracking-[0.4em] text-on-surface-variant text-center mb-10">
          AVAILABLE AT
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8">
          {DISPENSARY_PARTNERS.map((name, i) => (
            <span
              key={i}
              className="font-headline text-xl uppercase tracking-widest text-on-surface-variant/50 border border-outline-variant/20 px-6 py-2"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

    </section>
  );
}
