import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <span className="rounded-full bg-magenta/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-magenta">
        Built for India, born after &apos;95
      </span>
      <h1 className="font-display text-5xl font-extrabold leading-tight sm:text-6xl">
        Not a swipe app.
        <br />
        Not a shaadi site.
        <br />
        <span className="gradient-text">Somewhere in the panga.</span>
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-inkSoft">
        Panga matches you on vibe, not just a face card — and asks upfront whether you&apos;re
        just vibing, chasing something real, or rishta-ready. No infinite swipe. No family
        ambush. No ghosting without a goodbye.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="gradient-btn rounded-full px-7 py-3 text-sm font-bold text-white shadow-lg"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-line px-7 py-3 text-sm font-bold text-ink"
        >
          I already have an account
        </Link>
      </div>
      <p className="text-xs text-inkSoft">
        Live in Bengaluru, Pune &amp; Delhi NCR. This is an MVP build — expect rough edges.
      </p>
    </main>
  );
}
