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

export default function ChatPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
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
