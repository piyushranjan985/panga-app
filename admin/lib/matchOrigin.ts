import type { MysteryCategory } from '@prisma/client';

/**
 * Admin-side duplicate of the consumer app's lib/matchOrigin.ts -- same
 * cross-app-boundary convention already used for admin/lib/push.ts
 * (can't import the root app's lib/* across the Next.js app boundary,
 * even though both share the same DATABASE_URL/Prisma schema). Keep the
 * emoji/label table identical to the consumer app's copy so an admin
 * sees the exact same "Vybe Flip" / "No-Labels Match" / "Wild Card"
 * wording a user would.
 *
 * One real difference from the consumer-app version: there, Wild Card
 * attribution is deliberately one-sided (only the person who drew the
 * card, see docs/WILD_CARD.md). An admin isn't "a side" of the match, so
 * admin/app/(console)/users/[userId]/page.tsx checks WildCardUse in
 * BOTH directions before calling this -- this function itself doesn't
 * care which direction foundViaWildCard came from.
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
  foundViaWildCard: boolean;
}

export function describeMatchOrigin({ isMysteryMatch, mysteryCategory, foundViaWildCard }: MatchOriginInput): MatchOrigin | null {
  if (isMysteryMatch && mysteryCategory && mysteryCategory in MYSTERY_ORIGINS) {
    return MYSTERY_ORIGINS[mysteryCategory as keyof typeof MYSTERY_ORIGINS];
  }
  if (foundViaWildCard) return WILD_CARD_ORIGIN;
  return null;
}
