'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Method = 'phone' | 'email';
type SocialProvider = 'google' | 'facebook' | null;

const SOCIAL_COPY: Record<'google' | 'facebook', { label: string; badge: string; badgeBg: string }> = {
  google: { label: 'Google', badge: 'G', badgeBg: '#4285F4' },
  facebook: { label: 'Facebook', badge: 'f', badgeBg: '#1877F2' },
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
      const res = await fetch(`/api/auth/mock-${socialProvider}`, {
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

      <div className="flex gap-3">
        {(['google', 'facebook'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setSocialProvider(p);
              setSocialError(null);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold"
          >
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: SOCIAL_COPY[p].badgeBg }}
              aria-hidden
            >
              {SOCIAL_COPY[p].badge}
            </span>
            {SOCIAL_COPY[p].label}
          </button>
        ))}
      </div>

      {socialProvider && (
        <form
          onSubmit={continueWithSocial}
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-inkSoft/70">
            Mock {SOCIAL_COPY[socialProvider].label} sign-in
          </p>
          <p className="text-xs text-inkSoft">
            No real {SOCIAL_COPY[socialProvider].label} account is contacted in this demo — enter an email to
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
