'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function MfaSetupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/mfa-setup/start', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.qrCodeDataUrl) {
          setQrCodeDataUrl(data.qrCodeDataUrl);
          setSecret(data.secret);
        } else {
          setError(data.error || 'Could not start MFA setup.');
        }
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa-setup/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setRecoveryCodes(data.recoveryCodes);
    } finally {
      setLoading(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 shadow-sm">
          <p className="text-lg font-bold">Save your recovery codes</p>
          <p className="mt-1 text-sm text-inkSoft">
            Each code works once, if you lose access to your authenticator app. Store them somewhere safe -- they
            won&apos;t be shown again.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-canvas p-4 font-mono text-sm tabular-nums">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => router.push(params.get('next') || '/dashboard')}
            className="mt-6 w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white"
          >
            I&apos;ve saved these -- continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-sm">
        <p className="text-lg font-bold">Set up two-factor authentication</p>
        <p className="mt-1 text-sm text-inkSoft">
          Required for every admin account. Scan this with Google Authenticator, Authy, or 1Password.
        </p>
        <div className="mt-4 flex justify-center">
          {qrCodeDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrCodeDataUrl} alt="MFA QR code" className="h-44 w-44 rounded-lg border border-border" />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded-lg bg-canvas" />
          )}
        </div>
        {secret && (
          <p className="mt-2 text-center text-xs text-inkFaint">
            Can&apos;t scan? Enter this key manually: <span className="font-mono">{secret}</span>
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-critical">{error}</p>}
          <button
            type="submit"
            disabled={loading || !qrCodeDataUrl}
            className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? 'Confirming…' : 'Confirm & enable'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupForm />
    </Suspense>
  );
}
