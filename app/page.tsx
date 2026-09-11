import Link from 'next/link';
import CoupleArtDefs from '@/components/CoupleArt';

const COUPLE_COLORS = {
  '--fig-a-top': '#FF7A29',
  '--fig-b-top': '#E8367B',
  '--fig-a-arm': '#FF7A29',
  '--fig-b-arm': '#E8367B',
  '--skin-a': '#B97A4C',
  '--skin-b': '#7A4B2E',
  '--hair-a': '#0F0810',
  '--hair-b': '#0F0810',
  '--sparkle': '#FFD98A',
} as React.CSSProperties;

export default function LandingPage() {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center overflow-hidden text-center"
      style={{
        background: 'radial-gradient(120% 70% at 50% 0%, #4A2352 0%, #271A2B 45%, #150D18 100%)',
      }}
    >
      <CoupleArtDefs />

      <div className="relative w-full max-w-xs pt-10 sm:max-w-sm sm:pt-14">
        <svg viewBox="0 0 320 300" className="h-auto w-full" style={COUPLE_COLORS} aria-hidden="true">
          <use href="#couple-art" />
        </svg>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
          style={{ background: 'linear-gradient(180deg, rgba(21,13,24,0) 0%, #150D18 90%)' }}
        />
      </div>

      <div className="relative flex w-full max-w-md flex-1 flex-col items-center gap-6 px-6 pb-16 pt-2 sm:pb-20">
        <div className="flex flex-col items-center gap-0.5 text-xs font-semibold uppercase tracking-wider text-white/60">
          <span>No biodata</span>
          <span>No infinite swipe</span>
          <span>No guessing games</span>
        </div>
        <h1 className="font-display leading-none tracking-tight">
          <span className="block text-6xl font-semibold text-white sm:text-7xl">Match your</span>
          <span className="gradient-text block text-7xl font-extrabold sm:text-8xl">vybe</span>
        </h1>
        <p className="max-w-md text-lg leading-relaxed text-white/75">
          Just Vibing, Something Real, or Rishta Ready — pick your lane before you match.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="gradient-btn rounded-full px-7 py-3 text-sm font-bold text-white shadow-lg">
            Set your intent
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-bold text-white"
          >
            Jump back in
          </Link>
        </div>
        <p className="text-xs text-white/50">
          Live in Bengaluru, Pune &amp; Delhi NCR. This is an MVP build — expect rough edges.
        </p>
      </div>
    </main>
  );
}
