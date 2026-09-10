'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import IntentBadge from '@/components/IntentBadge';

interface MatchRow {
  matchId: string;
  other: { displayName: string; avatarSeed: string; avatarHue: number; intent: string };
  lastMessage: { body: string; createdAt: string } | null;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);

  useEffect(() => {
    fetch('/api/matches')
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []));
  }, []);

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-6 font-display text-2xl font-extrabold">Your matches</h1>

        {matches === null && <p className="text-sm text-inkSoft">Loading...</p>}
        {matches?.length === 0 && (
          <p className="text-sm text-inkSoft">No matches yet — head to Discover and say Panga to someone.</p>
        )}

        <div className="flex flex-col gap-2">
          {matches?.map((m) => (
            <Link
              key={m.matchId}
              href={`/matches/${m.matchId}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3"
            >
              <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-gradient-to-br from-marigold to-magenta font-display text-lg font-bold text-white">
                {m.other.avatarSeed}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold">{m.other.displayName}</p>
                  <IntentBadge intent={m.other.intent} />
                </div>
                <p className="truncate text-sm text-inkSoft">
                  {m.lastMessage?.body ?? 'Say hi \u{1F44B}'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
