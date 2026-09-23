'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

export default function ProposeNotificationTemplateForm({
  existingKey,
  existingChannel,
  existingSubject,
  existingBody,
}: {
  existingKey?: string;
  existingChannel?: string;
  existingSubject?: string | null;
  existingBody?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(existingKey ?? '');
  const [channel, setChannel] = useState(existingChannel ?? 'in_app');
  const [subject, setSubject] = useState(existingSubject ?? '');
  const [body, setBody] = useState(existingBody ?? '');
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
          configKey: `notificationTemplate:${key}`,
          proposedValue: { channel, subject: subject || undefined, body },
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
        {existingKey ? 'Propose edit' : 'Propose new template'}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-card border border-border bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft">
          Key{existingKey ? '' : ' (e.g. account.suspended)'}
          <input value={key} onChange={(e) => setKey(e.target.value)} disabled={Boolean(existingKey)} className={`mt-1 ${input} disabled:opacity-60`} />
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`mt-1 ${input}`}>
            {['email', 'sms', 'in_app'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">
          Subject (email only)
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">
          Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={`mt-1 ${input}`} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft">Cancel</button>
        <button type="button" disabled={loading || !key.trim() || !body.trim()} onClick={submit} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
          {loading ? 'Submitting…' : 'Submit for approval'}
        </button>
      </div>
    </div>
  );
}
