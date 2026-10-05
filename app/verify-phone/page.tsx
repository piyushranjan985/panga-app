'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import OtpCodeInput from '@/components/OtpCodeInput';
import { parseJsonResponse } from '@/lib/fetchJson';

/**
 * The mandatory phone-verification gate -- see docs/PHONE_FIRST_AUTH.md.
 * Reached only by someone who just signed in (via Google, Apple, or a
 * grandfathered legacy email account) but has no verified phone AND no
 * profile yet -- lib/auth/postAuthRedirect.ts's nextPathAfterAuth is
 * what routes here instead of straight to /onboarding. Already requires
 * a session (proxy.ts protects every path not explicitly public, and
 * this one isn't), so the request-otp/verify-otp calls below always
 * attach to whoever just signed in, never create a second account.
 *
 * Two-step UI (enter phone -> enter code), same shape as the ordinary
 * login+verify flow, just combined on one screen since there's no
 * separate "which method" choice here -- phone is the only option.
 */
export default function VerifyPhonePage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+91');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/phone/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(codeToSubmit: string) {
    if (codeToSubmit.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/phone/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: codeToSubmit }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      // No profile exists yet -- that's the only way to reach this page
      // (see nextPathAfterAuth) -- so onboarding is always next.
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="font-display text-3xl font-extrabold">One more step</h1>
        <p className="mt-2 text-sm text-inkSoft">
          {step === 'phone'
            ? "Verify your phone number to finish setting up findmyVybe -- it's the one thing we check to keep fake accounts out. We'll text you a one-time code, nothing else."
            : `Enter the 6-digit code we sent to ${phone}.`}
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            aria-label="Phone number"
            className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
            required
          />
          {error && (
            <p role="alert" aria-live="polite" className="text-sm text-magenta">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send code'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verifyCode(code);
          }}
          className="flex flex-col gap-3"
        >
          <OtpCodeInput value={code} onChange={setCode} onComplete={verifyCode} disabled={loading} error={Boolean(error)} />
          <p role="alert" aria-live="polite" className="min-h-[1.25rem] text-sm text-magenta">
            {error}
          </p>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Verify & continue'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
            className="text-sm font-semibold text-inkSoft underline-offset-2 hover:underline"
          >
            Use a different number
          </button>
        </form>
      )}
    </main>
  );
}
