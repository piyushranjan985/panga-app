'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const method = params.get('method') === 'email' ? 'email' : 'phone';
  const phone = params.get('phone') ?? '';
  const email = params.get('email') ?? '';
  const destination = method === 'email' ? email : phone;
  const alreadyHasProfile = params.get('existing') === '1';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // A code was just sent from the login page, so resending immediately
  // would only ever be useful if it got lost -- a short cooldown (rather
  // than an unlimited-tap button) discourages hammering the mock OTP
  // provider while still giving people a real way out when the first one
  // never arrives.
  const RESEND_COOLDOWN_SECONDS = 30;
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function resendCode() {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setResendError(null);
    setError(null);
    try {
      const endpoint = method === 'email' ? '/api/auth/request-email-otp' : '/api/auth/request-otp';
      const body = method === 'email' ? { email } : { phone };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't resend the code");
      setHint(data.devHint ?? null);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Couldn't resend the code");
    } finally {
      setResending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = method === 'email' ? '/api/auth/verify-email-otp' : '/api/auth/verify-otp';
      const body = method === 'email' ? { email, code } : { phone, code };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      router.push(data.hasProfile ? '/discover' : '/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Enter the code</h1>
        <p className="mt-2 text-sm text-inkSoft">
          Sent to {destination || (method === 'email' ? 'your email' : 'your number')}. In dev mode, the code is
          always <span className="mono font-semibold">123456</span>.
        </p>
      </div>
      {alreadyHasProfile && (
        <p className="rounded-xl bg-marigold/10 px-3 py-2 text-sm text-inkSoft">
          Welcome back — an account already exists with this {method === 'email' ? 'email' : 'number'}. Verifying
          will sign you in to it, not start a new profile.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          inputMode="numeric"
          maxLength={6}
          className="rounded-2xl border border-line bg-white px-4 py-3 text-center text-2xl tracking-[0.5em]"
          required
        />
        {error && <p className="text-sm text-magenta">{error}</p>}
        {hint && <p className="text-sm text-mint">{hint}</p>}
        <button
          type="submit"
          disabled={loading}
          className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? 'Verifying...' : 'Verify & continue'}
        </button>
      </form>
      <div className="text-center text-sm text-inkSoft">
        Didn&apos;t get a code?{' '}
        {resendCooldown > 0 ? (
          <span>Resend in {resendCooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={resendCode}
            disabled={resending}
            className="font-semibold text-magenta underline-offset-2 hover:underline disabled:opacity-60"
          >
            {resending ? 'Resending...' : 'Resend code'}
          </button>
        )}
        {resendError && <p className="mt-1 text-sm text-magenta">{resendError}</p>}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
