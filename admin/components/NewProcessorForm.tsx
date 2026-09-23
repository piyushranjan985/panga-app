'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProcessorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dataCategories, setDataCategories] = useState('');
  const [country, setCountry] = useState('India');
  const [contractRef, setContractRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/privacy/processors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          purpose,
          dataCategories: dataCategories.split(',').map((c) => c.trim()).filter(Boolean),
          country,
          contractRef: contractRef || undefined,
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
      setDataCategories('');
      setContractRef('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        Add processor
      </button>
    );
  }

  const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Add a data processor</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft">Vendor name<input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft">Country<input value={country} onChange={(e) => setCountry(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Purpose<input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Data categories (comma-separated)<input value={dataCategories} onChange={(e) => setDataCategories(e.target.value)} placeholder="phone numbers, OTP codes" className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">Contract / DPA reference (optional)<input value={contractRef} onChange={(e) => setContractRef(e.target.value)} className={`mt-1 ${input}`} /></label>
      </div>
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft">Cancel</button>
        <button type="button" disabled={loading || !name.trim() || !purpose.trim()} onClick={submit} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {loading ? 'Adding…' : 'Add processor'}
        </button>
      </div>
    </div>
  );
}
