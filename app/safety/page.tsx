import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';

/**
 * Public "Safety Center" -- the discoverable front door every competitor
 * (Tinder's Safety Center, Bumble's safety features page, Shaadi.com's
 * "Be Safe Online", Jeevansathi's "Fraud Alert") has that findmyVybe
 * didn't. The underlying safety guidance already existed, just buried
 * inside the searchable Help Center FAQ (lib/helpCenter.ts's 'safety'
 * and 'contact' categories) with nothing pointing newcomers to it. This
 * page doesn't duplicate that content -- it summarizes it and deep-links
 * into the exact FAQ entries (/help?entry=<id>, the same pattern
 * app/help/page.tsx already supports) for the full answer, so there's
 * one place the detailed wording lives and stays in sync.
 */
export default function SafetyCenterPage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-magenta">
        &larr; findmyVybe
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Safety Center</h1>
      <p className="mt-2 text-inkSoft">
        A quick rundown of what findmyVybe does to keep this a safe place, and what to do if something feels off.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Before you meet</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-inkSoft">
        <li>Meet in a public place for a first date, and arrange your own transport there and back.</li>
        <li>
          Tell a friend or family member where you&apos;re going and who with --{' '}
          <Link href="/help?entry=sf-vybe-vouch-what" className="font-semibold text-magenta">
            Vybe Vouch
          </Link>{' '}
          lets you send a private link to someone you trust for a second opinion on a match before you meet them.
        </li>
        <li>
          findmyVybe doesn&apos;t have in-app video or voice calling yet -- if you want to see and hear someone before
          meeting, do that on a platform you both already trust.
        </li>
        <li>Trust your instincts. If something feels wrong, it&apos;s fine to cancel or leave, no explanation needed.</li>
      </ul>

      <h2 className="mt-8 font-display text-xl font-bold">Romance &amp; rishta scams</h2>
      <p className="mt-2 text-inkSoft">
        Whether someone says they&apos;re &quot;just vibing&quot; or ready for marriage, the same red flags apply: anyone who asks
        you for money, gift cards, investment &quot;tips,&quot; your OTPs, or your bank/ID details is scamming you -- no
        exception, no matter how long you&apos;ve been talking or how convincing the story is (a sudden emergency, a
        stuck shipment, a &quot;guaranteed&quot; investment). Never send money or share financial or government-ID details
        with someone you&apos;ve only met on the app. If a profile feels too polished, avoids video calls, or rushes
        straight to marriage talk or money, report it.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Verification &amp; reporting</h2>
      <p className="mt-2 text-inkSoft">
        Every profile photo is moderated before anyone else can see it, and verified members carry a badge. If a
        profile looks fake, a message makes you uncomfortable, or anything else is off, use{' '}
        <Link href="/help?entry=sf-report" className="font-semibold text-magenta">
          Report
        </Link>{' '}
        or{' '}
        <Link href="/help?entry=sf-block" className="font-semibold text-magenta">
          Block
        </Link>{' '}
        from the &quot;...&quot; menu in your conversation with them -- reporting is reviewed by the team, and blocking is
        immediate and ends the match on both sides.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">If you&apos;re in immediate danger</h2>
      <p className="mt-2 text-inkSoft">
        Contact local emergency services first -- that always comes before anything in the app. Once you&apos;re safe,
        report and block the person involved so the team has a record and they can&apos;t contact you again.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">More questions</h2>
      <p className="mt-2 text-inkSoft">
        The{' '}
        <Link href="/help" className="font-semibold text-magenta">
          Help Center
        </Link>{' '}
        has the full safety FAQ, or email{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>{' '}
        any time.
      </p>
    </main>
    <SiteFooter />
    </>
  );
}
