'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+91');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
      setHint(data.devHint ?? null);
      router.push(`/verify?phone=${encodeURIComponent(phone)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Enter your number</h1>
        <p className="mt-2 text-sm text-inkSoft">We&apos;ll text you a one-time code. No spam, ever.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
          className="rounded-2xl border border-line bg-white px-4 py-3 text-base"
          required
        />
        {error && <p className="text-sm text-magenta">{error}</p>}
        {hint && <p className="text-sm text-mint">{hint}</p>}
        <button
          type="submit"
          disabled={loading}
          className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? 'Sending...' : 'Send code'}
        </button>
      </form>
    </main>
  );
}
