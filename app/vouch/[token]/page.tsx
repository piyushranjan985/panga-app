'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import IntentBadge from '@/components/IntentBadge';

interface VouchData {
  displayName: string;
  age: number;
  city: string;
  verification: string;
  verificationIsMock: boolean;
  photoUrl: string | null;
  pairIntent: string;
  vibeSummary: {
    matchExplanation: { emoji: string; text: string }[] | null;
    noStrongSignalText: string;
  };
}

const REACTIONS: { value: string; emoji: string; label: string }[] = [
  { value: 'GOOD_VYBE', emoji: '💚', label: 'Good vybe' },
  { value: 'ASK_MORE', emoji: '🤔', label: 'Ask more questions first' },
  { value: 'NO_STRONG_OPINION', emoji: '😐', label: 'No strong opinion' },
  { value: 'FLAGGED', emoji: '🚩', label: 'Something feels off' },
];

// The vetter's view behind a Vybe Vouch link (see docs/VYBE_VOUCH.md §4).
// Unauthenticated, works for anyone with the link -- same "no login"
// shape as app/preview/[userId]/page.tsx, just with a reaction form
// instead of a static card. Missing/expired/revoked/already-answered all
// render the same "not available" state (the API already collapses them
// into one response so this page can't distinguish them even if it tried).
export default function VybeVouchPage() {
  const params = useParams<{ token: string }>();
  const [vouch, setVouch] = useState<VouchData | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/vouch/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          setUnavailable(true);
          return;
        }
        const d = await r.json();
        setVouch(d.vouch ?? null);
      })
      .catch(() => setUnavailable(true));
  }, [params.token]);

  async function submit() {
    if (!reaction || submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/vouch/${params.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction, note: note.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setUnavailable(true);
      return;
    }
    setSubmitted(true);
  }

  if (unavailable) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-xl font-bold">This link isn&apos;t available</p>
        <p className="text-sm text-inkSoft">
          It may be old, already answered, or expired -- Vybe Vouch links only last 7 days.
        </p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-xl font-bold">Thanks for weighing in 💚</p>
        <p className="text-sm text-inkSoft">Your read has been shared privately. You can close this page now.</p>
      </main>
    );
  }

  if (!vouch) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
        <p className="text-sm text-inkSoft">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-6 px-6 py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-inkSoft/60">Vybe Vouch</p>
        <p className="mt-1 text-xs text-inkSoft">
          Someone you know matched on findmyVybe and wants your honest read. No account needed, just this page.
        </p>
      </div>

      <div className="rounded-card border border-line bg-white p-6 text-center shadow-lg">
        {vouch.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external/Blob URLs
          <img
            src={vouch.photoUrl}
            alt=""
            className="mx-auto mb-4 h-28 w-28 rounded-full border border-line object-cover"
          />
        )}
        <h1 className="font-display text-2xl font-extrabold">
          {vouch.displayName}, {vouch.age}
        </h1>
        <p className="mt-1 text-sm text-inkSoft">{vouch.city}</p>
        {vouch.verification === 'VERIFIED' && (
          <p className="mt-2 text-xs font-semibold text-mint">
            {vouch.verificationIsMock ? '✅ Basic account check' : '✅ ID verified'}
          </p>
        )}
        <div className="mt-4">
          <IntentBadge intent={vouch.pairIntent} />
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkSoft/60">Why they matched</p>
          {vouch.vibeSummary.matchExplanation && vouch.vibeSummary.matchExplanation.length > 0 ? (
            vouch.vibeSummary.matchExplanation.map((line, i) => (
              <p key={i} className="text-sm">
                {line.emoji} {line.text}
              </p>
            ))
          ) : (
            <p className="text-sm text-inkSoft">{vouch.vibeSummary.noStrongSignalText}</p>
          )}
        </div>
      </div>

      <div className="rounded-card border border-line bg-white p-5">
        <p className="text-sm font-semibold">What&apos;s your read?</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {REACTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReaction(r.value)}
              className={`rounded-xl border px-4 py-2.5 text-left text-sm font-semibold ${
                reaction === r.value ? 'border-magenta bg-magenta/5' : 'border-line'
              }`}
            >
              {r.emoji} {r.label}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything else you'd want them to know? (optional)"
          maxLength={200}
          rows={3}
          className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!reaction || submitting}
          className="gradient-btn mt-3 w-full rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          Send my read
        </button>
        <p className="mt-2 text-center text-xs text-inkSoft">
          This is just one more opinion for them to weigh -- it never affects their match either way.
        </p>
      </div>

      <p className="text-center text-xs text-inkSoft">Shared via findmyVybe&apos;s Vybe Vouch.</p>
    </main>
  );
}
