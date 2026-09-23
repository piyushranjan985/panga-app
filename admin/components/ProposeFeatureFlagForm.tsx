'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

export default function ProposeFeatureFlagForm({
  existingKey,
  existingLabel,
  existingEnabled,
  existingRolloutPercent,
}: {
  existingKey?: string;
  existingLabel?: string;
  existingEnabled?: boolean;
  existingRolloutPercent?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(existingKey ?? '');
  const [label, setLabel] = useState(existingLabel ?? '');
  const [enabled, setEnabled] = useState(existingEnabled ?? false);
  const [rolloutPercent, setRolloutPercent] = useState(String(existingRolloutPercent ?? 100));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/config/changes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          configKey: `featureFlag:${key}`,
          proposedValue: { label, enabled, rolloutPercent: Number(rolloutPercent) },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">
        {existingKey ? 'Propose change' : 'Propose new flag'}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-card border border-border bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft">
          Key{existingKey ? '' : ' (e.g. new_discovery_algo)'}
          <input value={key} onChange={(e) => setKey(e.target.value)} disabled={Boolean(existingKey)} className={`mt-1 ${input} disabled:opacity-60`} />
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-inkSoft">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Rollout %
          <input type="number" min={0} max={100} value={rolloutPercent} onChange={(e) => setRolloutPercent(e.target.value)} className={`mt-1 ${input}`} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft">Cancel</button>
        <button type="button" disabled={loading || !key.trim()} onClick={submit} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
          {loading ? 'Submitting…' : 'Submit for approval'}
        </button>
      </div>
    </div>
  );
}
