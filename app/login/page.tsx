'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';

// Shown on the login page when a real OAuth round trip (google) comes
// back with ?error=... -- see app/api/auth/google/callback. Deliberately
// separate from SOCIAL_ENDPOINT's mock-form JSON error strings below: those describe a
// mock POST failing validation, these describe a real redirect flow
// failing (or being cancelled) partway through.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Sign-in was cancelled.',
  oauth_invalid: 'That sign-in link expired or was invalid — please try again.',
  email_in_use: 'That email is already used by a different sign-in method — try phone or email code instead.',
  oauth_failed: 'Something went wrong signing in — please try again, or use phone or email code instead.',
  not_invited: "findmyVybe isn't open to the public yet — this account isn't on the invite list.",
  inactive_logout: 'You were logged out after 10 minutes of inactivity — sign back in to continue.',
  account_deleted: 'This account was deleted. If this was a mistake, contact support@findmyvybe.com to restore access.',
};

type Method = 'phone' | 'email';
type SocialProvider = 'google' | 'apple' | null;

// Instagram had a button here until 2026-09-27, and Facebook until
// 2026-09-29, both removed rather than kept mocked: Meta has no standalone
// consumer OAuth for Instagram at all (the current Instagram API only
// grants login to Instagram Business/Creator accounts, aimed at content/DM
// management tools, not "any user signs into your app with their personal
// Instagram") -- so there was never a real flow for it to grow into.
// Facebook login worked technically, but Meta's Business Verification
// requires a registered business entity to issue App Review, which
// findmyVybe doesn't have -- not worth blocking launch on, especially since
// most dating apps (Tinder, Hinge, Bumble) have themselves moved away from
// requiring/offering it, favoring phone number + Google/Apple instead.
const SOCIAL_ENDPOINT: Record<'google' | 'apple', string> = {
  google: '/api/auth/mock-google',
  apple: '/api/auth/mock-apple',
};

const SOCIAL_LABEL: Record<'google' | 'apple', string> = {
  google: 'Google',
  apple: 'Apple',
};

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.17-2H10v3.79h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.97-4.32 2.97-7.31Z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20Z" />
      <path fill="#FBBC05" d="M4.41 11.92a5.99 5.99 0 0 1 0-3.84V5.49H1.06a10 10 0 0 0 0 9.02l3.35-2.59Z" />
      <path fill="#EA4335" d="M10 3.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.96 9.96 0 0 0 10 0 10 10 0 0 0 1.06 5.49l3.35 2.59C5.2 5.72 7.4 3.96 10 3.96Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden fill="currentColor">
      <path d="M14.84 10.66c-.03-2.1 1.72-3.11 1.8-3.16-.98-1.43-2.5-1.63-3.04-1.65-1.4-.14-2.65.8-3.34.8-.7 0-1.78-.78-2.92-.76-1.5.02-2.9.87-3.66 2.2-1.57 2.72-.4 6.73 1.1 8.93.73 1.08 1.62 2.28 2.79 2.24 1.1-.04 1.53-.72 2.86-.72 1.33 0 1.72.72 2.9.7 1.19-.02 1.98-1.09 2.7-2.18.86-1.3 1.2-2.56 1.22-2.62-.03-.01-2.34-.9-2.37-3.58h-.04ZM12.44 2.58c.6-.73 1-1.75.9-2.78-.86.04-1.92.58-2.54 1.3-.56.63-1.04 1.65-.91 2.63.95.07 1.93-.49 2.55-1.15Z" />
    </svg>
  );
}

const SOCIAL_ICON: Record<'google' | 'apple', () => React.ReactElement> = {
  google: GoogleIcon,
  apple: AppleIcon,
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [method, setMethod] = useState<Method>('phone');
  const [phone, setPhone] = useState('+91');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [socialProvider, setSocialProvider] = useState<SocialProvider>(null);
  const [socialEmail, setSocialEmail] = useState('');
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // Trusted device -- see docs/PHONE_FIRST_AUTH.md. Tried silently
  // before the form ever renders: a device this browser already proved
  // itself on (any OTP/Google/Apple/passkey sign-in within the last 30
  // days) skips OTP entirely on return. checkingDevice starts true so
  // there's no flash of the phone/email form for someone about to be
  // redirected straight past it.
  const [checkingDevice, setCheckingDevice] = useState(true);

  useEffect(() => {
    fetch('/api/auth/device-login', { method: 'POST' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok && data.next) {
          router.push(data.next);
        } else {
          setCheckingDevice(false);
        }
      })
      .catch(() => setCheckingDevice(false));
  }, [router]);

  // Reached two ways: app/api/auth/google|apple/route.ts redirects back
  // here with ?mock=google|apple when that provider's real credentials
  // aren't set yet (falls back to exactly the mock form below, just
  // reached via a real navigation instead of the button's old onClick),
  // or a real callback route redirects here with ?error=<reason> after a
  // failed/cancelled OAuth round trip.
  useEffect(() => {
    const mockProvider = searchParams.get('mock');
    if (mockProvider === 'google' || mockProvider === 'apple') {
      setSocialProvider(mockProvider);
    }
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setSocialError(OAUTH_ERROR_MESSAGES[oauthError] ?? 'Something went wrong signing in — please try again.');
    }
  }, [searchParams]);

  async function signInWithPasskey() {
    setPasskeyLoading(true);
    setPasskeyError(null);
    try {
      const optionsRes = await fetch('/api/auth/passkey/login-options', { method: 'POST' });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData.error ?? 'Something went wrong');

      const assertion = await startAuthentication({ optionsJSON: optionsData.options });

      const verifyRes = await fetch('/api/auth/passkey/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error ?? 'Something went wrong');
      router.push(verifyData.next);
    } catch (err) {
      // A cancelled/timed-out OS passkey prompt throws a real DOMException
      // named NotAllowedError -- shown as a plain, calm message rather
      // than its raw technical text.
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Passkey sign-in was cancelled.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong';
      setPasskeyError(message);
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = method === 'phone' ? '/api/auth/request-otp' : '/api/auth/request-email-otp';
      const body = method === 'phone' ? { phone } : { email };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      const query = method === 'phone' ? `phone=${encodeURIComponent(phone)}` : `email=${encodeURIComponent(email)}`;
      const existingFlag = data.alreadyHasProfile ? '&existing=1' : '';
      router.push(`/verify?method=${method}&${query}${existingFlag}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function continueWithSocial(e: React.FormEvent) {
    e.preventDefault();
    if (!socialProvider) return;
    setSocialLoading(true);
    setSocialError(null);
    try {
      const res = await fetch(SOCIAL_ENDPOINT[socialProvider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: socialEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      router.push(data.next ?? '/discover');
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSocialLoading(false);
    }
  }

  // See lib/trustedDevice.ts -- a recognized device is redirected away
  // before ever seeing this screen; this placeholder is only visible for
  // the brief round trip while that check is in flight.
  if (checkingDevice) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
        <p className="text-sm text-inkSoft">Checking this device…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Sign in</h1>
        <p className="mt-2 text-sm text-inkSoft">We&apos;ll send a one-time code. No spam, ever.</p>
      </div>

      <div className="flex gap-1 rounded-full border border-line bg-white p-1">
        {(['phone', 'email'] as Method[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
              method === m ? 'gradient-btn text-white' : 'text-inkSoft'
            }`}
          >
            {m === 'phone' ? 'Phone' : 'Email'}
          </button>
        ))}
      </div>
      {/* Phone is findmyVybe's mandatory sign-up gate now (see
          docs/PHONE_FIRST_AUTH.md) -- email sign-in still works for an
          account that already has one on file, but can no longer create
          a brand-new account on its own, so this says that plainly
          rather than letting someone type an email and hit a confusing
          404 on the next screen. */}
      {method === 'email' && (
        <p className="-mt-2 text-xs text-inkSoft">
          New here? Use your phone number to sign up — email sign-in is for accounts that already have one on file.
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        {method === 'phone' ? (
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
            required
          />
        ) : (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
            required
          />
        )}
        {error && <p className="text-sm text-magenta">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? 'Sending...' : 'Send code'}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-inkSoft/60">
        <span className="h-px flex-1 bg-line" />
        or continue with
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* All buttons here share the same height, radius, font, and icon
          slot size -- only the icon and label change -- so the row reads
          as one consistent set rather than mismatched widgets. Passkey
          first: it's the fastest path for anyone who's already added
          one (see docs/PHONE_FIRST_AUTH.md), with no typing at all. */}
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={signInWithPasskey}
          disabled={passkeyLoading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:border-inkSoft/40 disabled:opacity-60"
        >
          <span className="grid h-5 w-5 flex-shrink-0 place-items-center text-base">🔐</span>
          {passkeyLoading ? 'Checking passkey…' : 'Sign in with a passkey'}
        </button>
        {passkeyError && <p className="text-sm text-magenta">{passkeyError}</p>}

        {/* A real top-level navigation to a server route that redirects to
            the real provider (once its real credentials are set) or back
            here with ?mock=google|apple otherwise -- has to be a real
            navigation, not a fetch, since an OAuth consent screen isn't
            reachable from client JS/CORS. */}
        {(['google', 'apple'] as const).map((p) => {
          const Icon = SOCIAL_ICON[p];
          return (
            <a
              key={p}
              href={`/api/auth/${p}`}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:border-inkSoft/40"
            >
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center overflow-hidden rounded-full">
                <Icon />
              </span>
              Continue with {SOCIAL_LABEL[p]}
            </a>
          );
        })}
      </div>

      {socialProvider && (
        <form
          onSubmit={continueWithSocial}
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-inkSoft/70">
            Mock {SOCIAL_LABEL[socialProvider]} sign-in
          </p>
          <p className="text-xs text-inkSoft">
            No real {SOCIAL_LABEL[socialProvider]} account is contacted in this demo — enter an email to
            simulate the profile it would hand back.
          </p>
          <input
            type="email"
            value={socialEmail}
            onChange={(e) => setSocialEmail(e.target.value)}
            placeholder="you@gmail.com"
            className="rounded-xl border border-line px-3 py-2.5 text-sm"
            required
          />
          {socialError && <p className="text-sm text-magenta">{socialError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSocialProvider(null)}
              className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-inkSoft"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={socialLoading}
              className="gradient-btn flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {socialLoading ? 'Continuing...' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      <p className="text-center text-xs text-inkSoft">
        By continuing, you agree to findmyVybe's{' '}
        <a href="/terms" className="font-semibold underline underline-offset-2">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" className="font-semibold underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
