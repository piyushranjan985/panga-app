'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import OtpCodeInput from '@/components/OtpCodeInput';

export interface AccountSecurityData {
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  googleLinked: boolean;
  appleLinked: boolean;
  passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string }[];
}

/**
 * Account & Security section on the Profile screen -- see
 * docs/PHONE_FIRST_AUTH.md. New sign-ups are phone-first (the account
 * can't exist without a verified phone), but every account that existed
 * before this change was grandfathered in with no phone at all, so this
 * section has to handle "no phone yet" as a normal, common state rather
 * than an edge case.
 *
 * Deliberately read-only for Google/Apple -- unlinking a social login
 * isn't offered here (out of scope for this change); those two rows are
 * just status badges. Email and phone each get a real "add/verify" flow
 * since those are the two things grandfathered accounts are missing.
 */
export default function AccountSecuritySection({
  account,
  onChange,
}: {
  account: AccountSecurityData | null;
  onChange: () => void;
}) {
  const [phoneStep, setPhoneStep] = useState<'closed' | 'phone' | 'code'>('closed');
  const [phoneDraft, setPhoneDraft] = useState('+91');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [emailStep, setEmailStep] = useState<'closed' | 'email' | 'code'>('closed');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);

  if (!account) return null;

  async function sendPhoneCode(e: React.FormEvent) {
    e.preventDefault();
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const res = await fetch('/api/profile/phone/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setPhoneStep('code');
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyPhoneCode(codeToSubmit: string) {
    if (codeToSubmit.length !== 6 || phoneBusy) return;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const res = await fetch('/api/profile/phone/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDraft, code: codeToSubmit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      setPhoneStep('closed');
      setPhoneCode('');
      onChange();
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Invalid code');
      setPhoneCode('');
    } finally {
      setPhoneBusy(false);
    }
  }

  async function sendEmailCode(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailError(null);
    try {
      const res = await fetch('/api/profile/email/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setEmailStep('code');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setEmailBusy(false);
    }
  }

  async function verifyEmailCode(codeToSubmit: string) {
    if (codeToSubmit.length !== 6 || emailBusy) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const res = await fetch('/api/profile/email/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailDraft, code: codeToSubmit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      setEmailStep('closed');
      setEmailCode('');
      onChange();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Invalid code');
      setEmailCode('');
    } finally {
      setEmailBusy(false);
    }
  }

  async function addPasskey() {
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const optionsRes = await fetch('/api/profile/passkey/register-options', { method: 'POST' });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error ?? 'Could not start passkey setup');
      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch('/api/profile/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error ?? 'Could not save passkey');
      onChange();
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : 'Could not add a passkey on this device');
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function removePasskey(id: string) {
    setRemovingPasskeyId(id);
    setPasskeyError(null);
    try {
      const res = await fetch(`/api/profile/passkey/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not remove that passkey');
      }
      onChange();
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : 'Could not remove that passkey');
    } finally {
      setRemovingPasskeyId(null);
    }
  }

  function maskPhone(phone: string) {
    return phone.length > 4 ? `${phone.slice(0, -4).replace(/\d/g, '•')}${phone.slice(-4)}` : phone;
  }
  function maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(name.length - 2, 1))}@${domain}`;
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-white p-4">
      <h2 className="font-display text-lg font-bold">Account & security</h2>
      <p className="mt-1 text-sm text-inkSoft">
        How you sign in to findmyVybe -- add a passkey or trust this device so you're not stuck waiting on an SMS
        every time you come back.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {/* Phone */}
        <div className="rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Phone number</p>
              <p className="text-sm text-inkSoft">
                {account.phone && account.phoneVerified ? maskPhone(account.phone) : 'Not added yet'}
              </p>
            </div>
            {account.phone && account.phoneVerified ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">Verified</span>
            ) : phoneStep === 'closed' ? (
              <button
                type="button"
                onClick={() => {
                  setPhoneError(null);
                  setPhoneStep('phone');
                }}
                className="rounded-full border border-line px-4 py-2 text-xs font-bold"
              >
                Add phone
              </button>
            ) : null}
          </div>

          {phoneStep === 'phone' && (
            <form onSubmit={sendPhoneCode} className="mt-3 flex flex-col gap-2">
              <input
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                placeholder="+919876543210"
                className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
                required
              />
              {phoneError && <p className="text-sm text-magenta">{phoneError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={phoneBusy}
                  className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {phoneBusy ? 'Sending...' : 'Send code'}
                </button>
                <button type="button" onClick={() => setPhoneStep('closed')} className="text-sm font-semibold text-inkSoft">
                  Cancel
                </button>
              </div>
            </form>
          )}
          {phoneStep === 'code' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyPhoneCode(phoneCode);
              }}
              className="mt-3 flex flex-col gap-2"
            >
              <p className="text-sm text-inkSoft">Enter the 6-digit code we sent to {phoneDraft}.</p>
              <OtpCodeInput value={phoneCode} onChange={setPhoneCode} onComplete={verifyPhoneCode} disabled={phoneBusy} error={Boolean(phoneError)} />
              {phoneError && <p className="text-sm text-magenta">{phoneError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={phoneBusy || phoneCode.length !== 6}
                  className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {phoneBusy ? 'Verifying...' : 'Verify'}
                </button>
                <button type="button" onClick={() => setPhoneStep('phone')} className="text-sm font-semibold text-inkSoft">
                  Use a different number
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Email */}
        <div className="rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Email address</p>
              <p className="text-sm text-inkSoft">
                {account.email && account.emailVerified ? maskEmail(account.email) : 'Not added yet'}
              </p>
            </div>
            {account.email && account.emailVerified ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">Verified</span>
            ) : emailStep === 'closed' ? (
              <button
                type="button"
                onClick={() => {
                  setEmailError(null);
                  setEmailStep('email');
                }}
                className="rounded-full border border-line px-4 py-2 text-xs font-bold"
              >
                Add email
              </button>
            ) : null}
          </div>

          {emailStep === 'email' && (
            <form onSubmit={sendEmailCode} className="mt-3 flex flex-col gap-2">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="you@example.com"
                className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
                required
              />
              {emailError && <p className="text-sm text-magenta">{emailError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {emailBusy ? 'Sending...' : 'Send code'}
                </button>
                <button type="button" onClick={() => setEmailStep('closed')} className="text-sm font-semibold text-inkSoft">
                  Cancel
                </button>
              </div>
            </form>
          )}
          {emailStep === 'code' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyEmailCode(emailCode);
              }}
              className="mt-3 flex flex-col gap-2"
            >
              <p className="text-sm text-inkSoft">Enter the 6-digit code we sent to {emailDraft}.</p>
              <OtpCodeInput value={emailCode} onChange={setEmailCode} onComplete={verifyEmailCode} disabled={emailBusy} error={Boolean(emailError)} />
              {emailError && <p className="text-sm text-magenta">{emailError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={emailBusy || emailCode.length !== 6}
                  className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {emailBusy ? 'Verifying...' : 'Verify'}
                </button>
                <button type="button" onClick={() => setEmailStep('email')} className="text-sm font-semibold text-inkSoft">
                  Use a different email
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Social sign-in -- read-only status, no unlink flow (out of scope) */}
        <div className="rounded-2xl border border-line p-3">
          <p className="text-sm font-bold">Social sign-in</p>
          <div className="mt-2 flex gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                account.googleLinked ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-inkSoft'
              }`}
            >
              Google {account.googleLinked ? '· linked' : '· not linked'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                account.appleLinked ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-inkSoft'
              }`}
            >
              Apple {account.appleLinked ? '· linked' : '· not linked'}
            </span>
          </div>
        </div>

        {/* Passkeys */}
        <div className="rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">Passkeys</p>
            <button
              type="button"
              onClick={addPasskey}
              disabled={passkeyBusy}
              className="rounded-full border border-line px-4 py-2 text-xs font-bold disabled:opacity-60"
            >
              {passkeyBusy ? 'Adding...' : '+ Add a passkey'}
            </button>
          </div>
          <p className="mt-1 text-sm text-inkSoft">
            Sign in with your face, fingerprint, or device PIN -- no code, no waiting on SMS.
          </p>
          {passkeyError && <p className="mt-2 text-sm text-magenta">{passkeyError}</p>}
          {account.passkeys.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {account.passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                  <span className="text-sm">{pk.label}</span>
                  <button
                    type="button"
                    onClick={() => removePasskey(pk.id)}
                    disabled={removingPasskeyId === pk.id}
                    className="text-xs font-semibold text-magenta disabled:opacity-60"
                  >
                    {removingPasskeyId === pk.id ? 'Removing...' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
