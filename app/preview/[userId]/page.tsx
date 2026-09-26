'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import IntentBadge from '@/components/IntentBadge';

interface Preview {
  displayName: string;
  age: number;
  city: string;
  intent: string;
  verification: string;
  verificationIsMock: boolean;
  photoUrl: string | null;
}

// Public page behind a shared Family Preview link (see the Family Preview
// onboarding step and app/api/preview/[userId]/route.ts). No sign-in, no
// swipe deck, no bio or Vybe Check answers — just the handful of fields
// someone explicitly chose to make shareable outside findmyVybe.
export default function FamilyPreviewPage() {
  const params = useParams<{ userId: string }>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/preview/${params.userId}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        const d = await r.json();
        setPreview(d.preview ?? null);
      })
      .catch(() => setNotFound(true));
  }, [params.userId]);

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-xl font-bold">This preview isn&apos;t available</p>
        <p className="text-sm text-inkSoft">The link may be old, or this person has turned their family preview off.</p>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
        <p className="text-sm text-inkSoft">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-inkSoft/60">Family Preview</p>
        <p className="mt-1 text-xs text-inkSoft">A shared, read-only introduction — not the full findmyVybe profile.</p>
      </div>

      <div className="rounded-card border border-line bg-white p-6 text-center shadow-lg">
        {preview.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external/Blob URLs
          <img
            src={preview.photoUrl}
            alt=""
            className="mx-auto mb-4 h-28 w-28 rounded-full border border-line object-cover"
          />
        )}
        <h1 className="font-display text-2xl font-extrabold">
          {preview.displayName}, {preview.age}
        </h1>
        <p className="mt-1 text-sm text-inkSoft">{preview.city}</p>
        {preview.verification === 'VERIFIED' && (
          <p className="mt-2 text-xs font-semibold text-mint">
            {preview.verificationIsMock ? '✅ Basic account check' : '✅ ID verified'}
          </p>
        )}
        <div className="mt-4">
          <IntentBadge intent={preview.intent} />
        </div>
      </div>

      <p className="text-center text-xs text-inkSoft">Shared via findmyVybe&apos;s optional Family Preview.</p>
    </main>
  );
}
