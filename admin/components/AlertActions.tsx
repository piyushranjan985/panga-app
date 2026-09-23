'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveSignal } from '@/lib/liveSignals';

export function LogAlertButton({ signal }: { signal: LiveSignal }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: signal.category,
          severity: signal.severity,
          title: signal.title,
          detail: signal.detail,
          sourceType: signal.sourceType,
          sourceId: signal.sourceId,
        }),
      });
      if (res.ok) {
        setLogged(true);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (logged) return <span className="text-xs font-semibold text-success">Logged</span>;

  return (
    <button
      type="button"
      onClick={submit}
      disabled={loading}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-50"
    >
      {loading ? 'Logging…' : 'Log as alert'}
    </button>
  );
}

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications/alerts/${alertId}`, { method: 'PATCH' });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={submit}
      disabled={loading}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-50"
    >
      {loading ? 'Acknowledging…' : 'Acknowledge'}
    </button>
  );
}
