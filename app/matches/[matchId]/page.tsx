'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Message {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface VibeMatch {
  percent: number;
  sharedInterests: { emoji: string; label: string }[];
  sharedTribes: { emoji: string; label: string }[];
  sharedWorldsCount: number;
  sharedWorldLines: string[];
  relationshipLines: string[];
}

export default function ChatPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [vibe, setVibe] = useState<VibeMatch | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const [meRes, msgRes] = await Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch(`/api/matches/${params.matchId}/messages`).then((r) => r.json()),
    ]);
    setMyUserId(meRes.userId ?? null);
    setMessages(msgRes.messages ?? []);
  }

  useEffect(() => {
    load();
    // Simple polling for the MVP — swap for a WebSocket/Pusher channel
    // before real launch (see the scaling section of the strategy doc).
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchId]);

  useEffect(() => {
    // Vibe Match doesn't change between two people's fixed picks, so this
    // is fetched once — no reason to put it on the 4s message poll.
    fetch(`/api/matches/${params.matchId}/vibe`)
      .then((r) => r.json())
      .then((d) => setVibe(d.vibe ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    await fetch(`/api/matches/${params.matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setDraft('');
    setSending(false);
    load();
  }

  async function noGhostClose() {
    await fetch(`/api/matches/${params.matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noGhostClose: true }),
    });
    router.push('/matches');
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <Link href="/matches" className="text-sm font-semibold text-inkSoft">
          ← Matches
        </Link>
        <button
          type="button"
          onClick={noGhostClose}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-inkSoft"
          title="Politely end this conversation instead of going quiet"
        >
          No-Ghost close
        </button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {vibe && (
          <div className="mb-2 rounded-2xl border border-line bg-gradient-to-br from-magenta/5 via-white to-marigold/5 p-4">
            <p className="text-center font-display text-2xl font-extrabold">🔥 {vibe.percent}% Vibe Match</p>
            {vibe.sharedWorldsCount > 0 && (
              <>
                <p className="mt-1 text-center text-sm font-semibold text-inkSoft">
                  You found {vibe.sharedWorldsCount} shared world{vibe.sharedWorldsCount > 1 ? 's' : ''} 🌎
                </p>
                <ul className="mt-2 text-center text-sm">
                  {vibe.sharedWorldLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {vibe.sharedInterests.length > 0 && (
              <div className="mt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  You both love
                </p>
                <p className="text-center text-sm">
                  {vibe.sharedInterests.map((i) => `${i.emoji} ${i.label}`).join(' · ')}
                </p>
              </div>
            )}
            {vibe.sharedTribes.length > 0 && (
              <div className="mt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  You might get along over
                </p>
                <p className="text-center text-sm">
                  {vibe.sharedTribes.map((t) => `${t.emoji} ${t.label}`).join(' · ')}
                </p>
              </div>
            )}
            {vibe.relationshipLines.length > 0 && (
              <div className="mt-3">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-inkSoft/60">
                  Your relationship styles
                </p>
                <ul className="mt-1 text-center text-sm">
                  {vibe.relationshipLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-inkSoft">You matched! Say something 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === myUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine ? 'gradient-btn text-white' : 'border border-line bg-white text-ink'
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-line bg-white p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
          className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="gradient-btn rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
