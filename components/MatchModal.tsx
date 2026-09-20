'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PairIntent, SignalItem } from '@/lib/matchSignals';
import { pickVybePrompt, getAskAboutTopics, type AskTopic } from '@/lib/vybeContent';

interface MatchModalProps {
  matchId: string;
  otherName: string;
  otherAvatarSeed: string;
  otherAvatarHue: number;
  onClose: () => void;
}

interface VibeData {
  pairIntent: PairIntent;
  rankedSignals: SignalItem[];
  matchExplanation: { emoji: string; text: string }[] | null;
  noStrongSignalText: string;
  quickHelloMessages: string[];
}

interface PartnerLite {
  interests: { label: string; emoji: string }[];
  tribes: { slug: string; label: string; emoji: string }[];
}

// The full-screen "IT'S A VYBE!" moment -- replaces dumping two people
// straight into a blank chat. Leads with "why you two might click" (never
// a percentage -- see lib/matchSignals.ts), then a deliberate action
// hierarchy: Start chatting is the one clear primary CTA; Vybe and Ask
// about me sit underneath it as an equal-weight pair of lighter ways in;
// Say hi is tertiary and only expands on tap. Make a plan is intentionally
// NOT here at all -- the spec keeps it out of the first-contact moment and
// only surfaces it once a conversation is underway (see the chat page).
export default function MatchModal({ matchId, otherName, otherAvatarSeed, otherAvatarHue, onClose }: MatchModalProps) {
  const router = useRouter();
  const [vibe, setVibe] = useState<VibeData | null>(null);
  const [partner, setPartner] = useState<PartnerLite | null>(null);
  const [sayHiOpen, setSayHiOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/vibe`)
      .then((r) => r.json())
      .then((d) =>
        setVibe({
          pairIntent: d.pairIntent,
          rankedSignals: d.rankedSignals ?? [],
          matchExplanation: d.matchExplanation ?? null,
          noStrongSignalText: d.noStrongSignalText ?? "You both liked each other. That's a pretty good start. 💚",
          quickHelloMessages: d.quickHelloMessages ?? [],
        })
      )
      .catch(() => setVibe(null));
    fetch(`/api/matches/${matchId}/partner`)
      .then((r) => r.json())
      .then((d) => setPartner({ interests: d.partner?.interests ?? [], tribes: d.partner?.tribes ?? [] }))
      .catch(() => setPartner(null));
  }, [matchId]);

  function goToChat() {
    router.push(`/matches/${matchId}`);
  }

  async function sendVybe() {
    if (sending || !vibe) return;
    setSending(true);
    const prompt = pickVybePrompt(vibe.pairIntent, vibe.rankedSignals);
    await fetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'PROMPT', meta: { question: prompt.question, emoji: prompt.emoji, options: prompt.options, attribution: prompt.attribution } }),
    });
    goToChat();
  }

  async function sendAsk(topic: AskTopic) {
    if (sending) return;
    setSending(true);
    await fetch(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: topic.question }),
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

  const askTopics =
    vibe && partner ? getAskAboutTopics(vibe.pairIntent, partner.interests, partner.tribes, vibe.rankedSignals).slice(0, 6) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-card bg-white p-6 text-center shadow-lg">
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

        {/* "Why you two might click" -- ranked natural-language signals,
            never a percentage; graceful fallback when there's too little
            shared data to say anything more specific. */}
        <div className="mt-5 rounded-2xl bg-paper px-4 py-3 text-left">
          {!vibe ? (
            <p className="text-xs text-inkSoft">Loading your Vybe…</p>
          ) : vibe.matchExplanation && vibe.matchExplanation.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {vibe.matchExplanation.map((line, i) => (
                <li key={i} className="text-sm font-medium text-ink">
                  <span aria-hidden>{line.emoji}</span> {line.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-medium text-ink">{vibe.noStrongSignalText}</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={goToChat}
            className="gradient-btn rounded-full px-6 py-3 text-sm font-bold text-white"
          >
            💬 Start chatting
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={sendVybe}
              disabled={sending || !vibe}
              className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              ⚡ Vybe
            </button>
            <button
              type="button"
              onClick={() => setAskOpen((v) => !v)}
              className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold"
            >
              🎯 Ask about me
            </button>
          </div>

          {askOpen && (
            <div className="flex flex-col gap-1.5">
              {askTopics.length === 0 ? (
                <p className="px-2 py-1 text-xs text-inkSoft">Loading…</p>
              ) : (
                askTopics.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => sendAsk(t)}
                    disabled={sending}
                    className="rounded-xl border border-line px-4 py-2 text-left text-sm disabled:opacity-60"
                  >
                    <span aria-hidden>{t.emoji}</span> {t.question}
                    {t.attribution && <span className="ml-1 text-xs text-inkSoft">· {t.attribution}</span>}
                  </button>
                ))
              )}
            </div>
          )}

          {!sayHiOpen ? (
            <button
              type="button"
              onClick={() => setSayHiOpen(true)}
              className="rounded-full px-6 py-2 text-xs font-semibold text-inkSoft underline"
            >
              👋 Or just say hi
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(vibe?.quickHelloMessages ?? []).map((msg) => (
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
