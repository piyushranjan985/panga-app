'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INTERESTS, TRIBES } from '@/lib/constants';
import { pickStarter, buildSayHiMessages, type SharedProfileBits } from '@/lib/conversationStarters';

interface MatchModalProps {
  matchId: string;
  otherName: string;
  otherAvatarSeed: string;
  otherAvatarHue: number;
  onClose: () => void;
}

const INTEREST_EMOJI = new Map(INTERESTS.map((i) => [i.label, i.emoji]));
const TRIBE_INFO = new Map(TRIBES.map((t) => [t.slug, { label: t.label, emoji: t.emoji }]));

// The full-screen "IT'S A VYBE!" moment -- replaces dumping two people
// straight into a blank chat. Deliberately just 3 actions (not ten
// buttons): Start chatting is the clear primary CTA, with Send a Vybe /
// Say hi underneath as lighter-weight ways in. See
// lib/conversationStarters.ts for how the shared-things badges and the
// "Send a Vybe" prompt/"Say hi" openers are generated from what these two
// people actually have in common.
export default function MatchModal({ matchId, otherName, otherAvatarSeed, otherAvatarHue, onClose }: MatchModalProps) {
  const router = useRouter();
  const [shared, setShared] = useState<SharedProfileBits | null>(null);
  const [sayHiOpen, setSayHiOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/vibe`)
      .then((r) => r.json())
      .then((d) =>
        setShared({
          interestLabels: d.sharedInterestLabels ?? [],
          tribeSlugs: d.sharedTribeSlugs ?? [],
        })
      )
      .catch(() => setShared({ interestLabels: [], tribeSlugs: [] }));
  }, [matchId]);

  const sharedBadges = shared
    ? [
        ...shared.interestLabels.map((label) => ({ key: `i:${label}`, emoji: INTEREST_EMOJI.get(label) ?? '✨', label })),
        ...shared.tribeSlugs.map((slug) => ({
          key: `t:${slug}`,
          emoji: TRIBE_INFO.get(slug)?.emoji ?? '✨',
          label: TRIBE_INFO.get(slug)?.label ?? slug,
        })),
      ].slice(0, 3)
    : [];

  function goToChat() {
    router.push(`/matches/${matchId}`);
  }

  async function sendVybe() {
    if (sending) return;
    setSending(true);
    const starter = pickStarter(shared ?? { interestLabels: [], tribeSlugs: [] });
    await fetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'PROMPT', meta: { question: starter.question, emoji: starter.emoji, options: starter.options } }),
    });
    goToChat();
  }

  async function sendSayHi(text: string) {
    if (sending) return;
    setSending(true);
    await fetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });
    goToChat();
  }

  const sayHiMessages = buildSayHiMessages(shared ?? { interestLabels: [], tribeSlugs: [] });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-card bg-white p-6 text-center shadow-lg">
        <p className="font-display text-3xl font-extrabold">
          IT&apos;S A VYBE! <span aria-hidden>⚡</span>
        </p>
        <p className="mt-1 text-sm text-inkSoft">
          You and {otherName} both liked each other.
        </p>

        <div className="mt-5 flex items-center justify-center -space-x-3">
          <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-gradient-to-br from-marigold to-magenta font-display text-xl font-bold text-white shadow">
            You
          </div>
          <div
            className="grid h-16 w-16 place-items-center rounded-full border-4 border-white font-display text-xl font-bold text-white shadow"
            style={{ background: `linear-gradient(150deg, #FF7A29, #E8367B)` }}
          >
            {otherAvatarSeed}
          </div>
        </div>

        {sharedBadges.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
            {sharedBadges.map((b) => (
              <span key={b.key} className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-semibold">
                {b.emoji} Both: {b.label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={goToChat}
            className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white"
          >
            💬 Start chatting
          </button>
          <button
            type="button"
            onClick={sendVybe}
            disabled={sending}
            className="rounded-full border border-line px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            ⚡ Send a Vybe
          </button>

          {!sayHiOpen ? (
            <button
              type="button"
              onClick={() => setSayHiOpen(true)}
              className="rounded-full border border-line px-6 py-2.5 text-sm font-semibold"
            >
              👋 Say hi
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sayHiMessages.map((msg) => (
                <button
                  key={msg}
                  type="button"
                  onClick={() => sendSayHi(msg)}
                  disabled={sending}
                  className="rounded-xl border border-line px-4 py-2 text-left text-sm disabled:opacity-60"
                >
                  {msg}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={onClose} className="mt-5 text-xs font-semibold text-inkSoft">
          Keep swiping
        </button>
      </div>
    </div>
  );
}
