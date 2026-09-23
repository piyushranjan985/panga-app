'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Opens a privacy/security incident -- gated by privacy.incidents.manage,
// which lib/rbac.ts's STEP_UP_REQUIRED demands a fresh password+MFA check
// for, so this form does the same step-up dance as
// components/ConfirmActionButton.tsx (that component's confirm-dialog
// shape doesn't fit a multi-field form, hence a bespoke one here).
export default function NewIncidentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [detectedAt, setDetectedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [affectedUserCount, setAffectedUserCount] = useState('');
  const [affectedDataCategories, setAffectedDataCategories] = useState('');
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

      const res = await fetch('/api/privacy/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          severity,
          detectedAt: new Date(detectedAt).toISOString(),
          affectedUserCount: affectedUserCount ? Number(affectedUserCount) : undefined,
          affectedDataCategories: affectedDataCategories
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stepUpRequired) {
          setNeedsStepUp(true);
          setError('Enter your password and current code to open this incident.');
          return;
        }
        setError(data.error || 'Something went wrong.');
        return;
      }
      router.push(`/privacy/incidents/${data.incident.id}`);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        Log incident
      </button>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Log a new privacy / security incident</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </Field>
        <Field label="Severity">
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Detected at">
          <input type="datetime-local" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </Field>
        <Field label="Affected user count (estimate)">
          <input type="number" min={0} value={affectedUserCount} onChange={(e) => setAffectedUserCount(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </Field>
        <Field label="Affected data categories (comma-separated)" full>
          <input
            value={affectedDataCategories}
            onChange={(e) => setAffectedDataCategories(e.target.value)}
            placeholder="phone numbers, precise location, chat messages"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Field>
        <Field label="Description" full>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </Field>
      </div>

      {needsStepUp && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-canvas p-3">
          <p className="text-xs font-semibold text-inkSoft">Re-verify your identity to continue</p>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input type="text" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-critical">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft">
          Cancel
        </button>
        <button
          type="button"
          disabled={loading || !title.trim() || !description.trim()}
          onClick={submit}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? 'Logging…' : 'Log incident'}
        </button>
      </div>

    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block text-xs font-semibold text-inkSoft ${full ? 'sm:col-span-2' : ''}`}>
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}
