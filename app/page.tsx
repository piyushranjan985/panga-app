import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider text-inkSoft/70">
        <span>No biodata</span>
        <span>No infinite swipe</span>
        <span>No guessing games</span>
      </div>
      <h1 className="font-display leading-none tracking-tight">
        <span className="block text-6xl font-semibold text-inkSoft sm:text-7xl">Match your</span>
        <span className="gradient-text block text-7xl font-extrabold sm:text-8xl">vybe</span>
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-inkSoft">
        Just Vibing, Something Real, or Rishta Ready — pick your lane before you match.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/login" className="gradient-btn rounded-full px-7 py-3 text-sm font-bold text-white shadow-lg">
          Set your intent
        </Link>
        <Link href="/login" className="rounded-full border border-magenta/30 px-7 py-3 text-sm font-bold text-magenta">
          Jump back in
        </Link>
      </div>
      <p className="text-xs text-inkSoft">
        Live in Bengaluru, Pune &amp; Delhi NCR. This is an MVP build — expect rough edges.
      </p>
    </main>
  );
}
