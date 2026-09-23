'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  label: string;
  confirmTitle: string;
  confirmDescription?: string;
  endpoint: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  extraBody?: Record<string, unknown>;
  requireReason?: boolean;
  requireStepUp?: boolean;
  tone?: 'default' | 'critical';
  onDone?: () => void;
}

// Every destructive/high-risk action in the portal (suspend, ban, delete
// account, resolve a case, complete a privacy request, ...) goes through
// this one component: it always demands a typed reason before the request
// fires (never a bare confirm()), and when the action is in
// lib/rbac.ts's STEP_UP_REQUIRED list, it transparently prompts for a
// fresh password + MFA code first via /api/auth/step-up. The server still
// re-checks step-up validity independently -- this is convenience, not
// the enforcement boundary.
export default function ConfirmActionButton({
  label,
  confirmTitle,
  confirmDescription,
  endpoint,
  method = 'POST',
  extraBody,
  requireReason = true,
  requireStepUp = false,
  tone = 'default',
  onDone,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpCode, setStepUpCode] = useState('');
  const [needsStepUp, setNeedsStepUp] = useState(requireStepUp);
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
          body: JSON.stringify({ password: stepUpPassword, code: stepUpCode }),
        });
        if (!stepRes.ok) {
          const data = await stepRes.json().catch(() => ({}));
          setError(data.error || 'Re-verification failed.');
          return;
        }
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: requireReason ? reason : undefined, ...extraBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stepUpRequired) {
          setNeedsStepUp(true);
          setError('Enter your password and current code to confirm this action.');
          return;
        }
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      setReason('');
      onDone?.();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
          tone === 'critical' ? 'border-critical/30 bg-criticalSoft text-critical' : 'border-border text-inkSoft hover:bg-canvas'
        }`}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-xl">
            <p className="font-bold">{confirmTitle}</p>
            {confirmDescription && <p className="mt-1 text-sm text-inkSoft">{confirmDescription}</p>}

            {requireReason && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-inkSoft">Reason (recorded in the audit log)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
            )}

            {needsStepUp && (
              <div className="mt-4 space-y-2 rounded-lg border border-border bg-canvas p-3">
                <p className="text-xs font-semibold text-inkSoft">Re-verify your identity to continue</p>
                <input
                  type="password"
                  placeholder="Password"
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={stepUpCode}
                  onChange={(e) => setStepUpCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
            )}

            {error && <p className="mt-3 text-sm text-critical">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || (requireReason && !reason.trim())}
                onClick={submit}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50 ${
                  tone === 'critical' ? 'bg-critical' : 'bg-brand'
                }`}
              >
                {loading ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
