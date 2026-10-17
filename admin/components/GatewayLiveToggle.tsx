'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GatewayLiveToggle({ gateway, isEnabledForLive }: { gateway: string; isEnabledForLive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await fetch('/api/payments/gateway-config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gateway, isEnabledForLive: !isEnabledForLive }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading || gateway === 'MOCK'}
      onClick={toggle}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-40"
      title={gateway === 'MOCK' ? 'Mock is always available and needs no planning toggle.' : 'Planning only -- does not enable live payments by itself.'}
    >
      {loading ? 'Working…' : isEnabledForLive ? 'Marked for live' : 'Mark for live'}
    </button>
  );
}
