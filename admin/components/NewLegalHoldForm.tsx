'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Placing a legal hold is step-up gated (privacy.legalHolds.manage is in
// lib/rbac.ts's STEP_UP_REQUIRED), same dance as components/NewIncidentForm.tsx.
export default function NewLegalHoldForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (needsStepUp) {
        const stepRes = await fetch('/api/auth/step-up', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password, code }),
        });
        if (!stepRes.ok) {
          const data = await stepRes.json().catch(() => ({}));
          setError(data.error || 'Re-verification failed.');
          return;
        }
      }

      const res = await fetch('/api/privacy/legal-holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stepUpRequired) {
          setNeedsStepUp(true);
          setError('Enter your password and current code to place this hold.');
          return;
        }
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      setUserId('');
      setReason('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        Place legal hold
      </button>
    );
  }

  const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Place a legal hold</p>
      <p className="mt-1 text-xs text-inkFaint">Blocks this user&apos;s account from being anonymized by a DPDP deletion request until released.</p>
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-semibold text-inkSoft">User ID<input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="From the user's profile URL" className={`mt-1 ${input}`} /></label>
        <label className="block text-xs font-semibold text-inkSoft">Reason (recorded in the audit log)<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`mt-1 ${input}`} /></label>
      </div>
      {needsStepUp && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-canvas p-3">
          <p className="text-xs font-semibold text-inkSoft">Re-verify your identity to continue</p>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          <input type="text" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft">Cancel</button>
        <button type="button" disabled={loading || !userId.trim() || !reason.trim()} onClick={submit} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {loading ? 'Placing…' : 'Place hold'}
        </button>
      </div>
    </div>
  );
}
