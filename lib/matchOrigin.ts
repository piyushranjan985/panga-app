import type { MysteryCategory } from '@prisma/client';

/**
 * Shared "how did these two people actually match" labels -- Discover
 * swiping, Wild Card (docs/WILD_CARD.md), and the three Mystery Match
 * categories (docs/MYSTERY_MATCH.md: Mystery Match / Vybe Flip /
 * No-Labels Match). Pulled out into one small, pure, DB-free file so
 * MatchModal, the chat page's blind-reveal banner, the matches inbox
 * list, and (its own duplicated copy, see admin/lib/matchOrigin.ts --
 * same cross-app-boundary convention as admin/lib/push.ts) the admin
 * portal all show the exact same emoji/label for the same thing, instead
 * of each surface inventing its own copy for "Vybe Flip" independently.
 *
 * Deliberately returns null for an ordinary Discover match -- there's
 * nothing to highlight there, same as today's chat page (no banner at
 * all for a plain match).
 */

export type MatchOriginKey = 'WILD_CARD' | 'MYSTERY_MATCH' | 'VYBE_FLIP' | 'NO_LABELS';

export interface MatchOrigin {
  key: MatchOriginKey;
  emoji: string;
  label: string;
}

const MYSTERY_ORIGINS: Record<'MYSTERY_MATCH' | 'VYBE_FLIP' | 'NO_LABELS', MatchOrigin> = {
  MYSTERY_MATCH: { key: 'MYSTERY_MATCH', emoji: '🎭', label: 'Mystery Match' },
  VYBE_FLIP: { key: 'VYBE_FLIP', emoji: '🔄', label: 'Vybe Flip' },
  NO_LABELS: { key: 'NO_LABELS', emoji: '🧩', label: 'No-Labels Match' },
};

const WILD_CARD_ORIGIN: MatchOrigin = { key: 'WILD_CARD', emoji: '🃏', label: 'Wild Card' };

export interface MatchOriginInput {
  isMysteryMatch: boolean;
  mysteryCategory: MysteryCategory | null;
  // One-sided by design (see docs/WILD_CARD.md) -- only ever true for the
  // person who actually drew this match as their Wild Card, never the
  // other side. Callers compute this themselves (a WildCardUse existence
  // check, see app/api/matches/[matchId]/partner/route.ts for the
  // original pattern this reuses) since it isn't a Match/Swipe column.
  foundViaWildCard: boolean;
}

export function describeMatchOrigin({ isMysteryMatch, mysteryCategory, foundViaWildCard }: MatchOriginInput): MatchOrigin | null {
  // Mystery Match takes priority: a cron-created pairing is never also a
  // Wild Card draw (the two paths don't overlap in practice -- see
  // app/api/cron/mystery-match/route.ts vs. app/api/swipe/route.ts), but
  // checking it first keeps this function correct even if that ever
  // changed.
  if (isMysteryMatch && mysteryCategory && mysteryCategory in MYSTERY_ORIGINS) {
    return MYSTERY_ORIGINS[mysteryCategory as keyof typeof MYSTERY_ORIGINS];
  }
  if (foundViaWildCard) return WILD_CARD_ORIGIN;
  return null;
}
