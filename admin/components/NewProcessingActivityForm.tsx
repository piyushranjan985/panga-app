'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProcessingActivityForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dataCategories, setDataCategories] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [recipients, setRecipients] = useState('');
  const [crossBorderTransfer, setCrossBorderTransfer] = useState(false);
  const [dpiaRequired, setDpiaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/privacy/processing-activities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          purpose,
          legalBasis,
          dataCategories: dataCategories.split(',').map((c) => c.trim()).filter(Boolean),
          recipients: recipients.split(',').map((c) => c.trim()).filter(Boolean),
          crossBorderTransfer,
          dpiaRequired,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      setName('');
      setPurpose('');
      setLegalBasis('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        Add processing activity
      </button>
    );
  }

  const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Add a processing activity</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Discovery matching" className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Purpose<input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Legal basis<input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="Consent" className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft">Data categories (comma-separated)<input value={dataCategories} onChange={(e) => setDataCategories(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft">Recipients (comma-separated)<input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="Vercel, Neon" className={`mt-1 ${input}`} /></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-inkSoft"><input type="checkbox" checked={crossBorderTransfer} onChange={(e) => setCrossBorderTransfer(e.target.checked)} /> Involves cross-border transfer</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-inkSoft"><input type="checkbox" checked={dpiaRequired} onChange={(e) => setDpiaRequired(e.target.checked)} /> DPIA required</label>
      </div>
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft">Cancel</button>
        <button type="button" disabled={loading || !name.trim() || !purpose.trim() || !legalBasis.trim()} onClick={submit} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {loading ? 'Adding…' : 'Add activity'}
        </button>
      </div>
    </div>
  );
}
