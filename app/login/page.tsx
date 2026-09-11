'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Method = 'phone' | 'email';
type SocialProvider = 'google' | 'facebook' | 'instagram' | null;

// Instagram has no standalone consumer OAuth (Meta folded it into Facebook
// Login), so "Continue with Instagram" intentionally hits the same
// /api/auth/mock-facebook endpoint as the Facebook button — same identity
// column, same mock flow, just a different icon/label so people can pick
// whichever account they think of first.
const SOCIAL_ENDPOINT: Record<'google' | 'facebook' | 'instagram', string> = {
  google: '/api/auth/mock-google',
  facebook: '/api/auth/mock-facebook',
  instagram: '/api/auth/mock-facebook',
};

const SOCIAL_LABEL: Record<'google' | 'facebook' | 'instagram', string> = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
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

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="#1877F2" />
      <path fill="#fff" d="M13.3 10.5h-1.9V17H9V10.5H7.6V8.3H9V6.9c0-1.7.8-3.4 3.3-3.4h2v2.1h-1.4c-.4 0-.9.2-.9 1.1v1.6h2.4l-.3 2.2Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <defs>
        <linearGradient id="igGrad" x1="0" y1="20" x2="20" y2="0">
          <stop offset="0" stopColor="#FED576" />
          <stop offset="0.26" stopColor="#F47133" />
          <stop offset="0.61" stopColor="#BC3081" />
          <stop offset="1" stopColor="#4C63D2" />
        </linearGradient>
      </defs>
      <rect width="20" height="20" rx="5.5" fill="url(#igGrad)" />
      <rect x="4.5" y="4.5" width="11" height="11" rx="3" stroke="#fff" strokeWidth="1.3" fill="none" />
      <circle cx="10" cy="10" r="3" stroke="#fff" strokeWidth="1.3" fill="none" />
      <circle cx="14" cy="6" r="0.8" fill="#fff" />
    </svg>
  );
}

const SOCIAL_ICON: Record<'google' | 'facebook' | 'instagram', () => React.ReactElement> = {
  google: GoogleIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
};

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('phone');
  const [phone, setPhone] = useState('+91');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [socialProvider, setSocialProvider] = useState<SocialProvider>(null);
  const [socialEmail, setSocialEmail] = useState('');
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);

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
      setHint(data.devHint ?? null);
      const query = method === 'phone' ? `phone=${encodeURIComponent(phone)}` : `email=${encodeURIComponent(email)}`;
      router.push(`/verify?method=${method}&${query}`);
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
      router.push(data.hasProfile ? '/discover' : '/onboarding');
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSocialLoading(false);
    }
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
        {hint && <p className="text-sm text-mint">{hint}</p>}
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

      {/* Every button here shares the same height, radius, font, and icon
          slot size — only the icon and label change per provider — so the
          row reads as one consistent set instead of three mismatched
          widgets bolted together. */}
      <div className="flex flex-col gap-2.5">
        {(['google', 'facebook', 'instagram'] as const).map((p) => {
          const Icon = SOCIAL_ICON[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setSocialProvider(p);
                setSocialError(null);
              }}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:border-inkSoft/40"
            >
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center overflow-hidden rounded-full">
                <Icon />
              </span>
              Continue with {SOCIAL_LABEL[p]}
            </button>
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
    </main>
  );
}
