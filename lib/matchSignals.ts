/**
 * The tiered "why did we match" signal engine behind the post-match
 * experience (match screen, the in-chat Shared Vybe tab, and the input
 * to lib/vybeContent.ts's prompt/topic/plan generation). Framework- and
 * database-free like lib/matching.ts and lib/vibeMatch.ts: plain objects
 * in, plain objects out.
 *
 * Deliberately supersedes lib/vibeMatch.ts's percent-based reveal for the
 * post-match UI -- the product spec is explicit that nothing here should
 * read as a manufactured compatibility score ("87% compatible"). This
 * file only ever produces natural-language signals ranked by how strong
 * a shared/complementary data point actually is; lib/vibeMatch.ts is left
 * in place but no longer wired into the post-match screens.
 *
 * Tier scores below implement the spec's ranking formula:
 *   exactVybe*10 + subInterest*9 + tribe*8 + interest*6 +
 *   relationshipValue*6 + datePreference*5 + futurePreference*5 +
 *   intent*4 + complementary*3
 * -- used to both pick the top 2-4 signals for "why you might click" and
 * to pick which tier lib/vybeContent.ts should draw a Vybe prompt from.
 */

export type PairIntent = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';

export type SignalTier =
  | 'exactVybe'
  | 'subInterest'
  | 'tribe'
  | 'interest'
  | 'relationshipValue'
  | 'datePreference'
  | 'futurePreference'
  | 'intent'
  | 'complementary';

export const TIER_SCORE: Record<SignalTier, number> = {
  exactVybe: 10,
  subInterest: 9,
  tribe: 8,
  interest: 6,
  relationshipValue: 6,
  datePreference: 5,
  futurePreference: 5,
  intent: 4,
  complementary: 3,
};

export interface SignalItem {
  tier: SignalTier;
  score: number;
  emoji: string;
  // Short human label for chips ("Coffee", "Gaming → Fortnite", "Lots of
  // laughs"). Not shown as a bare label in most UI -- see `attribution`.
  label: string;
  // "You both picked X" style sentence, ready to render directly.
  attribution: string;
  // A stable key for excluding this exact signal once a Vybe prompt has
  // already been drawn from it (e.g. "tribe:gaming", "interest:Coffee",
  // "vybe:<promptId>").
  sourceKey: string;
  // Present only for tier: 'complementary' -- the two different answers,
  // for generating a "could you compromise?" style prompt.
  complementary?: { aLabel: string; aEmoji: string; bLabel: string; bEmoji: string };
}

export interface SignalVybeAnswer {
  promptId: string;
  promptText: string;
  promptEmoji: string;
  answer: string;
}

export interface SignalTribe {
  slug: string;
  label: string;
  emoji: string;
  sharedPhrase: string;
  subCommunities: string[]; // labels this profile picked under this tribe
}

export interface SignalProfile {
  intent: PairIntent;
  interests: { label: string; emoji: string }[];
  tribes: SignalTribe[];
  relationshipStyles: { label: string; emoji: string; pairPhrase: string }[];
  dateVibeTags: { slug: string; label: string; emoji: string }[];
  tonightTags: { slug: string; label: string; emoji: string }[];
  valuesTags: { slug: string; label: string; emoji: string }[];
  livingPreference: string | null;
  futureHome: string | null;
  futureFamily: string | null;
  futureCareer: string | null;
  futureMoney: string | null;
  children: string | null;
  vybeAnswers: SignalVybeAnswer[];
}

const INTENT_LABEL: Record<PairIntent, { emoji: string; phrase: string }> = {
  JUST_VIBING: { emoji: '🌀', phrase: 'You both like to keep things easy and see where it goes' },
  SOMETHING_REAL: { emoji: '❤️', phrase: 'You both want a relationship' },
  RISHTA_READY: { emoji: '💍', phrase: "You're both looking for marriage" },
};

// A database-free re-derivation of Rishta Ready's future-vibe questions
// (see lib/constants.ts FUTURE_VIBE_QUESTIONS) so this file stays
// dependency-free -- callers pass the same slugs already stored on
// Profile, this just knows how to phrase a match on one of them.
const FUTURE_FIELD_LABEL: Record<'futureHome' | 'futureFamily' | 'futureCareer' | 'futureMoney', Record<string, { emoji: string; label: string }>> = {
  futureHome: { city: { emoji: '🏙️', label: 'City life' }, suburban: { emoji: '🏡', label: 'Quiet / suburban life' } },
  futureFamily: { family_central: { emoji: '👨‍👩‍👧', label: 'Family is central' }, couple_first: { emoji: '🌤️', label: 'Couple comes first' } },
  futureCareer: { career_priority: { emoji: '🚀', label: 'Career is a major priority' }, balance: { emoji: '⚖️', label: 'Balance is more important' } },
  futureMoney: { save_build: { emoji: '💰', label: 'Save & build' }, enjoy_experience: { emoji: '✨', label: 'Enjoy & experience' } },
};

const CHILDREN_LABEL: Record<string, { emoji: string; label: string }> = {
  'want-children': { emoji: '👶', label: 'Want children' },
  'dont-want-children': { emoji: '🚫', label: "Don't want children" },
  'open-unsure': { emoji: '🤔', label: 'Open / unsure about children' },
};

const LIVING_PREFERENCE_LABEL: Record<string, { emoji: string; label: string }> = {
  urban: { emoji: '🏙️', label: 'Same city / urban life' },
  'open-to-moving': { emoji: '🌍', label: 'Open to moving' },
  'close-to-family': { emoji: '🏡', label: 'Staying close to family' },
  abroad: { emoji: '✈️', label: 'Open to another country' },
};

// RISHTA_READY (marriage) is the more intentional/serious end of the
// spectrum -- if two people somehow have different stated intents (rare,
// since discovery favors same-intent matches, but not impossible), the
// post-match tone defaults to the MORE serious of the two rather than
// the more casual one, so nobody who set Marriage intent gets flirty
// casual-intent copy.
const INTENT_SERIOUSNESS: Record<PairIntent, number> = { JUST_VIBING: 0, SOMETHING_REAL: 1, RISHTA_READY: 2 };
export function resolvePairIntent(a: PairIntent, b: PairIntent): PairIntent {
  return INTENT_SERIOUSNESS[a] >= INTENT_SERIOUSNESS[b] ? a : b;
}

export function computeSharedSignals(a: SignalProfile, b: SignalProfile): SignalItem[] {
  const items: SignalItem[] = [];

  // Tier 1 / Tier "complementary" -- exact Vybe Check answers, both
  // directions come from the same comparison: same prompt + same answer
  // is the strongest possible signal; same prompt + different answer is
  // the complementary/difference signal (Tier 5).
  const bAnswerByPrompt = new Map(b.vybeAnswers.map((v) => [v.promptId, v]));
  for (const av of a.vybeAnswers) {
    const bv = bAnswerByPrompt.get(av.promptId);
    if (!bv) continue;
    if (av.answer === bv.answer) {
      items.push({
        tier: 'exactVybe',
        score: TIER_SCORE.exactVybe,
        emoji: av.promptEmoji || '⚡',
        label: av.answer,
        attribution: `You both chose ${av.answer}`,
        sourceKey: `vybe:${av.promptId}`,
      });
    } else {
      items.push({
        tier: 'complementary',
        score: TIER_SCORE.complementary,
        emoji: av.promptEmoji || '💬',
        label: `${av.answer} vs ${bv.answer}`,
        attribution: `Different takes on: ${av.promptText}`,
        sourceKey: `complementary:${av.promptId}`,
        complementary: { aLabel: av.answer, aEmoji: av.promptEmoji, bLabel: bv.answer, bEmoji: bv.promptEmoji },
      });
    }
  }

  // Tier 2 -- shared Tribe, with a bonus check for a shared sub-community
  // under it (the strongest non-Vybe-Check signal: "Gaming -> Fortnite").
  const bTribeBySlug = new Map(b.tribes.map((t) => [t.slug, t]));
  for (const at of a.tribes) {
    const bt = bTribeBySlug.get(at.slug);
    if (!bt) continue;
    const sharedSub = at.subCommunities.find((s) => bt.subCommunities.includes(s));
    if (sharedSub) {
      items.push({
        tier: 'subInterest',
        score: TIER_SCORE.subInterest,
        emoji: at.emoji,
        label: `${at.label} → ${sharedSub}`,
        attribution: `You both picked ${at.label} → ${sharedSub}`,
        sourceKey: `subInterest:${at.slug}:${sharedSub}`,
      });
    } else {
      items.push({
        tier: 'tribe',
        score: TIER_SCORE.tribe,
        emoji: at.emoji,
        label: at.label,
        attribution: at.sharedPhrase || `You both picked ${at.label}`,
        sourceKey: `tribe:${at.slug}`,
      });
    }
  }

  // Tier 3 -- shared Interest.
  const bInterestLabels = new Set(b.interests.map((i) => i.label));
  for (const ai of a.interests) {
    if (!bInterestLabels.has(ai.label)) continue;
    items.push({
      tier: 'interest',
      score: TIER_SCORE.interest,
      emoji: ai.emoji,
      label: ai.label,
      attribution: `You both love ${ai.label}`,
      sourceKey: `interest:${ai.label}`,
    });
  }

  // Tier 4 -- shared RelationshipStyle (Something Real only, see schema).
  const bStyleLabels = new Set(b.relationshipStyles.map((r) => r.label));
  for (const ar of a.relationshipStyles) {
    if (!bStyleLabels.has(ar.label)) continue;
    items.push({
      tier: 'relationshipValue',
      score: TIER_SCORE.relationshipValue,
      emoji: ar.emoji,
      label: ar.label,
      attribution: ar.pairPhrase || `You both chose ${ar.label}`,
      sourceKey: `relationshipValue:${ar.label}`,
    });
  }

  // Tier 4.5 -- shared date/tonight preference (Just Vibing only).
  const bDateSlugs = new Set([...b.dateVibeTags, ...b.tonightTags].map((t) => t.slug));
  for (const tag of [...a.dateVibeTags, ...a.tonightTags]) {
    if (!bDateSlugs.has(tag.slug)) continue;
    items.push({
      tier: 'datePreference',
      score: TIER_SCORE.datePreference,
      emoji: tag.emoji,
      label: tag.label,
      attribution: `You both picked ${tag.label}`,
      sourceKey: `datePreference:${tag.slug}`,
    });
  }

  // Tier 5 -- shared future/life preference (Rishta Ready only): values
  // tags, living preference, and each of the 4 future-vibe binary picks.
  const bValuesSlugs = new Set(b.valuesTags.map((v) => v.slug));
  for (const v of a.valuesTags) {
    if (!bValuesSlugs.has(v.slug)) continue;
    items.push({
      tier: 'futurePreference',
      score: TIER_SCORE.futurePreference,
      emoji: v.emoji,
      label: v.label,
      attribution: `You both value ${v.label.toLowerCase()}`,
      sourceKey: `futurePreference:values:${v.slug}`,
    });
  }
  if (a.livingPreference && a.livingPreference === b.livingPreference) {
    const meta = LIVING_PREFERENCE_LABEL[a.livingPreference];
    if (meta) {
      items.push({
        tier: 'futurePreference',
        score: TIER_SCORE.futurePreference,
        emoji: meta.emoji,
        label: meta.label,
        attribution: `You both see yourselves ${meta.label.toLowerCase()}`,
        sourceKey: `futurePreference:living:${a.livingPreference}`,
      });
    }
  }
  (['futureHome', 'futureFamily', 'futureCareer', 'futureMoney'] as const).forEach((field) => {
    const av = a[field];
    const bv = b[field];
    if (!av || av !== bv) return;
    const meta = FUTURE_FIELD_LABEL[field][av];
    if (!meta) return;
    items.push({
      tier: 'futurePreference',
      score: TIER_SCORE.futurePreference,
      emoji: meta.emoji,
      label: meta.label,
      attribution: `You both picked ${meta.label}`,
      sourceKey: `futurePreference:${field}:${av}`,
    });
  });
  if (a.children && a.children === b.children) {
    const meta = CHILDREN_LABEL[a.children];
    if (meta) {
      items.push({
        tier: 'futurePreference',
        score: TIER_SCORE.futurePreference,
        emoji: meta.emoji,
        label: meta.label,
        attribution: `You're on the same page: ${meta.label.toLowerCase()}`,
        sourceKey: `futurePreference:children:${a.children}`,
      });
    }
  }

  // Tier 6 -- same intent (lowest-weight positive signal; always true for
  // most matches since discovery favors it, so it rarely needs to carry
  // the match screen on its own).
  if (a.intent === b.intent) {
    const meta = INTENT_LABEL[a.intent];
    items.push({
      tier: 'intent',
      score: TIER_SCORE.intent,
      emoji: meta.emoji,
      label: meta.phrase,
      attribution: meta.phrase,
      sourceKey: `intent:${a.intent}`,
    });
  }

  return items;
}

// Ranked, de-duplicated (by sourceKey) signals, highest score first --
// what the match screen and the Shared Vybe tab both draw their top N
// from. Complementary items are excluded here (they're "differences,"
// not "why you matched" reasons) -- pull those separately via
// pickComplementarySignal below.
export function rankPositiveSignals(items: SignalItem[]): SignalItem[] {
  const seen = new Set<string>();
  const positive = items.filter((i) => i.tier !== 'complementary');
  const deduped = positive.filter((i) => (seen.has(i.sourceKey) ? false : (seen.add(i.sourceKey), true)));
  return deduped.sort((x, y) => y.score - x.score);
}

export function pickComplementarySignals(items: SignalItem[]): SignalItem[] {
  return items.filter((i) => i.tier === 'complementary');
}

export const NO_STRONG_SIGNAL_TEXT = "You both liked each other. That's a pretty good start. 💚";
