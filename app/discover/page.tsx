'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import InactivityLogout from '@/components/InactivityLogout';
import VibeCard, { type FeedProfile } from '@/components/VibeCard';
import MatchModal from '@/components/MatchModal';
import { getCurrentPosition } from '@/lib/native';

interface MatchInfo {
  matchId: string;
  name: string;
  avatarSeed: string;
  avatarHue: number;
}

interface DiscoverMeta {
  intent: 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';
  hasSharedLocation: boolean;
  // Wild Card (see docs/WILD_CARD.md) -- the daily count, refreshed by
  // whatever /api/discover/wildcard itself last returned (see
  // wildCardRemaining state below), so the button never has to guess.
  wildCard: { limit: number; used: number; remaining: number };
}

export default function DiscoverPage() {
  const [feed, setFeed] = useState<FeedProfile[] | null>(null);
  const [meta, setMeta] = useState<DiscoverMeta | null>(null);
  const [index, setIndex] = useState(0);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Wild Card -- see docs/WILD_CARD.md. wildCardRemaining starts as
  // whatever the main feed load reported and is kept current from each
  // wildcard fetch's own response, so it never drifts from what the
  // button is actually allowed to do next. wildCardError is a small
  // inline message (quota hit, or nobody eligible right now), cleared on
  // the next feed reload.
  const [wildCardRemaining, setWildCardRemaining] = useState<number | null>(null);
  const [wildCardBusy, setWildCardBusy] = useState(false);
  const [wildCardError, setWildCardError] = useState<string | null>(null);

  function loadFeed() {
    fetch('/api/discover')
      .then((r) => r.json())
      .then((d) => {
        setFeed(d.feed ?? []);
        setMeta(d.meta ?? null);
        setWildCardRemaining(d.meta?.wildCard?.remaining ?? null);
      });
  }

  // Pulled live, inside the normal swipe flow -- not a separate feed or
  // screen. Inserts the card right after whatever the viewer is currently
  // looking at, so it shows up next without losing their place in the
  // ordinary feed; see docs/WILD_CARD.md for why this is on-demand rather
  // than a scheduled batch like Mystery Match.
  async function drawWildCard() {
    setWildCardBusy(true);
    setWildCardError(null);
    try {
      const res = await fetch('/api/discover/wildcard');
      const data = await res.json();
      if (!res.ok) {
        setWildCardError(data.error ?? "Couldn't draw a Wild Card right now.");
        if (typeof data.remaining === 'number') setWildCardRemaining(data.remaining);
        return;
      }
      setFeed((prev) => {
        const base = prev ?? [];
        const next = [...base];
        next.splice(index, 0, data.card);
        return next;
      });
      setWildCardRemaining(data.remaining);
    } catch {
      setWildCardError("Couldn't draw a Wild Card right now.");
    } finally {
      setWildCardBusy(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  // Just Vibing is distance-based (see lib/matching.ts) -- without shared
  // GPS it still works (falls back to the city's centroid, see
  // lib/geo.ts), just less precisely, so this is a nudge, not a gate. Same
  // explicit-tap-triggers-the-OS-prompt pattern as the Profile screen's
  // Location section (see lib/native.ts) -- never requested automatically
  // on page load.
  async function shareLocationFromDiscover() {
    setLocationBusy(true);
    setLocationError(null);
    try {
      const { latitude, longitude } = await getCurrentPosition();
      await fetch('/api/profile/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude }),
      });
      setLocationPromptDismissed(true);
      loadFeed(); // re-rank now that precise coordinates are available
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get your location. Try again.');
    } finally {
      setLocationBusy(false);
    }
  }

  const showLocationPrompt =
    meta?.intent === 'JUST_VIBING' && !meta.hasSharedLocation && !locationPromptDismissed;

  async function swipe(action: 'PASS' | 'VYBE') {
    const current = feed?.[index];
    if (!current) return;
    setIndex((i) => i + 1);

    const res = await fetch('/api/swipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: current.userId, action }),
    });
    const data = await res.json();
    // The full "IT'S A VYBE!" screen (components/MatchModal.tsx) replaces
    // what used to be a small dismissible banner here -- see the match
    // modal for the 3-action post-match design (Start chatting / Send a
    // Vybe / Say hi).
    if (data.matched && data.matchId) {
      setMatch({ matchId: data.matchId, name: current.displayName, avatarSeed: current.avatarSeed, avatarHue: current.avatarHue });
    }
  }

  const current = feed?.[index];

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <InactivityLogout />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold">Discover</h1>
        <p className="mb-1 text-sm text-inkSoft">Ranked by shared interests, city, and intent.</p>

        {/* Wild Card -- see docs/WILD_CARD.md. Same intent, same city, but
            the opposite of what the ranked feed above favors: someone you
            have almost nothing in common with on paper. Capped at
            wildCard.limit/day, shown here regardless of remaining count so
            the button doubles as a reminder of the daily cap. */}
        {meta && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={drawWildCard}
              disabled={wildCardBusy || wildCardRemaining === 0}
              className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-sm disabled:opacity-50"
            >
              {wildCardBusy ? 'Drawing…' : `🃏 Wild Card${wildCardRemaining != null ? ` (${wildCardRemaining} left)` : ''}`}
            </button>
            {wildCardError && <span className="text-xs text-inkSoft">{wildCardError}</span>}
          </div>
        )}

        {match && (
          <MatchModal
            matchId={match.matchId}
            otherName={match.name}
            otherAvatarSeed={match.avatarSeed}
            otherAvatarHue={match.avatarHue}
            onClose={() => setMatch(null)}
          />
        )}

        {showLocationPrompt && (
          <div className="mb-4 rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">📍 Just Vibing shows people near you first</p>
                <p className="text-sm text-inkSoft">
                  Share your location for closer, better matches — without it, we use your city's general area.
                </p>
              </div>
              <button
                type="button"
                onClick={shareLocationFromDiscover}
                disabled={locationBusy}
                className="gradient-btn shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {locationBusy ? 'Getting location…' : 'Share location'}
              </button>
            </div>
            {locationError && <p className="mt-2 text-xs text-magenta">{locationError}</p>}
            <button
              type="button"
              onClick={() => setLocationPromptDismissed(true)}
              className="mt-2 text-[11px] font-semibold text-inkSoft/70 underline"
            >
              Not now
            </button>
          </div>
        )}

        {feed === null && <p className="text-sm text-inkSoft">Loading your feed...</p>}

        {/* "Try widening your city" used to point at a setting that
            doesn't exist (city isn't editable from the Profile screen),
            and the dev-only `npm run db:seed` hint was leaking into a
            real user's empty state. There's no self-service lever here
            today -- the pool is genuinely just thin -- so this says that
            plainly instead of suggesting a fix that doesn't exist. */}
        {feed !== null && feed.length === 0 && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">No one here yet</p>
            <p className="mt-1 text-sm text-inkSoft">
              There's no one new to show you in your city right now — check back soon as more people join findmyVybe.
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
