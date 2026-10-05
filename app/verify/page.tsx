'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OtpCodeInput from '@/components/OtpCodeInput';
import { parseJsonResponse } from '@/lib/fetchJson';

/** "+919876543210" -> "+91 98765 43210" -- display formatting only, never sent anywhere or stored this way. */
function formatPhoneForDisplay(phone: string): string {
  const match = phone.match(/^\+91(\d{5})(\d{5})$/);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const method = params.get('method') === 'email' ? 'email' : 'phone';
  const phone = params.get('phone') ?? '';
  const email = params.get('email') ?? '';
  const destination = method === 'email' ? email : phone;
  const defaultDisplay = method === 'phone' && phone ? formatPhoneForDisplay(phone) : destination;
  const alreadyHasProfile = params.get('existing') === '1';
  // A phone sign-in can come back routed to email instead (see
  // /api/auth/request-otp's doc comment and docs/PHONE_FIRST_AUTH.md
  // §9) -- state, not just the initial query params, so a resend that
  // re-resolves the channel can update what's shown here too.
  const [deliveryChannel, setDeliveryChannel] = useState(params.get('channel') === 'email' ? 'email' : method);
  const [deliveryMasked, setDeliveryMasked] = useState(params.get('masked') ?? '');
  const usingFallbackChannel = deliveryChannel !== method;
  const displayDestination = usingFallbackChannel && deliveryMasked ? deliveryMasked : defaultDisplay;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A code was just sent from the login page, so resending immediately
  // would only ever be useful if it got lost -- a short cooldown (rather
  // than an unlimited-tap button) discourages hammering the OTP provider
  // while still giving people a real way out when the first one never
  // arrives. Mirrors lib/otpRateLimit.ts's default OTP_RESEND_COOLDOWN_SECONDS
  // (60s) -- this is just the client-side countdown display; the server
  // enforces the real cooldown (possibly a longer, progressive one)
  // independently either way.
  const RESEND_COOLDOWN_SECONDS = 60;
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
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) setResendCooldown(retryAfter);
        throw new Error(data.error ?? "Couldn't resend the code");
      }
      if (data.channel) setDeliveryChannel(data.channel === 'email' ? 'email' : method);
      if (data.maskedDestination) setDeliveryMasked(data.maskedDestination);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Couldn't resend the code");
    } finally {
      setResending(false);
    }
  }

  async function submitCode(codeToSubmit: string) {
    if (codeToSubmit.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = method === 'email' ? '/api/auth/verify-email-otp' : '/api/auth/verify-otp';
      const body = method === 'email' ? { email, code: codeToSubmit } : { phone, code: codeToSubmit };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      router.push(data.next ?? '/discover');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  function editDestination() {
    const query = method === 'email' ? `email=${encodeURIComponent(email)}` : `phone=${encodeURIComponent(phone)}`;
    router.push(`/login?method=${method}&${query}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Enter your code</h1>
        <p className="mt-2 text-sm text-inkSoft">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-ink">{displayDestination || (method === 'email' ? 'your email' : 'your number')}</span>
          {usingFallbackChannel
            ? " -- your verified email, not a text message, to keep this account's SMS use low"
            : ''}
          .{' '}
          <button type="button" onClick={editDestination} className="font-semibold text-magenta underline-offset-2 hover:underline">
            Edit {method === 'email' ? 'email' : 'number'}
          </button>
        </p>
      </div>
      {alreadyHasProfile && (
        <p className="rounded-xl bg-marigold/10 px-3 py-2 text-sm text-inkSoft">
          Welcome back — an account already exists with this {method === 'email' ? 'email' : 'number'}. Verifying
          will sign you in to it, not start a new profile.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCode(code);
        }}
        className="flex flex-col gap-3"
      >
        <OtpCodeInput value={code} onChange={setCode} onComplete={submitCode} disabled={loading} error={Boolean(error)} />
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
      </form>
      <div className="text-center text-sm text-inkSoft">
        Didn&apos;t receive it?{' '}
        {resendCooldown > 0 ? (
          <span>Resend code in {resendCooldown}s</span>
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
        {resendError && (
          <p role="alert" aria-live="polite" className="mt-1 text-sm text-magenta">
            {resendError}
          </p>
        )}
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
