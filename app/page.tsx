import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <link rel="preload" as="image" href="/hero-triptych.jpg" />
      <main
        className="relative flex min-h-screen flex-col items-center overflow-hidden text-center"
        style={{
          backgroundImage: 'url(/hero-triptych.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Brand-tinted scrim: keeps the photo visible while keeping white text
            legible over both the bright and dark panels of the triptych. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(21,13,24,0.6) 0%, rgba(21,13,24,0.15) 22%, rgba(21,13,24,0.25) 52%, rgba(21,13,24,0.8) 84%, #150D18 100%)',
          }}
        />

        <div className="relative flex w-full max-w-md flex-1 flex-col items-center justify-end gap-6 px-6 pb-16 pt-16 sm:pb-20 sm:pt-20">
          <div
            className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider text-white/70"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
          >
            <span>No biodata</span>
            <span>No infinite swipe</span>
            <span>No guessing games</span>
          </div>
          <h1 className="font-display leading-none tracking-tight" style={{ textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
            <span className="block text-6xl font-semibold text-white sm:text-7xl">Match your</span>
            <span className="gradient-text block text-7xl font-extrabold sm:text-8xl">vybe</span>
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-white/85" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
            Just Vibing, Something Real, or Rishta Ready — pick your lane before you match.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="gradient-btn rounded-full px-7 py-3 text-sm font-bold text-white shadow-lg">
              Set your intent
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-bold text-white backdrop-blur-sm"
            >
              Jump back in
            </Link>
          </div>
          <p className="text-xs text-white/60" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            Live in Bengaluru, Pune &amp; Delhi NCR. This is an MVP build — expect rough edges.
          </p>
        </div>
      </main>
    </>
  );
}
