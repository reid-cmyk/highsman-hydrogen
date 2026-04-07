const RATINGS = [
  { product: "Blueberry Blitz Hit Stick", stars: 5.0, count: 11 },
  { product: "Cake Quake Hit Stick", stars: 4.0, count: 8 },
];

const TESTIMONIALS = [
  {
    quote: "Very happy with purchase and definitely will be ordering from them again.",
    attribution: "Cake Quake Hit Stick customer",
  },
  {
    quote: "This one is one of my favorite and best tasting.",
    attribution: "Blueberry Blitz Hit Stick customer",
  },
  {
    quote: "Smokes very smooth. 9/10 for me.",
    attribution: "Hit Stick customer",
  },
  {
    quote: "Definitely recommend this one.",
    attribution: "Hit Stick customer",
  },
];

const PRESS = [
  { name: "Forbes", url: "https://www.highsman.com/inthenews/nfl-star-ricky-williams-launches-his-own-cannabis-brand-highsman" },
  { name: "Los Angeles Times", url: "https://www.youtube.com/watch?v=DFzYb12iOog" },
  { name: "Boardroom", url: "https://boardroom.tv/ricky-williams-highsman-cannabis/" },
  { name: "Real Time with Bill Maher", url: "https://www.tvmaze.com/episodes/2269828/real-time-with-bill-maher-20x04-ricky-williams-vivek-ramaswamy-marianne-williamson" },
  { name: "All The Smoke", url: "https://podcasts.apple.com/cz/podcast/ricky-williams-ep-132-all-the-smoke-full-episode/id1483638752?i=1000558186099" },
  { name: "Barstool Sports", url: "https://www.youtube.com/watch?v=oFNQltuFPd0" },
  { name: "Yahoo Sports", url: "https://sports.yahoo.com/rush-heisman-highsman-ricky-williams-035017375.html" },
  { name: "Front Office Sports", url: "https://podcasts.apple.com/us/podcast/the-ricky-williams-interview/id1289046573?i=1000632736938" },
];

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} className={`w-4 h-4 ${n <= stars ? 'text-primary' : 'text-outline-variant/30'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export function SocialProof() {
  return (
    <section className="bg-surface-container-low px-8 md:px-16 py-24 space-y-20">

      {/* Testimonials */}
      <div>
        <h2 className="font-headline text-3xl md:text-5xl font-bold uppercase mb-4 text-center tracking-tight">
          LOVED BY CANNABIS CONSUMERS
        </h2>
        <p className="font-body text-on-surface-variant text-center text-sm uppercase tracking-widest mb-10">
          Real reviews. Real smokers. Real love.
        </p>

        {/* Ratings strip */}
        <div className="flex flex-wrap justify-center gap-8 mb-12">
          {RATINGS.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <StarRating stars={r.stars} />
              <span className="font-body text-sm text-on-surface-variant">
                <span className="font-bold text-on-surface">{r.stars.toFixed(1)}</span>
                {' '}({r.count} ratings) — {r.product}
              </span>
            </div>
          ))}
        </div>

        {/* Quote grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-surface p-10 flex flex-col justify-between border-t-4 border-primary">
              <p className="font-body text-on-surface-variant text-lg leading-relaxed mb-8">
                &ldquo;{t.quote}&rdquo;
              </p>
              <p className="font-headline text-sm uppercase tracking-widest text-on-surface-variant/60">
                — {t.attribution}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Press */}
      <div className="border-t border-outline-variant/20 pt-16">
        <p className="font-headline text-sm uppercase tracking-[0.4em] text-on-surface-variant text-center mb-10">
          AS SEEN IN
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6">
          {PRESS.map((p, i) => (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-headline text-xl md:text-3xl font-bold uppercase text-on-surface-variant/40 tracking-widest hover:text-on-surface-variant/70 transition-colors no-underline"
            >
              {p.name}
            </a>
          ))}
        </div>
      </div>

    </section>
  );
}
