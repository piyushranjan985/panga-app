'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, internal }),
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
    <form onSubmit={submit} className="rounded-card border border-border bg-surface p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={internal ? 'Internal note (not visible to the user)…' : 'Reply to the user…'}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-inkSoft">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note only
        </label>
        <button type="submit" disabled={loading || !body.trim()} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">
          {loading ? 'Sending…' : internal ? 'Add note' : 'Send reply'}
        </button>
      </div>
    </form>
  );
}
