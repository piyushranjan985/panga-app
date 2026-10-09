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

interface TaxonomyOption {
  id: string;
  label: string;
  emoji: string;
}

// Mirrors app/api/discover/search/route.ts's `appliedFilters` response
// shape -- echoed back so the chips under the search box can show exactly
// what the (rule-based, see lib/searchQueryParser.ts) parser understood
// from free text, plus whatever the filter panel explicitly set.
interface AppliedFilters {
  gender: string | null;
  intent: string | null;
  ageMin: number | null;
  ageMax: number | null;
  distanceKm: number | null;
  interestIds: string[];
  tribeIds: string[];
}

const GENDER_FILTER_LABELS: Record<string, string> = {
  WOMAN: 'Women',
  MAN: 'Men',
  NON_BINARY: 'Non-binary',
  OTHER: 'Other',
};

const INTENT_FILTER_LABELS: Record<string, string> = {
  JUST_VIBING: 'Just Vibing',
  SOMETHING_REAL: 'Something Real',
  RISHTA_READY: 'Rishta Ready',
};

export default function DiscoverPage() {
  const [feed, setFeed] = useState<FeedProfile[] | null>(null);
  const [meta, setMeta] = useState<DiscoverMeta | null>(null);
  // Surfaced when /api/discover itself returns a non-200 (e.g.
  // checkAccountActive's 403 for an unverified/suspended account, or the
  // 409 for "finish onboarding first") -- previously loadFeed() silently
  // treated any such response as an empty feed, so a blocked user just
  // saw the generic "No one here yet" card with no way to tell that was
  // never really the reason. See lib/accountEnforcement.ts for the exact
  // set of reasons this can be.
  const [feedError, setFeedError] = useState<string | null>(null);
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

  // Search (item 5, Sept 2026) -- a structured filter panel AND a
  // free-text box, both feeding the same GET /api/discover/search (see
  // that route for how the two combine: explicit filters always win over
  // whatever the text box's rule-based parser guessed). searchActive just
  // means "the feed below is search results, not the ordinary ranked
  // feed" -- swiping behaves identically either way.
  const [taxonomy, setTaxonomy] = useState<{ interests: TaxonomyOption[]; tribes: TaxonomyOption[] }>({
    interests: [],
    tribes: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterIntent, setFilterIntent] = useState('');
  const [filterAgeMin, setFilterAgeMin] = useState('');
  const [filterAgeMax, setFilterAgeMax] = useState('');
  const [filterDistanceKm, setFilterDistanceKm] = useState('');
  const [filterInterestIds, setFilterInterestIds] = useState<string[]>([]);
  const [filterTribeIds, setFilterTribeIds] = useState<string[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters | null>(null);

  function loadFeed() {
    fetch('/api/discover')
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok) {
          setFeedError(data.error ?? "Couldn't load your feed right now.");
          setFeed([]);
          setMeta(null);
          return;
        }
        setFeedError(null);
        setFeed(data.feed ?? []);
        setMeta(data.meta ?? null);
        setWildCardRemaining(data.meta?.wildCard?.remaining ?? null);
      })
      .catch(() => setFeedError("Couldn't load your feed right now."));
  }

  function toggleFilterId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function runSearch() {
    setSearchBusy(true);
    setSearchError(null);
    try {
      const qs = new URLSearchParams();
      if (searchText.trim()) qs.set('q', searchText.trim());
      if (filterGender) qs.set('gender', filterGender);
      if (filterIntent) qs.set('intent', filterIntent);
      if (filterAgeMin) qs.set('ageMin', filterAgeMin);
      if (filterAgeMax) qs.set('ageMax', filterAgeMax);
      if (filterDistanceKm) qs.set('distanceKm', filterDistanceKm);
      if (filterInterestIds.length) qs.set('interestIds', filterInterestIds.join(','));
      if (filterTribeIds.length) qs.set('tribeIds', filterTribeIds.join(','));

      const res = await fetch(`/api/discover/search?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Couldn't search right now.");
        return;
      }
      setFeed(data.feed ?? []);
      setAppliedFilters(data.appliedFilters ?? null);
      setIndex(0);
      setSearchActive(true);
    } catch {
      setSearchError("Couldn't search right now.");
    } finally {
      setSearchBusy(false);
    }
  }

  function clearSearch() {
    setSearchActive(false);
    setAppliedFilters(null);
    setSearchError(null);
    setIndex(0);
    loadFeed();
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
    // Interests + tribes for the search filter panel's chip pickers --
    // same taxonomy onboarding already uses (see app/onboarding/page.tsx),
    // fetched once here since Discover doesn't otherwise need it.
    fetch('/api/onboarding-options')
      .then((r) => r.json())
      .then((d) => setTaxonomy({ interests: d.interests ?? [], tribes: d.tribes ?? [] }))
      .catch(() => {});
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
    meta?.intent === 'JUST_VIBING' && !meta.hasSharedLocation && !locationPromptDismissed && !searchActive;

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

  const appliedFilterChips: string[] = [];
  if (appliedFilters) {
    if (appliedFilters.gender) appliedFilterChips.push(GENDER_FILTER_LABELS[appliedFilters.gender] ?? appliedFilters.gender);
    if (appliedFilters.intent) appliedFilterChips.push(INTENT_FILTER_LABELS[appliedFilters.intent] ?? appliedFilters.intent);
    if (appliedFilters.ageMin != null || appliedFilters.ageMax != null) {
      appliedFilterChips.push(`${appliedFilters.ageMin ?? '18'}–${appliedFilters.ageMax ?? '99'} yrs`);
    }
    if (appliedFilters.distanceKm != null) appliedFilterChips.push(`within ${appliedFilters.distanceKm} km`);
    for (const id of appliedFilters.interestIds) {
      const interestMatch = taxonomy.interests.find((i) => i.id === id);
      if (interestMatch) appliedFilterChips.push(`${interestMatch.emoji} ${interestMatch.label}`);
    }
    for (const id of appliedFilters.tribeIds) {
      const tribeMatch = taxonomy.tribes.find((t) => t.id === id);
      if (tribeMatch) appliedFilterChips.push(`${tribeMatch.emoji} ${tribeMatch.label}`);
    }
  }

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <InactivityLogout />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold">Discover</h1>

        {/* Search (item 5, Sept 2026) -- a free-text box backed by a
            deterministic parser (see lib/searchQueryParser.ts; no LLM, no
            paid API, per the user's explicit "keep it free/rule-based"
            scoping) plus an explicit filter panel for when plain text
            isn't precise enough. Both feed the same endpoint and combine
            there -- see app/api/discover/search/route.ts. */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-3">
          <div className="flex gap-2">
            <input
              id="discover-search-text"
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Try 'women 24-29 within 10km who love travel'"
              className="flex-1 rounded-full border border-line px-4 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searchBusy}
              className="gradient-btn shrink-0 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {searchBusy ? 'Searching…' : '🔎 Search'}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="text-xs font-bold text-inkSoft underline"
            >
              {filtersOpen ? 'Hide filters' : 'Filters (age, distance, interests…)'}
            </button>
            {searchActive && (
              <button type="button" onClick={clearSearch} className="text-xs font-bold text-magenta underline">
                Clear search
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1 text-xs text-inkSoft">
                  Age
                  <input
                    id="discover-filter-age-min"
                    type="number"
                    min={18}
                    value={filterAgeMin}
                    onChange={(e) => setFilterAgeMin(e.target.value)}
                    placeholder="18"
                    className="w-16 rounded-full border border-line px-2 py-1 text-xs outline-none"
                  />
                  to
                  <input
                    id="discover-filter-age-max"
                    type="number"
                    min={18}
                    value={filterAgeMax}
                    onChange={(e) => setFilterAgeMax(e.target.value)}
                    placeholder="99"
                    className="w-16 rounded-full border border-line px-2 py-1 text-xs outline-none"
                  />
                </label>

                <label className="flex items-center gap-1 text-xs text-inkSoft">
                  Within
                  <input
                    id="discover-filter-distance"
                    type="number"
                    min={1}
                    value={filterDistanceKm}
                    onChange={(e) => setFilterDistanceKm(e.target.value)}
                    placeholder="km"
                    className="w-16 rounded-full border border-line px-2 py-1 text-xs outline-none"
                  />
                  km
                </label>

                <label className="flex items-center gap-1 text-xs text-inkSoft">
                  Gender
                  <select
                    id="discover-filter-gender"
                    value={filterGender}
                    onChange={(e) => setFilterGender(e.target.value)}
                    className="rounded-full border border-line px-2 py-1 text-xs outline-none"
                  >
                    <option value="">Any</option>
                    <option value="WOMAN">Women</option>
                    <option value="MAN">Men</option>
                    <option value="NON_BINARY">Non-binary</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>

                <label className="flex items-center gap-1 text-xs text-inkSoft">
                  Intent
                  <select
                    id="discover-filter-intent"
                    value={filterIntent}
                    onChange={(e) => setFilterIntent(e.target.value)}
                    className="rounded-full border border-line px-2 py-1 text-xs outline-none"
                  >
                    <option value="">Any</option>
                    <option value="JUST_VIBING">Just Vibing</option>
                    <option value="SOMETHING_REAL">Something Real</option>
                    <option value="RISHTA_READY">Rishta Ready</option>
                  </select>
                </label>
              </div>

              {taxonomy.interests.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-inkSoft">Interests</p>
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {taxonomy.interests.map((i) => {
                      const selected = filterInterestIds.includes(i.id);
                      return (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => setFilterInterestIds((prev) => toggleFilterId(prev, i.id))}
                          className={`rounded-full border px-2.5 py-1 text-xs ${
                            selected ? 'border-magenta bg-magenta/10 text-magenta' : 'border-line'
                          }`}
                        >
                          {i.emoji} {i.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {taxonomy.tribes.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-inkSoft">Tribes</p>
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {taxonomy.tribes.map((t) => {
                      const selected = filterTribeIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setFilterTribeIds((prev) => toggleFilterId(prev, t.id))}
                          className={`rounded-full border px-2.5 py-1 text-xs ${
                            selected ? 'border-mint bg-mint/10 text-mint' : 'border-line'
                          }`}
                        >
                          {t.emoji} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {searchError && <p className="mt-2 text-xs text-magenta">{searchError}</p>}

          {searchActive && appliedFilterChips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {appliedFilterChips.map((c) => (
                <span key={c} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-inkSoft">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Wild Card -- see docs/WILD_CARD.md. Same intent, same city, but
            the opposite of what the ranked feed below favors: someone you
            have almost nothing in common with on paper. Capped at
            wildCard.limit/day, shown here regardless of remaining count so
            the button doubles as a reminder of the daily cap. The caption
            is the one-line version of that -- docs/WILD_CARD.md has the
            full writeup. */}
        {meta && !searchActive && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
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
            <p className="mt-1 text-xs text-inkSoft">Your total opposite, same city &amp; intent.</p>
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
                  Share your location for closer, better matches — without it, we use your city&apos;s general area.
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

        <p className="mb-1 text-sm text-inkSoft">
          {searchActive ? `Showing ${feed?.length ?? 0} search result${feed?.length === 1 ? '' : 's'}.` : 'Ranked by shared interests, city, and intent.'}
        </p>

        {feed === null && !feedError && <p className="text-sm text-inkSoft">Loading your feed...</p>}

        {/* Distinct from the "no one here yet" empty state below --
            feedError means the request itself failed (blocked account,
            onboarding incomplete, network/auth error), so saying "no one
            here" would be actively misleading. See loadFeed(). */}
        {feedError && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">Can&apos;t load Discover right now</p>
            <p className="mt-1 text-sm text-inkSoft">{feedError}</p>
            <a href="/profile" className="mt-3 inline-block text-sm font-bold text-magenta underline">
              Go to your profile
            </a>
          </div>
        )}

        {/* "Try widening your city" used to point at a setting that
            doesn't exist (city isn't editable from the Profile screen),
            and the dev-only `npm run db:seed` hint was leaking into a
            real user's empty state. There's no self-service lever here
            today -- the pool is genuinely just thin -- so this says that
            plainly instead of suggesting a fix that doesn't exist. */}
        {!feedError && feed !== null && feed.length === 0 && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">{searchActive ? 'No one matches that search' : 'No one here yet'}</p>
            <p className="mt-1 text-sm text-inkSoft">
              {searchActive
                ? 'Try widening the age range or distance, or clear the search to see your usual feed.'
                : "There's no one new to show you in your city right now — check back soon as more people join findmyVybe."}
            </p>
          </div>
        )}

        {feed !== null && current && <VibeCard profile={current} onSwipe={swipe} />}

        {feed !== null && feed.length > 0 && !current && (
          <div className="rounded-card border border-line bg-white p-8 text-center">
            <p className="font-display text-lg font-bold">That&apos;s everyone for now</p>
            <p className="mt-1 text-sm text-inkSoft">
              {searchActive ? (
                <button type="button" onClick={clearSearch} className="font-bold text-magenta underline">
                  Clear search
                </button>
              ) : (
                'Check back later, or try Quiet Mode from your profile.'
              )}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
