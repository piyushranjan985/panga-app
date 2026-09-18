/**
 * The "Vibe Match" reveal shown on a match's chat page — a fun, narrative
 * compatibility summary ("🔥 87% Vibe Match ... you both love ... you might
 * get along over ... your relationship styles"), deliberately separate from
 * lib/matching.ts's discovery ranking score.
 *
 * Why separate: lib/matching.ts's score exists to RANK the discover feed —
 * its scale and weights are tuned for that job and covered by
 * scripts/verify-matching.ts. This file exists to be fun to read once two
 * people have already matched, not to rank anyone, so it's free to use a
 * friendlier 0-100% scale and lean on data (Tribe, SubCommunity,
 * RelationshipStyle) that discovery ranking doesn't touch. Framework- and
 * database-free like matching.ts, for the same reason: plain objects in,
 * plain object out, easy to unit test.
 */

export type IntentType = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';

const INTENT_COMPATIBILITY: Record<IntentType, Record<IntentType, number>> = {
  JUST_VIBING: { JUST_VIBING: 1, SOMETHING_REAL: 0.6, RISHTA_READY: 0 },
  SOMETHING_REAL: { JUST_VIBING: 0.6, SOMETHING_REAL: 1, RISHTA_READY: 0.5 },
  RISHTA_READY: { JUST_VIBING: 0, SOMETHING_REAL: 0.5, RISHTA_READY: 1 },
};

const INTENT_SHARED_LINE: Record<IntentType, string> = {
  JUST_VIBING: '🌀 Both just vibing',
  SOMETHING_REAL: '❤️ Both looking for something real',
  RISHTA_READY: '💍 Both Rishta Ready',
};

export interface VibeMatchInterest {
  id: string;
  label: string;
  emoji: string;
}

export interface VibeMatchTribe {
  id: string;
  emoji: string;
  activityPhrase: string;
  sharedPhrase: string;
}

export interface VibeMatchSubCommunity {
  id: string;
  tribeId: string;
}

export interface VibeMatchRelationshipStyle {
  id: string;
  pairPhrase: string;
}

export interface VibeMatchProfile {
  intent: IntentType;
  interests: VibeMatchInterest[];
  tribes: VibeMatchTribe[];
  subCommunities: VibeMatchSubCommunity[];
  relationshipStyles: VibeMatchRelationshipStyle[];
}

export interface VibeMatchResult {
  percent: number; // 10-99, deliberately never a flat 0 or 100 — this is a vibe, not a verdict
  sharedInterests: { emoji: string; label: string }[]; // "you both love"
  sharedTribes: { emoji: string; label: string }[]; // "you might get along over" (activityPhrase)
  sharedWorldsCount: number; // tribes + subCommunities in common, for "you found N shared worlds"
  sharedWorldLines: string[]; // tribe.sharedPhrase for each shared tribe
  relationshipLines: string[]; // intent line + shared relationship-style pairPhrases, max 3
}

export function computeVibeMatch(a: VibeMatchProfile, b: VibeMatchProfile): VibeMatchResult {
  const bInterestIds = new Set(b.interests.map((i) => i.id));
  const sharedInterests = a.interests.filter((i) => bInterestIds.has(i.id));

  const bTribeIds = new Set(b.tribes.map((t) => t.id));
  const sharedTribes = a.tribes.filter((t) => bTribeIds.has(t.id));

  const bSubIds = new Set(b.subCommunities.map((s) => s.id));
  const sharedSubCount = a.subCommunities.filter((s) => bSubIds.has(s.id)).length;

  const bStyleIds = new Set(b.relationshipStyles.map((r) => r.id));
  const sharedStyles = a.relationshipStyles.filter((r) => bStyleIds.has(r.id));

  const intentCompatibility = INTENT_COMPATIBILITY[a.intent][b.intent];

  // A loose, generous heuristic tuned for "fun number to see," not a
  // scientific score — see the file header. Base of 20 so a brand-new
  // match with only intent overlap still reads as "worth a shot," not 0%.
  const raw =
    20 +
    sharedInterests.length * 7 +
    sharedTribes.length * 9 +
    sharedSubCount * 6 +
    sharedStyles.length * 8 +
    intentCompatibility * 20;
  const percent = Math.max(10, Math.min(99, Math.round(raw)));

  const relationshipLines: string[] = [];
  if (intentCompatibility === 1) relationshipLines.push(INTENT_SHARED_LINE[a.intent]);
  for (const style of sharedStyles) {
    if (relationshipLines.length >= 3) break;
    relationshipLines.push(style.pairPhrase);
  }

  return {
    percent,
    sharedInterests: sharedInterests.map((i) => ({ emoji: i.emoji, label: i.label })),
    sharedTribes: sharedTribes.map((t) => ({ emoji: t.emoji, label: t.activityPhrase })),
    sharedWorldsCount: sharedTribes.length,
    sharedWorldLines: sharedTribes.map((t) => `${t.emoji} ${t.sharedPhrase}`),
    relationshipLines,
  };
}
