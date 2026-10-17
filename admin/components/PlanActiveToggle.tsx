'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Toggles a single existing plan version's isActive flag -- the only
// in-place edit a plan ever gets; see admin/app/api/payments/plans/
// [planId]/route.ts.
export default function PlanActiveToggle({ planId, isActive }: { planId: string; isActive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await fetch(`/api/payments/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={toggle}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-50"
    >
      {loading ? 'Working…' : isActive ? 'Deactivate' : 'Reactivate'}
    </button>
  );
}
