import Link from 'next/link';

/**
 * Shared marketing/document-page footer -- About, Safety Center, Help
 * Center, Privacy, Terms, and a visible support email. Mounted on the
 * public-facing pages (landing, Help Center, Privacy, Terms, About,
 * Safety) only, never inside the authenticated app shell (Discover/
 * Matches/Profile), which already has its own fixed bottom tab bar from
 * Navbar.tsx -- a second fixed/footer element there would fight it for
 * screen space on exactly the small-viewport devices this app targets.
 *
 * Added because support@findmyvybe.com previously only appeared buried
 * inside Privacy/Terms body text and a couple of error messages -- never
 * somewhere a prospective member (or a journalist, or an app store
 * reviewer) would actually look first. Every competitor matrimony/dating
 * product (Shaadi.com, BharatMatrimony, Jeevansathi, Tinder, Hinge,
 * Bumble) surfaces contact + safety + about links in a persistent
 * footer; this gives findmyVybe the same.
 */
export default function SiteFooter() {
  return (
    <footer className="mx-auto mt-10 max-w-2xl px-6 pb-10">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-6 text-xs font-semibold text-inkSoft">
        <Link href="/about" className="hover:text-magenta">
          About
        </Link>
        <Link href="/safety" className="hover:text-magenta">
          Safety Center
        </Link>
        <Link href="/help" className="hover:text-magenta">
          Help Center
        </Link>
        <Link href="/privacy" className="hover:text-magenta">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-magenta">
          Terms of Service
        </Link>
        <a href="mailto:support@findmyvybe.com" className="hover:text-magenta">
          support@findmyvybe.com
        </a>
      </div>
      <p className="mt-4 text-center text-[11px] text-inkSoft">
        findmyVybe -- MVP, rolling out city by city, currently Bengaluru.
      </p>
    </footer>
  );
}
