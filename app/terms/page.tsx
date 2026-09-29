import Link from 'next/link';

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
 * TWO PLACEHOLDERS TO FILL IN BEFORE RELYING ON THIS FOR REAL:
 *  1. "findmyVybe ('we', 'us')" below doesn't name a registered legal
 *     entity, because none exists in this codebase or anywhere else in
 *     this project yet -- same approach privacy/page.tsx already takes
 *     for the same reason. Once incorporated (or if run as a sole
 *     proprietorship under GST registration), add the real entity
 *     name/address to the "Who we are" section.
 *  2. "Governing law" names the courts of Ranchi, Jharkhand -- an
 *     explicit choice for this project, not a generic default. Still
 *     worth confirming with counsel once a registered entity exists,
 *     since that entity's actual state of incorporation is usually the
 *     more defensible jurisdiction to name.
 */
export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-magenta">
        &larr; findmyVybe
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Terms of Service</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-inkSoft">Last updated: 29 September 2026</p>

      <p className="mt-6 text-inkSoft">
        These terms are the agreement between you and findmyVybe ("we", "us") for using the findmyVybe app --
        an early-stage (MVP) dating &amp; matrimony-lite app for India. We're rolling out city by city,
        starting with Bengaluru. By creating an account or otherwise using findmyVybe, you agree to these terms and to our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>
        , which explains what we collect and why. If you don't agree, please don't use the app.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Who can use findmyVybe</h2>
      <p className="mt-2 text-inkSoft">
        You must be 18 or older. Creating an account on behalf of someone under 18, or misrepresenting your age
        or identity, is a breach of these terms and grounds for immediate account removal -- see "Identity
        verification" below for how we check this. You may keep one personal account only; it's for your own
        use, not for representing a business, a group, or someone else. The information you give us during
        onboarding and in your profile (name, date of birth, gender, city, bio, photos, and the rest) needs to
        be genuinely yours and accurate -- findmyVybe only works if the people on it are who they say they are.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Your account</h2>
      <p className="mt-2 text-inkSoft">
        You can sign in with a one-time code sent to your phone or email, or with "Continue with Google."
        Whichever method you use, you're responsible for keeping access to that phone number, email inbox, or
        Google account secure -- anyone who can complete your sign-in
        method can access your findmyVybe account. Tell us right away at{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>{' '}
        if you think your account's been accessed without your permission.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Identity verification</h2>
      <p className="mt-2 text-inkSoft">
        Discovery, matching, and messaging are only unlocked once your identity verification is complete and
        passes -- this is mandatory, not optional, and is how we keep the platform 18+ and reduce fake accounts.
        Where a real government-ID verification provider is connected, this checks your document's own date of
        birth and a name consistent with your profile. If verification is still processing, fails, or is
        rejected, the app will tell you plainly and won't let you skip ahead. See our{' '}
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
        hasn't consented to being shown on your profile. Your bio, prompts, and other profile text follow the
        same rule: they're yours, and they follow the conduct rules below.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Community conduct</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe exists for genuine dating and relationship-building, not for anything on this list, which is
        also exactly what our safety team's review categories cover -- a report or automated flag in any of
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
          <strong className="text-ink">Fake or "catfish" profiles</strong> -- someone else's photos, a fictional
          identity, or an account you're not the real, sole user of.
        </li>
        <li>
          <strong className="text-ink">Underage users</strong> -- an account confirmed to belong to someone
          under 18 is removed the moment we know.
        </li>
        <li>
          <strong className="text-ink">Sexual content</strong> shared without the other person's consent, or at
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
        is between you and them. We don't run background checks beyond the identity verification described
        above, and we can't guarantee any other member's conduct, intentions, or safety. Meet in public places,
        tell a friend where you're going, and trust your judgment. After a match, you can optionally leave
        "Vybe Check" feedback (meet again / maybe / not for me) -- this helps your own future matching, not a
        public rating of the other person.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Reporting, blocking &amp; enforcement</h2>
      <p className="mt-2 text-inkSoft">
        Any chat's "…" menu lets you block or report another member -- blocking is immediate and mutual (neither
        of you will see the other again); a report opens a safety case our team reviews. If we take action on
        your account (a warning, a messaging or discovery restriction, a temporary suspension, or a permanent
        ban), we'll tell you why where we reasonably can, and you can appeal by writing to{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>
        . We may act on a report or an automated flag before you're notified, where waiting would create a
        safety risk.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Cost</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe is free -- there's no paid tier or subscription today, and every feature (matching, chat,
        Vybe Check, verification, location distance) is available to everyone at no cost. If that changes in
        the future, we'll update these terms and tell members clearly before anything is ever charged.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Your content, and our license to show it</h2>
      <p className="mt-2 text-inkSoft">
        You keep ownership of the photos, bio, prompts, and messages you post. By posting them, you give
        findmyVybe a license to store, display, and transmit that content to other members as the app's
        ordinary features require (showing your profile to potential matches, delivering your messages to the
        person you sent them to, and so on) -- nothing more, and never for third-party advertising. This license
        ends when you delete that content or your account, except where we're required to retain something
        longer (for example, evidence tied to an open safety investigation), as described in our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>
        .
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Ending your account</h2>
      <p className="mt-2 text-inkSoft">
        You can stop using findmyVybe at any time. "Delete my account" on your Profile screen deactivates
        your account and blocks sign-in immediately; you can also request deletion by emailing{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>{' '}
        -- see "Delete your data" in our{' '}
        <Link href="/privacy" className="font-semibold text-magenta">
          Privacy Policy
        </Link>{' '}
        for exactly what deleting does and doesn't do, including how to undo it. We can suspend or
        terminate your account for breaching these terms, including the community conduct rules above,
        being confirmed underage, or suspected fraud or abuse.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">The app itself</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe is an early-stage MVP, provided "as is" -- we're actively building it, which means features,
        matching quality, and availability can change, and things will occasionally break. We don't guarantee
        you'll find a match, a relationship, or any particular outcome from using the app. To the extent the law
        allows, we're not liable for indirect or consequential losses arising from your use of the app or your
        interactions with other members -- this doesn't limit any liability that can't be excluded under Indian
        law.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Governing law</h2>
      <p className="mt-2 text-inkSoft">
        These terms are governed by the laws of India, and any dispute arising from them or your use of
        findmyVybe is subject to the exclusive jurisdiction of the courts of Ranchi, Jharkhand.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Changes to these terms</h2>
      <p className="mt-2 text-inkSoft">
        If these terms change meaningfully, we'll update the date at the top of this page and, where the change
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
  );
}
