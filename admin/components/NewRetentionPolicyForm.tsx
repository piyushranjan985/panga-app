'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewRetentionPolicyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dataCategory, setDataCategory] = useState('');
  const [retentionDays, setRetentionDays] = useState('365');
  const [legalBasis, setLegalBasis] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/privacy/retention', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataCategory, retentionDays: Number(retentionDays), legalBasis }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      setDataCategory('');
      setLegalBasis('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        Add retention policy
      </button>
    );
  }

  const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Add / update a retention policy</p>
      <p className="mt-1 text-xs text-inkFaint">Saving an existing category&apos;s name updates that policy instead of creating a duplicate.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Data category<input value={dataCategory} onChange={(e) => setDataCategory(e.target.value)} placeholder="OTP codes" className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft">Retention (days)<input type="number" min={1} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Legal basis<input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="Necessary for account authentication" className={`mt-1 ${input}`} /></label>
      </div>
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft">Cancel</button>
        <button type="button" disabled={loading || !dataCategory.trim() || !retentionDays} onClick={submit} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {loading ? 'Saving…' : 'Save policy'}
        </button>
      </div>
    </div>
  );
}
