'use client';

import { useState } from 'react';
import OtpCodeInput from '@/components/OtpCodeInput';

export interface EmailVerifyFieldProps {
  /** Fires once the code is verified, with the email that's now on file. */
  onVerified: (email: string) => void;
  /** Prefills the email input -- optional. */
  initialEmail?: string;
  placeholder?: string;
}

/**
 * Self-contained "type an email, get a code, verify it" flow against
 * POST /api/profile/email/request-otp + /api/profile/email/verify-otp --
 * the authenticated "attach to the current session's user" pair (see
 * that route's doc comment), not the sign-in-by-email pair under
 * /api/auth/*.
 *
 * Shared by components/AccountSecuritySection.tsx (Profile screen's
 * "Add email" card) and app/onboarding/page.tsx (the Bio/basics step's
 * mandatory email capture, see docs/PHONE_FIRST_AUTH.md) -- same two
 * network calls, same OtpCodeInput verify UI, different surrounding
 * chrome, so only the request/verify logic and its two-step form are
 * shared rather than a whole styled card.
 */
export default function EmailVerifyField({ onVerified, initialEmail = '', placeholder = 'you@example.com' }: EmailVerifyFieldProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailDraft, setEmailDraft] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/email/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(codeToSubmit: string) {
    if (codeToSubmit.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/email/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDraft, code: codeToSubmit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      setCode('');
      onVerified(emailDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-2">
        <input
          type="email"
          value={emailDraft}
          onChange={(e) => setEmailDraft(e.target.value)}
          placeholder={placeholder}
          className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
          required
        />
        {error && <p className="text-sm text-magenta">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="gradient-btn self-start rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Sending...' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verifyCode(code);
      }}
      className="flex flex-col gap-2"
    >
      <p className="text-sm text-inkSoft">Enter the 6-digit code we sent to {emailDraft}.</p>
      <OtpCodeInput value={code} onChange={setCode} onComplete={verifyCode} disabled={busy} error={Boolean(error)} />
      {error && <p className="text-sm text-magenta">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Verifying...' : 'Verify'}
        </button>
        <button type="button" onClick={() => setStep('email')} className="text-sm font-semibold text-inkSoft">
          Use a different email
        </button>
      </div>
    </form>
  );
}
