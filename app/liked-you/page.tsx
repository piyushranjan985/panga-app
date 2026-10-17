'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import InactivityLogout from '@/components/InactivityLogout';
import MatchModal from '@/components/MatchModal';

interface Liker {
  userId: string;
  displayName: string;
  city: string;
  avatarSeed: string;
  avatarHue: number;
  photoUrl: string | null;
  isSuperLike: boolean;
}

interface LikedYouResponse {
  locked: boolean;
  count: number;
  likers: Liker[];
}

interface MatchInfo {
  matchId: string;
  name: string;
  avatarSeed: string;
  avatarHue: number;
}

// Same hue palette as components/VibeCard.tsx -- kept as its own small
// copy rather than exported/shared, since this page only ever needs it
// for a small round avatar swatch, not VibeCard's full-bleed card
// background.
const HUE_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(150deg,#FF7A29 0%,#E8367B 55%,#6C4FD1 100%)',
  2: 'linear-gradient(150deg,#0FB88A 0%,#2A9DD6 55%,#6C4FD1 100%)',
  3: 'linear-gradient(150deg,#F2559A 0%,#FF7A29 55%,#FFC24B 100%)',
  4: 'linear-gradient(150deg,#6C4FD1 0%,#E8367B 55%,#FF7A29 100%)',
  5: 'linear-gradient(150deg,#2A9DD6 0%,#0FB88A 55%,#C9E265 100%)',
  6: 'linear-gradient(150deg,#FFC24B 0%,#FF7A29 55%,#E8367B 100%)',
};

export default function LikedYouPage() {
  const [data, setData] = useState<LikedYouResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);

  function load() {
    fetch('/api/discover/liked-you')
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data: d }) => {
        if (!ok) {
          setError(d.error ?? "Couldn't load this right now.");
          return;
        }
        setError(null);
        setData(d);
      })
      .catch(() => setError("Couldn't load this right now."));
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(liker: Liker, action: 'PASS' | 'VYBE') {
    setBusyUserId(liker.userId);
    try {
      const res = await fetch('/api/swipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: liker.userId, action }),
      });
      const d = await res.json();
      if (res.ok) {
        setData((prev) => (prev ? { ...prev, count: prev.count - 1, likers: prev.likers.filter((l) => l.userId !== liker.userId) } : prev));
        if (d.matched && d.matchId) {
          setMatch({ matchId: d.matchId, name: liker.displayName, avatarSeed: liker.avatarSeed, avatarHue: liker.avatarHue });
        }
      }
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <InactivityLogout />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold">Liked you</h1>
        <p className="mb-4 text-sm text-inkSoft">People who've already sent you a Vybe.</p>

        {match && (
          <MatchModal
            matchId={match.matchId}
            otherName={match.name}
            otherAvatarSeed={match.avatarSeed}
            otherAvatarHue={match.avatarHue}
            onClose={() => setMatch(null)}
          />
        )}

        {error && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">Can&apos;t load this right now</p>
            <p className="mt-1 text-sm text-inkSoft">{error}</p>
          </div>
        )}

        {!error && data === null && <p className="text-sm text-inkSoft">Loading…</p>}

        {!error && data?.locked && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">
              {data.count > 0
                ? `${data.count} ${data.count === 1 ? 'person has' : 'people have'} liked you 💘`
                : 'See who liked you'}
            </p>
            <p className="mt-1 text-sm text-inkSoft">
              Seeing exactly who it is is part of a paid plan -- upgrade to see their profiles and Vybe back right away.
            </p>
            <a href="/upgrade" className="gradient-btn mt-4 inline-block rounded-full px-5 py-2 text-sm font-bold text-white">
              See plans
            </a>
          </div>
        )}

        {!error && data && !data.locked && data.likers.length === 0 && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">No new likes yet</p>
            <p className="mt-1 text-sm text-inkSoft">Keep Discover-ing -- anyone who Vybes you will show up here first.</p>
          </div>
        )}

        {!error && data && !data.locked && data.likers.length > 0 && (
          <div className="flex flex-col gap-3">
            {data.likers.map((liker) => (
              <div key={liker.userId} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
                <div
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full"
                  style={{ background: HUE_GRADIENTS[liker.avatarHue] ?? HUE_GRADIENTS[1] }}
                >
                  {liker.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external/Blob URLs, no next/image domain config needed
                    <img src={liker.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center font-display text-xl font-extrabold text-white/90">
                      {liker.avatarSeed}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {liker.displayName} {liker.isSuperLike && <span title="Super Vybe">⭐</span>}
                  </p>
                  <p className="text-xs text-inkSoft">{liker.city}</p>
                </div>
                <button
                  type="button"
                  onClick={() => respond(liker, 'PASS')}
                  disabled={busyUserId === liker.userId}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white text-base shadow disabled:opacity-50"
                  aria-label="Pass"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={() => respond(liker, 'VYBE')}
                  disabled={busyUserId === liker.userId}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-mint bg-white text-base text-mint shadow disabled:opacity-50"
                  aria-label="Vybe back"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
