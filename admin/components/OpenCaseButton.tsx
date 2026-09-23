'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OpenCaseButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function openCase() {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/open-case`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.caseId) router.push(`/moderation/${data.caseId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={openCase} disabled={loading} className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-inkSoft hover:bg-canvas">
      {loading ? 'Opening…' : 'Open case'}
    </button>
  );
}
