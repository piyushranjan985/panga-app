'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function MfaForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      router.push(params.get('next') || '/dashboard');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-sm">
        <p className="text-lg font-bold">Two-factor code</p>
        <p className="mt-1 text-sm text-inkSoft">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-critical">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={null}>
      <MfaForm />
    </Suspense>
  );
}
