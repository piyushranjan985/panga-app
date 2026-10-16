'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import OtpCodeInput from '@/components/OtpCodeInput';
import EmailVerifyField from '@/components/EmailVerifyField';

export interface AccountSecurityData {
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  googleLinked: boolean;
  passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string }[];
}

/**
 * The mandatory "confirm it's you" step before a genuine phone/email
 * CHANGE (not a first-time add) is allowed to proceed -- see
 * app/api/profile/{phone,email}/confirm-old/*.ts's doc comments for
 * the server-side half of this. Shared between the Phone and Email
 * cards below since it's the exact same two-call shape either way
 * (POST with no body to send a code to whichever destination the
 * server picks, then POST {code} to verify it) -- only the endpoints
 * differ.
 */
function ConfirmOldStep({
  requestPath,
  verifyPath,
  onConfirmed,
  onCancel,
}: {
  requestPath: string;
  verifyPath: string;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'intro' | 'code'>('intro');
  const [maskedDestination, setMaskedDestination] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(requestPath, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setMaskedDestination(data.maskedDestination ?? null);
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
      const res = await fetch(verifyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToSubmit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm text-inkSoft">
        First, let&apos;s confirm it&apos;s you -- we&apos;ll send a one-time code to the contact method this account
        already trusts, separate from the one you&apos;re about to change.
      </p>
      {step === 'intro' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          className="flex gap-2"
        >
          <button
            type="submit"
            disabled={busy}
            className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Sending...' : 'Send code'}
          </button>
          <button type="button" onClick={onCancel} className="text-sm font-semibold text-inkSoft">
            Cancel
          </button>
        </form>
      )}
      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verifyCode(code);
          }}
          className="flex flex-col gap-2"
        >
          <p className="text-sm text-inkSoft">
            Enter the 6-digit code we sent to {maskedDestination ?? 'your trusted contact'}.
          </p>
          <OtpCodeInput value={code} onChange={setCode} onComplete={verifyCode} disabled={busy} error={Boolean(error)} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="gradient-btn rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={onCancel} className="text-sm font-semibold text-inkSoft">
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-magenta">{error}</p>}
    </div>
  );
}

/**
 * Account & Security section on the Profile screen -- see
 * docs/PHONE_FIRST_AUTH.md. New sign-ups are phone-first (the account
 * can't exist without a verified phone), but every account that existed
 * before this change was grandfathered in with no phone at all, so this
 * section has to handle "no phone yet" as a normal, common state rather
 * than an edge case.
 *
 * Deliberately read-only for Google -- unlinking a social login isn't
 * offered here (out of scope for this change); that row is just a
 * status badge. Email and phone each get a real "add/verify" flow since
 * those are the two things grandfathered accounts are missing. (Apple
 * Sign-In was removed 2026-10-05 -- it was a scaffold, never configured
 * in production -- see docs/PHONE_FIRST_AUTH.md.)
 *
 * The SAME "add/verify" flow also covers CHANGING an already-verified
 * phone or email -- both hit the same /request-otp + /verify-otp pair
 * either way (see those routes' doc comments), so this component just
 * swaps "Add phone"/"Add email" for "Change" once a value is already
 * verified, rather than branching into a second UI. A genuine change
 * (not a first-time add) gets the OLD contact notified once it
 * succeeds, since that's the one person who'd notice an account
 * takeover in progress -- and, before that, has to clear the
 * ConfirmOldStep gate above first: a code sent to whatever this
 * account already trusts, required before the server will even issue
 * a code to a NEW destination. That's what actually stops a stolen
 * session cookie alone from being enough to hijack the account's
 * contact info -- the post-change notice is a backstop, this is the
 * lock. See app/api/profile/{phone,email}/confirm-old/*.ts's doc
 * comments for the server side.
 */
export default function AccountSecuritySection({
  account,
  onChange,
}: {
  account: AccountSecurityData | null;
  onChange: () => void;
}) {
  const [phoneStep, setPhoneStep] = useState<'closed' | 'confirmOld' | 'phone' | 'code'>('closed');
  const [phoneDraft, setPhoneDraft] = useState('+91');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [emailStep, setEmailStep] = useState<'closed' | 'confirmOld' | 'verify'>('closed');

  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);

  const [signOutOtherBusy, setSignOutOtherBusy] = useState(false);
  const [signOutOtherError, setSignOutOtherError] = useState<string | null>(null);
  const [signOutOtherDone, setSignOutOtherDone] = useState(false);

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
      if (!res.ok) {
        // The confirm-old window (see lib/otp.ts) lapsed between finishing
        // that step and getting here -- send them back to redo it rather
        // than surfacing a confusing error for something routine.
        if (data.code === 'CONFIRM_OLD_REQUIRED') {
          setPhoneStep('confirmOld');
          return;
        }
        throw new Error(data.error ?? 'Something went wrong');
      }
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

  async function signOutOtherDevices() {
    setSignOutOtherBusy(true);
    setSignOutOtherError(null);
    try {
      const res = await fetch('/api/profile/sign-out-other-devices', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not sign out other devices');
      }
      setSignOutOtherDone(true);
    } catch (err) {
      setSignOutOtherError(err instanceof Error ? err.message : 'Could not sign out other devices');
    } finally {
      setSignOutOtherBusy(false);
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
        How you sign in to findmyVybe -- add a passkey or trust this device so you&apos;re not stuck waiting on an SMS
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
            <div className="flex items-center gap-2">
              {account.phone && account.phoneVerified && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">Verified</span>
              )}
              {phoneStep === 'closed' && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneError(null);
                    setPhoneDraft('+91');
                    setPhoneCode('');
                    setPhoneStep(account.phone && account.phoneVerified ? 'confirmOld' : 'phone');
                  }}
                  className="rounded-full border border-line px-4 py-2 text-xs font-bold"
                >
                  {account.phone && account.phoneVerified ? 'Change' : 'Add phone'}
                </button>
              )}
            </div>
          </div>

          {phoneStep === 'confirmOld' && (
            <ConfirmOldStep
              requestPath="/api/profile/phone/confirm-old/request-otp"
              verifyPath="/api/profile/phone/confirm-old/verify-otp"
              onConfirmed={() => setPhoneStep('phone')}
              onCancel={() => setPhoneStep('closed')}
            />
          )}

          {phoneStep === 'phone' && (
            <form onSubmit={sendPhoneCode} className="mt-3 flex flex-col gap-2">
              {/* Reaching this step for a CHANGE (not a first-time add) already
                  means ConfirmOldStep passed, which requires a verified email --
                  see app/api/profile/phone/confirm-old/request-otp/route.ts's doc
                  comment -- so account.email is guaranteed here. */}
              {account.phone && account.phoneVerified && account.email && (
                <p className="text-sm text-inkSoft">
                  We&apos;ll email {maskEmail(account.email)} once this is done, in case it wasn&apos;t you.
                </p>
              )}
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
            <div className="flex items-center gap-2">
              {account.email && account.emailVerified && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">Verified</span>
              )}
              {emailStep === 'closed' && (
                <button
                  type="button"
                  onClick={() => setEmailStep(account.email && account.emailVerified ? 'confirmOld' : 'verify')}
                  className="rounded-full border border-line px-4 py-2 text-xs font-bold"
                >
                  {account.email && account.emailVerified ? 'Change' : 'Add email'}
                </button>
              )}
            </div>
          </div>

          {emailStep === 'confirmOld' && (
            <ConfirmOldStep
              requestPath="/api/profile/email/confirm-old/request-otp"
              verifyPath="/api/profile/email/confirm-old/verify-otp"
              onConfirmed={() => setEmailStep('verify')}
              onCancel={() => setEmailStep('closed')}
            />
          )}

          {emailStep === 'verify' && (
            <div className="mt-3 flex flex-col gap-2">
              {account.email && account.emailVerified && (
                <p className="text-sm text-inkSoft">
                  We&apos;ll email {maskEmail(account.email)} once this is done, in case it wasn&apos;t you.
                </p>
              )}
              <EmailVerifyField
                onVerified={() => {
                  setEmailStep('closed');
                  onChange();
                }}
              />
              <button
                type="button"
                onClick={() => setEmailStep('closed')}
                className="self-start text-sm font-semibold text-inkSoft"
              >
                Cancel
              </button>
            </div>
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

        {/* Device sessions -- see app/api/profile/sign-out-other-devices/route.ts.
            Signing in on a new device never logs out your other ones (that's
            normal -- phone and web side by side is expected), so this is the
            self-service way to end every OTHER session at once if you lose a
            device or sign in somewhere you don't trust. This device stays
            signed in. */}
        <div className="rounded-2xl border border-line p-3">
          <p className="text-sm font-bold">Device sessions</p>
          <p className="mt-1 text-sm text-inkSoft">
            Signed in on more than one device? That&apos;s normal. If you lost a device or signed in somewhere you don&apos;t
            trust, this signs out every device except this one.
          </p>
          {signOutOtherError && <p className="mt-2 text-sm text-magenta">{signOutOtherError}</p>}
          {signOutOtherDone ? (
            <p className="mt-2 text-sm font-semibold text-green-700">Done — every other device is signed out.</p>
          ) : (
            <button
              type="button"
              onClick={signOutOtherDevices}
              disabled={signOutOtherBusy}
              className="mt-2 rounded-full border border-line px-4 py-2 text-xs font-bold disabled:opacity-60"
            >
              {signOutOtherBusy ? 'Signing out other devices...' : 'Sign out of all other devices'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
