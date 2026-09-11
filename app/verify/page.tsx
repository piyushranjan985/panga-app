'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const method = params.get('method') === 'email' ? 'email' : 'phone';
  const phone = params.get('phone') ?? '';
  const email = params.get('email') ?? '';
  const destination = method === 'email' ? email : phone;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = method === 'email' ? '/api/auth/verify-email-otp' : '/api/auth/verify-otp';
      const body = method === 'email' ? { email, code } : { phone, code };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      router.push(data.hasProfile ? '/discover' : '/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Enter the code</h1>
        <p className="mt-2 text-sm text-inkSoft">
          Sent to {destination || (method === 'email' ? 'your email' : 'your number')}. In dev mode, the code is
          always <span className="mono font-semibold">123456</span>.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          inputMode="numeric"
          maxLength={6}
          className="rounded-2xl border border-line bg-white px-4 py-3 text-center text-2xl tracking-[0.5em]"
          required
        />
        {error && <p className="text-sm text-magenta">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? 'Verifying...' : 'Verify & continue'}
        </button>
      </form>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
