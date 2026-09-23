'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Appends a plain timeline note without changing status -- same step-up
// dance as components/NewIncidentForm.tsx, since it hits the same
// privacy.incidents.manage-gated route family.
export default function IncidentNoteForm({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
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

      const res = await fetch(`/api/privacy/incidents/${incidentId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stepUpRequired) {
          setNeedsStepUp(true);
          setError('Enter your password and current code to add this note.');
          return;
        }
        setError(data.error || 'Something went wrong.');
        return;
      }
      setNote('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface p-4">
      <p className="text-xs font-semibold text-inkSoft">Add a timeline note</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Notified the hosting provider; rotated the affected API key."
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {needsStepUp && (
        <div className="space-y-2 rounded-lg border border-border bg-canvas p-3">
          <p className="text-xs font-semibold text-inkSoft">Re-verify your identity to continue</p>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
      )}
      {error && <p className="text-sm text-critical">{error}</p>}
      <button
        type="button"
        disabled={loading || !note.trim()}
        onClick={submit}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {loading ? 'Adding…' : 'Add note'}
      </button>
    </div>
  );
}
