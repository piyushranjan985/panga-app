import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';

/**
 * Real, published Terms of Service -- required alongside app/privacy/
 * page.tsx before Google will grant OAuth consent screen verification.
 * Paste https://findmyvybe.com/terms into the Google console's
 * "Application Terms of Service link" field.
 *
 * DRAFT, NOT LEGAL ADVICE: like privacy/page.tsx, this describes what
 * findmyVybe's code actually does today (verified against this
 * codebase -- account states, moderation categories, Report/Block/
 * DateFeedback models, the free-for-now pricing, etc. -- not generic
 * boilerplate), written so it's accurate and specific. It was written
 * by an AI assistant, not reviewed by a lawyer. Have qualified counsel
 * review it before relying on it, especially for India's Consumer
 * Protection (E-Commerce) Rules, 2020, the IT Rules, 2021 (this is an
 * "intermediary" under those rules once user-to-user messaging is
 * live), and the DPDP Act, 2023.
 *
 * ONE PLACEHOLDER LEFT TO FILL IN BEFORE RELYING ON THIS FOR REAL:
 *  1. "findmyVybe ('we', 'us')" below doesn't name a registered legal
 *     entity, because none exists in this codebase or anywhere else in
 *     this project yet -- same approach privacy/page.tsx already takes
 *     for the same reason. Once incorporated (or if run as a sole
 *     proprietorship under GST registration), add the real entity
 *     name/address to the "Who we are" section. (The Grievance Officer
 *     section below is separate -- Rule 3(2) doesn't require a
 *     registered entity to name one, so P K Ranjan/support@findmyvybe.com,
 *     supplied directly by the project owner, is already filled in.)
 *  2. "Governing law" names the courts of Ranchi, Jharkhand -- an
 *     explicit choice for this project, not a generic default. Still
 *     worth confirming with counsel once a registered entity exists,
 *     since that entity's actual state of incorporation is usually the
 *     more defensible jurisdiction to name.
 */
export default function TermsOfServicePage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-magenta">
        &larr; findmyVybe
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Terms of Service</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-inkSoft">Last updated: 4 October 2026</p>

      <p className="mt-6 text-inkSoft">
        These terms are the agreement between you and findmyVybe (&quot;we&quot;, &quot;us&quot;) for using the findmyVybe app --
        an early-stage (MVP) dating &amp; matrimony-lite app for India. We&apos;re rolling out city by city,
        starting with Bengaluru. By creating an account or otherwise using findmyVybe, you agree to these terms and to our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>
        , which explains what we collect and why. If you don&apos;t agree, please don&apos;t use the app.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Who can use findmyVybe</h2>
      <p className="mt-2 text-inkSoft">
        You must be 18 or older. Creating an account on behalf of someone under 18, or misrepresenting your age
        or identity, is a breach of these terms and grounds for immediate account removal -- see &quot;Identity
        verification&quot; below for how we check this. You may keep one personal account only; it&apos;s for your own
        use, not for representing a business, a group, or someone else. The information you give us during
        onboarding and in your profile (name, date of birth, gender, city, bio, photos, and the rest) needs to
        be genuinely yours and accurate -- findmyVybe only works if the people on it are who they say they are.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Your account</h2>
      <p className="mt-2 text-inkSoft">
        You can sign in with a one-time code sent to your phone or email, or with &quot;Continue with Google.&quot;
        Whichever method you use, you&apos;re responsible for keeping access to that phone number, email inbox, or
        Google account secure -- anyone who can complete your sign-in
        method can access your findmyVybe account. Tell us right away at{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>{' '}
        if you think your account&apos;s been accessed without your permission.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Identity verification</h2>
      <p className="mt-2 text-inkSoft">
        Discovery, matching, and messaging are only unlocked once your identity verification is complete and
        passes -- this is mandatory, not optional, and is how we keep the platform 18+ and reduce fake accounts.
        Where a real government-ID verification provider is connected, this checks your document&apos;s own date of
        birth and a name consistent with your profile. If verification is still processing, fails, or is
        rejected, the app will tell you plainly and won&apos;t let you skip ahead. See our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>{' '}
        for exactly what we store from this process (a one-way hash and a masked reference number -- never your
        ID document itself).
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Photos &amp; profile content</h2>
      <p className="mt-2 text-inkSoft">
        Every photo you upload is automatically screened before anyone else can see it -- for a real, visible
        human face, and for nudity or sexually explicit content -- and a photo that fails either check is
        rejected or held for manual review. Photos must be genuinely of you, current, and not of anyone who
        hasn&apos;t consented to being shown on your profile. Your bio, prompts, and other profile text follow the
        same rule: they&apos;re yours, and they follow the conduct rules below.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Community conduct</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe exists for genuine dating and relationship-building, not for anything on this list, which is
        also exactly what our safety team&apos;s review categories cover -- a report or automated flag in any of
        these areas can lead to a warning, message or discovery restrictions, suspension, or a ban depending on
        severity:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-inkSoft">
        <li>
          <strong className="text-ink">Harassment, threats, or blackmail</strong> directed at another member.
        </li>
        <li>
          <strong className="text-ink">Scams or fraud</strong> -- including asking another member for money,
          gifts, investments, or financial details, however the request is framed.
        </li>
        <li>
          <strong className="text-ink">Fake or &quot;catfish&quot; profiles</strong> -- someone else&apos;s photos, a fictional
          identity, or an account you&apos;re not the real, sole user of.
        </li>
        <li>
          <strong className="text-ink">Underage users</strong> -- an account confirmed to belong to someone
          under 18 is removed the moment we know.
        </li>
        <li>
          <strong className="text-ink">Sexual content</strong> shared without the other person&apos;s consent, or at
          all outside what identity/photo verification already screens for.
        </li>
        <li>
          <strong className="text-ink">Spam or suspicious automated behavior</strong> -- bulk messaging, bots,
          or using the app for anything other than genuine one-to-one connection.
        </li>
        <li>Impersonating another person, findmyVybe staff, or law enforcement.</li>
        <li>Using the app to advertise, solicit, or recruit for anything unrelated to dating.</li>
      </ul>

      <h2 className="mt-8 font-display text-xl font-bold">Meeting in person</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe helps you connect with other members -- what happens if you choose to meet someone in person
        is between you and them. We don&apos;t run background checks beyond the identity verification described
        above, and we can&apos;t guarantee any other member&apos;s conduct, intentions, or safety. Meet in public places,
        tell a friend where you&apos;re going, and trust your judgment. After a match, you can optionally leave
        &quot;Vybe Check&quot; feedback (meet again / maybe / not for me) -- this helps your own future matching, not a
        public rating of the other person.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Mystery Match, Vybe Flip &amp; No-Labels Match</h2>
      <p className="mt-2 text-inkSoft">
        These are optional, opt-in daily pairings you choose from your Profile screen -- you&apos;re only ever
        paired with someone who has independently chosen the same option as you, that same day. No-Labels
        Match can pair you with someone whose stated intent is different from yours; the first time you select
        it, we&apos;ll show you a short explainer, and selecting it again means you understand and accept that. A
        Mystery Match pairing is a real match like any other (the same reporting, blocking, and conduct rules
        below apply in full) except that your photo and name stay masked to each other until you both choose
        to reveal them in chat -- revealing is one-way and can&apos;t be undone, and we&apos;ll never pressure you to do
        it on any particular timeline.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Vybe Vouch</h2>
      <p className="mt-2 text-inkSoft">
        From a match&apos;s &quot;…&quot; menu, you can optionally invite one person you trust to look at a privacy-safe
        summary of that specific match and share a quick reaction with you. That person doesn&apos;t need a
        findmyVybe account, and we never collect their contact details -- you share the link with them
        yourself. Their response is shown only to you; it&apos;s advisory only and never affects your match,
        messaging, or the other member in any way, and the other member is never told an invite happened. Don&apos;t
        use Vybe Vouch to share someone else&apos;s information anywhere the privacy-safe summary wouldn&apos;t already
        be appropriate to share.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Reporting, blocking &amp; enforcement</h2>
      <p className="mt-2 text-inkSoft">
        Any chat&apos;s &quot;…&quot; menu lets you block or report another member -- blocking is immediate and mutual (neither
        of you will see the other again); a report opens a safety case our team reviews. If we take action on
        your account (a warning, a messaging or discovery restriction, a temporary suspension, or a permanent
        ban), we&apos;ll tell you why where we reasonably can, and you can appeal by writing to{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>
        . We may act on a report or an automated flag before you&apos;re notified, where waiting would create a
        safety risk.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Cost</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe is free -- there&apos;s no paid tier or subscription today, and every feature (matching, chat,
        Vybe Check, verification, location distance) is available to everyone at no cost. If that changes in
        the future, we&apos;ll update these terms and tell members clearly before anything is ever charged.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Your content, and our license to show it</h2>
      <p className="mt-2 text-inkSoft">
        You keep ownership of the photos, bio, prompts, and messages you post. By posting them, you give
        findmyVybe a license to store, display, and transmit that content to other members as the app&apos;s
        ordinary features require (showing your profile to potential matches, delivering your messages to the
        person you sent them to, and so on) -- nothing more, and never for third-party advertising. This license
        ends when you delete that content or your account, except where we&apos;re required to retain something
        longer (for example, evidence tied to an open safety investigation), as described in our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>
        .
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Ending your account</h2>
      <p className="mt-2 text-inkSoft">
        You can stop using findmyVybe at any time. &quot;Delete my account&quot; on your Profile screen deactivates
        your account and blocks sign-in immediately; you can also request deletion by emailing{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>{' '}
        -- see &quot;Delete your data&quot; in our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>{' '}
        for exactly what deleting does and doesn&apos;t do, including how to undo it. We can suspend or
        terminate your account for breaching these terms, including the community conduct rules above,
        being confirmed underage, or suspected fraud or abuse.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">The app itself</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe is an early-stage MVP, provided &quot;as is&quot; -- we&apos;re actively building it, which means features,
        matching quality, and availability can change, and things will occasionally break. We don&apos;t guarantee
        you&apos;ll find a match, a relationship, or any particular outcome from using the app. Distance and
        nearby-match results depend on your device&apos;s location accuracy (or, if you haven&apos;t shared it, your
        city&apos;s general area) and aren&apos;t guaranteed to be precise. To the extent the law allows, we&apos;re not liable
        for indirect or consequential losses arising from your use of the app or your interactions with other
        members -- this doesn&apos;t limit any liability that can&apos;t be excluded under Indian law.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Governing law</h2>
      <p className="mt-2 text-inkSoft">
        These terms are governed by the laws of India, and any dispute arising from them or your use of
        findmyVybe is subject to the exclusive jurisdiction of the courts of Ranchi, Jharkhand.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Grievance Officer</h2>
      <p className="mt-2 text-inkSoft">
        In accordance with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code)
        Rules, 2021, the Grievance Officer for findmyVybe is:
      </p>
      <p className="mt-2 text-inkSoft">
        <span className="font-semibold">P K Ranjan</span>
        <br />
        Grievance Officer
        <br />
        Email:{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>
      </p>
      <p className="mt-2 text-inkSoft">
        We&apos;ll acknowledge a complaint within 24 hours of receiving it and work to resolve it within 15 days.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Changes to these terms</h2>
      <p className="mt-2 text-inkSoft">
        If these terms change meaningfully, we&apos;ll update the date at the top of this page and, where the change
        is significant, let members know in the app. Continuing to use findmyVybe after a change takes effect
        means you accept the updated terms.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Contact us</h2>
      <p className="mt-2 text-inkSoft">
        Questions about these terms:{' '}
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
