import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';

/**
 * Real, published Privacy Policy -- required before Google will let
 * "Sign in with Google" open beyond a handful of added test users.
 * #data-deletion below covers self-service and support-assisted account
 * deletion; it isn't tied to any OAuth provider's requirements.
 *
 * DRAFT, NOT LEGAL ADVICE: this describes what findmyVybe's code
 * actually does today (verified against this codebase, not generic
 * boilerplate), written so it's accurate and specific -- but it was
 * written by an AI assistant, not reviewed by a lawyer. Have qualified
 * counsel review it before relying on it, especially for India's
 * Digital Personal Data Protection Act, 2023 (DPDP Act) and the IT
 * Rules, 2021, both of which apply to an India-focused app handling
 * this kind of data (location, photos, government ID). The contact
 * email in the "Contact us" and "Delete your data" sections below is
 * support@findmyvybe.com (a real, monitored inbox) -- Meta in
 * particular may actually test that a Data Deletion request sent there
 * gets a response, so keep that inbox checked once OAuth review starts.
 */
export default function PrivacyPolicyPage() {
  return (
    <>
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink">
      <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-magenta">
        &larr; findmyVybe
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Privacy Policy</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-inkSoft">Last updated: 4 October 2026</p>

      <p className="mt-6 text-inkSoft">
        This policy explains what findmyVybe (&quot;we&quot;, &quot;us&quot;) collects when you use the app, why, and what you
        can do about it. findmyVybe is an early-stage (MVP) dating &amp; matrimony-lite app for India. We&apos;re
        rolling out city by city, starting with Bengaluru.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Information we collect</h2>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Account &amp; sign-in.</strong> Depending on how you sign in: your phone
        number (for a one-time SMS code), your email address (for a one-time email code), or — if you choose
        &quot;Continue with Google&quot; — the basic profile Google shares with us after you consent (your name, email
        address, and a unique account identifier from that provider). We never see or store your Google
        password.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Profile information.</strong> What you enter during onboarding and in your
        profile: display name, date of birth, gender and who you&apos;re looking for, city, bio, your stated intent
        (Just Vibing, Something Real, or Rishta Ready) and the intent-specific details that go with it
        (interests, prompts, relationship style, tribes, values, or family/future-plans questions).
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Location.</strong> Your city (set during onboarding) is always used to find
        matches nearby. Sharing your device&apos;s precise location is optional and off by default — we only ask when
        you explicitly tap &quot;Share location&quot; on your Profile, which triggers your phone&apos;s or browser&apos;s own
        permission prompt. That prompt gives you two outcomes: <strong className="text-ink">While Using the
        App</strong>, so we can read your location only while findmyVybe is open, or <strong className="text-ink">
        Never</strong>, so we don&apos;t get it at all and nothing else changes — Just Vibing and the rest of the app
        still work from your city instead. We never request &quot;Always&quot;/background access (the same approach Tinder
        takes), and we never ask automatically. If you do share it, we use it to show a rounded distance to other
        members (e.g. &quot;3 km away,&quot; never your exact coordinates) and, in Just Vibing mode specifically, to find
        and rank nearby matches more precisely. You can turn location sharing off at any time from your Profile,
        which deletes the stored coordinates.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Photos.</strong> Every photo you upload is automatically checked before it
        can be shown to anyone else — for whether it contains a real, visible human face, and for nudity or
        sexually explicit content — using on-device/server-side image analysis, not a third-party service. A
        photo that fails either check is rejected or held for a person on our team to review; only photos that
        pass are ever shown to other members.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Identity verification.</strong> To keep the platform 18+ and reduce fake
        accounts, we run an identity check. Where a real government-ID verification provider is connected, this
        confirms your document&apos;s own date of birth and a name consistent with your profile — we never store your
        ID document itself, only a one-way cryptographic hash (to detect the same ID being used on two accounts)
        and a masked reference number. Where no real provider is connected yet, this step is a basic placeholder
        check only, and we say so plainly in the app rather than claiming a verification that didn&apos;t happen.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Messages.</strong> Messages, prompts, and plans you exchange with a match,
        so the conversation can be delivered and (if needed) reviewed in response to a safety report.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Device &amp; login activity.</strong> Each time you sign in, we record the
        approximate login method, rough platform (web/iOS/Android), IP address, and browser/device identifier —
        used for account security and to investigate abuse reports, not for advertising.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Push notification tokens.</strong> If you allow notifications on iOS,
        Android, or web, your device registers a token with Firebase Cloud Messaging (our notification
        provider) so we can deliver alerts for new matches, messages, and a Mystery Match reveal. We never send
        notifications without that explicit device/browser permission, and turning notifications off in your
        device settings stops them and removes the stored token.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">How we use it</h2>
      <p className="mt-2 text-inkSoft">
        To create and run your profile, show you relevant people to match with, deliver messages, keep the
        platform to people 18 and older, moderate photos and profiles for safety, respond to reports and
        support requests, and investigate suspected fraud, fake accounts, or abuse. We do not sell your personal
        information, and we do not use it to serve third-party ads.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Who we share it with</h2>
      <p className="mt-2 text-inkSoft">
        Other members only see what your profile and settings choose to show them (never your phone number,
        email, or raw location — only an approximate distance). Infrastructure providers that store or process
        data on our behalf under contract (our database and file-storage hosts) — never sold or handed over for
        their own marketing use. If you sign in with Google, the only data exchanged is the standard OAuth
        handshake needed to confirm who you are; we don&apos;t post to your Google account or read
        anything beyond the basic profile you approve on their consent screen. We disclose information to law
        enforcement only when legally required to.
      </p>
      <p className="mt-2 text-inkSoft">
        <strong className="text-ink">Vybe Vouch.</strong> If you choose to use Vybe Vouch, you generate a
        private link and send it yourself to one person of your choosing. That person — who doesn&apos;t need a
        findmyVybe account, and whose phone number or email we never collect — sees a privacy-safe summary of
        the specific match you invited them to look at (not your full profile or your messages), and can leave
        a short reaction and optional note, which is shown only to you, never to the person you matched with or
        anyone else. You can revoke an unused invite at any time.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Your choices</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-inkSoft">
        <li>
          <strong className="text-ink">Quiet Mode</strong> temporarily hides you from Discover while keeping
          your profile, matches, and chats — reversible any time from your Profile.
        </li>
        <li>
          <strong className="text-ink">Blocking &amp; reporting</strong> are available from any chat&apos;s &quot;…&quot; menu.
        </li>
        <li>
          <strong className="text-ink">Location sharing</strong> can be turned on or off any time from your
          Profile&apos;s Location section — turning it off deletes the stored coordinates immediately.
        </li>
        <li>
          <strong className="text-ink">Mystery Match preference</strong> (Mystery Match, Vybe Flip, No-Labels
          Match, or opted out) can be changed any time from your Profile. When you&apos;re paired, your photo and
          name stay masked to that match until both of you choose to reveal them.
        </li>
        <li>
          <strong className="text-ink">Push notifications</strong> can be turned off any time from your
          device&apos;s or browser&apos;s notification settings.
        </li>
        <li>
          <strong className="text-ink">Access or export your data:</strong> contact us (below) and we&apos;ll help.
        </li>
        <li>
          <strong className="text-ink">Delete your account and data:</strong> see &quot;Delete your data&quot; below.
        </li>
      </ul>

      <h2 id="data-deletion" className="mt-8 font-display text-xl font-bold">
        Delete your data
      </h2>
      <p className="mt-2 text-inkSoft">
        &quot;Delete my account&quot; on your Profile screen takes effect immediately: your account is deactivated,
        you&apos;re signed out everywhere, and signing back in won&apos;t work. Your profile, photos, and matches
        stop being visible to other members right away. We don&apos;t erase everything the instant you tap
        delete, though -- Indian law (the IT Rules, 2021) requires platforms like ours to retain a
        deleted account&apos;s records for a minimum period (180 days) for investigation purposes, and longer
        if there&apos;s an open safety investigation or legal hold. During that window your data is kept, not
        visible to anyone else on the app, and used only for that legal purpose -- then permanently
        anonymized. If you change your mind before then, email{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>{' '}
        from the email or phone number your account used and we can restore your access. You can also
        always request deletion this way instead of the in-app button, or ask us to permanently erase
        your data sooner than the retention window where the law allows it.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Governing law</h2>
      <p className="mt-2 text-inkSoft">
        This policy is governed by the laws of India, and any dispute arising from it or from how we
        handle your data is subject to the exclusive jurisdiction of the courts of Ranchi, Jharkhand.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Security</h2>
      <p className="mt-2 text-inkSoft">
        Your session is protected by a signed, HTTP-only cookie; passwords are never stored (sign-in is
        one-time-code or OAuth based); photos and identity-document references are handled as described above.
        No system is perfectly secure, and we keep improving these protections as the product grows.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Age requirement</h2>
      <p className="mt-2 text-inkSoft">
        findmyVybe is for people 18 and older only. An account confirmed to belong to someone under 18 is
        removed from the platform.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Changes to this policy</h2>
      <p className="mt-2 text-inkSoft">
        If this policy changes meaningfully, we&apos;ll update the date at the top of this page and, where the
        change is significant, let members know in the app.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold">Contact us</h2>
      <p className="mt-2 text-inkSoft">
        Questions about this policy or your data:{' '}
        <a href="mailto:support@findmyvybe.com" className="font-semibold text-magenta">
          support@findmyvybe.com
        </a>
        . For the designated Grievance Officer under India&apos;s IT Rules, 2021, see the{' '}
        <Link href="/terms" className="font-semibold text-magenta">
          Terms of Service
        </Link>
        .
      </p>
    </main>
    <SiteFooter />
    </>
  );
}
