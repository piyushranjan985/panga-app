'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: { id: string; question: string; category: string }[];
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text:
    "Hi, I'm VybeHelp 💬 Ask me anything about VybeMatch -- Vybes, Discover, chat, safety, your profile, the app, anything.",
};

const SUGGESTIONS = [
  'What are the three Vybe types?',
  'How do I report or block someone?',
  'Why can\'t I see distance for a match?',
  'How do I log out?',
];

export default function VybeHelp() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: q };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.ok ? data.answer : "Something went wrong on my end -- try again, or visit the full Help Center.",
          sources: res.ok ? data.sources : undefined,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: 'assistant', text: "I couldn't reach VybeHelp just now -- check your connection and try again, or visit the full Help Center." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating launcher -- sits above the bottom tab bar on phone-width
          screens (including the native app, which is always phone-width),
          and above the desktop content otherwise. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close VybeHelp' : 'Open VybeHelp'}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-magenta text-2xl shadow-lg sm:bottom-6"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-36 top-16 z-30 flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:top-auto sm:bottom-24 sm:h-[32rem] sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-sm font-extrabold">VybeHelp 💬</p>
              <p className="text-xs text-inkSoft">Ask me anything about VybeMatch</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-inkSoft">
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-magenta text-white' : 'bg-paper text-ink'
                  }`}
                >
                  {m.text}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-black/10 pt-2 text-xs opacity-80">
                      {m.sources.slice(0, 3).map((s) => (
                        <Link key={s.id} href={`/help?entry=${s.id}`} className="block underline">
                          {s.question}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-paper px-3 py-2 text-sm text-inkSoft">VybeHelp is typing…</div>
              </div>
            )}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-inkSoft"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-line p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask VybeHelp..."
              className="flex-1 rounded-full border border-line px-4 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-full bg-magenta px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
          <div className="border-t border-line px-4 py-2 text-center">
            <Link href="/help" className="text-xs font-semibold text-magenta underline">
              Browse the full Help Center
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
