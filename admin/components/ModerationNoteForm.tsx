'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ModerationNoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/moderation/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setBody('');
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a case note…"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <button type="submit" disabled={loading || !body.trim()} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-inkSoft disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
