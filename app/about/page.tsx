import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';

/**
 * Public "About" page -- the one thing every competitor (Shaadi.com,
 * BharatMatrimony, Jeevansathi, Tinder, Hinge, Bumble) has that
 * findmyVybe didn't: somewhere that explains what the product is and
 * why it exists, reachable without signing in.
 *
 * Deliberately doesn't claim a registered legal entity name, a founding
 * story, or team bios -- none of those exist in this codebase yet (see
 * app/terms/page.tsx's "TWO PLACEHOLDERS" comment: no incorporated
 * entity exists as of this writing). Everything below only states what
 * the product actually is and does today, matching the honest "MVP,
 * rolling out city by city -- expect rough edges" framing already on
 * the landing page, so this page never gets ahead of the real product.
 */
export default function AboutPage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-magenta">
        &larr; findmyVybe
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">About findmyVybe</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-inkSoft">MVP &middot; closed beta &middot; Bengaluru</p>

      <p className="mt-6 text-inkSoft">
        findmyVybe is a vibe-based dating &amp; matrimony-lite platform built for Indian Gen Z -- a single app for
        whatever you&apos;re actually looking for, instead of forcing casual dating and family-approved matchmaking into
        two separate apps with two separate sets of lies.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Say the quiet part first</h2>
      <p className="mt-2 text-inkSoft">
        Before you match with anyone, you pick a lane: <span className="font-semibold">Just Vibing</span> (casual,
        no pressure), <span className="font-semibold">Something Real</span> (looking for an actual relationship), or{' '}
        <span className="font-semibold">Rishta Ready</span> (marriage-minded). Everyone sees your intent upfront, so
        nobody matches with someone who secretly wanted something different.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">No biodata, no infinite swipe</h2>
      <p className="mt-2 text-inkSoft">
        No forms that read like a government application, and no bottomless swipe deck designed to keep you
        scrolling. Discovery is built around shared interests, city, and the intent you actually chose --
        occasionally mixed up with Wild Card, Mystery Match, Vybe Flip, and No-Labels Match, so finding someone stays
        a little bit fun instead of a chore.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">A trust layer that respects your pace</h2>
      <p className="mt-2 text-inkSoft">
        Every profile photo goes through moderation before it&apos;s visible to anyone else. Verified members get a badge.
        You can block or report in one tap, pause your profile from Discover without deleting your account, and send
        a private <span className="font-semibold">Vybe Vouch</span> link to a friend for a second opinion on a match
        before you meet. See the{' '}
        <Link href="/safety" className="font-semibold text-magenta">
          Safety Center
        </Link>{' '}
        for the full picture.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Where we are right now</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe is an early build, rolling out one city at a time -- starting with Bengaluru. Expect rough edges,
        expect things to change, and expect us to actually read what you tell us.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Get in touch</h2>
      <p className="mt-2 text-inkSoft">
        Questions, feedback, press, or anything else:{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>
        .
      </p>
    </main>
    <SiteFooter />
    </>
  );
}
