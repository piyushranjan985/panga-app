'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import VibeCard, { type FeedProfile } from '@/components/VibeCard';

export default function DiscoverPage() {
  const [feed, setFeed] = useState<FeedProfile[] | null>(null);
  const [index, setIndex] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/discover')
      .then((r) => r.json())
      .then((d) => setFeed(d.feed ?? []));
  }, []);

  async function swipe(action: 'PASS' | 'PANGA') {
    const current = feed?.[index];
    if (!current) return;
    setIndex((i) => i + 1);

    const res = await fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: current.userId, action }),
    });
    const data = await res.json();
    if (data.matched) {
      setBanner(`It's a Panga! You and ${current.displayName} both said yes.`);
      setTimeout(() => setBanner(null), 4000);
    }
  }

  const current = feed?.[index];

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold">Discover</h1>
        <p className="mb-6 text-sm text-inkSoft">Ranked by shared circles, interests, city, and intent.</p>

        {banner && (
          <div className="mb-4 rounded-2xl bg-mint/15 px-4 py-3 text-sm font-semibold text-mint">{banner}</div>
        )}

        {feed === null && <p className="text-sm text-inkSoft">Loading your feed...</p>}

        {feed !== null && feed.length === 0 && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">No one here yet</p>
            <p className="mt-1 text-sm text-inkSoft">
              Join more circles or widen your city in your profile — or seed the database with demo
              users via <code className="mono">npm run db:seed</code>.
            </p>
          </div>
        )}

        {feed !== null && current && <VibeCard profile={current} onSwipe={swipe} />}

        {feed !== null && feed.length > 0 && !current && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">That&apos;s everyone for now</p>
            <p className="mt-1 text-sm text-inkSoft">Check back later, or try Quiet Mode from your profile.</p>
          </div>
        )}
      </main>
    </div>
  );
}
