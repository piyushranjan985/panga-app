'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

type Field = { name: string; placeholder: string; required?: boolean };

export default function QuickAddContentForm({
  endpoint,
  label,
  fields,
}: {
  endpoint: string;
  label: string;
  fields: Field[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      setValues({});
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const requiredOk = fields.filter((f) => f.required).every((f) => (values[f.name] ?? '').trim());

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-card border border-border bg-canvas p-3">
      {fields.map((f) => (
        <input
          key={f.name}
          placeholder={f.placeholder}
          value={values[f.name] ?? ''}
          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          className={`${input} w-auto flex-1 min-w-[8rem]`}
        />
      ))}
      {error && <p className="w-full text-xs text-critical">{error}</p>}
      <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft">Cancel</button>
      <button type="button" disabled={loading || !requiredOk} onClick={submit} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
        {loading ? 'Adding…' : 'Add'}
      </button>
    </div>
  );
}
