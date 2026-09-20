/**
 * DB -> lib/matchSignals.ts's SignalProfile adapter. Kept as its own
 * small file (rather than inlined in the vibe route) so any future route
 * that needs a SignalProfile (e.g. a future /signals-only endpoint) can
 * reuse it without re-deriving the tag-slug -> {label,emoji} lookups.
 */
import { DATE_VIBES, TONIGHT_OPTIONS, VALUES_OPTIONS } from './constants';
import type { PairIntent, SignalProfile, SignalTribe } from './matchSignals';

type TagCatalogEntry = { slug: string; label: string; emoji: string };

export type SignalProfileSource = {
  intent: string;
  interests: { label: string; emoji: string }[];
  tribes: { id: string; slug: string; label: string; emoji: string; sharedPhrase: string }[];
  subCommunities: { id: string; tribeId: string; label: string }[];
  relationshipStyles: { label: string; emoji: string; pairPhrase: string }[];
  answers: { promptId: string; answer: string; prompt: { text: string; emoji: string } }[];
  dateVibeTags: string[];
  tonightTags: string[];
  valuesTags: string[];
  livingPreference: string | null;
  futureHome: string | null;
  futureFamily: string | null;
  futureCareer: string | null;
  futureMoney: string | null;
  children: string | null;
};

function tagsFrom(slugs: string[], catalog: TagCatalogEntry[]): TagCatalogEntry[] {
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  return slugs.map((s) => bySlug.get(s)).filter((t): t is TagCatalogEntry => Boolean(t));
}

export function toSignalProfile(p: SignalProfileSource): SignalProfile {
  const tribes: SignalTribe[] = p.tribes.map((t) => ({
    slug: t.slug,
    label: t.label,
    emoji: t.emoji,
    sharedPhrase: t.sharedPhrase,
    subCommunities: p.subCommunities.filter((sc) => sc.tribeId === t.id).map((sc) => sc.label),
  }));

  return {
    intent: p.intent as PairIntent,
    interests: p.interests,
    tribes,
    relationshipStyles: p.relationshipStyles,
    dateVibeTags: tagsFrom(p.dateVibeTags, DATE_VIBES),
    tonightTags: tagsFrom(p.tonightTags, TONIGHT_OPTIONS),
    valuesTags: tagsFrom(p.valuesTags, VALUES_OPTIONS),
    livingPreference: p.livingPreference,
    futureHome: p.futureHome,
    futureFamily: p.futureFamily,
    futureCareer: p.futureCareer,
    futureMoney: p.futureMoney,
    children: p.children,
    vybeAnswers: p.answers.map((a) => ({
      promptId: a.promptId,
      promptText: a.prompt.text,
      promptEmoji: a.prompt.emoji,
      answer: a.answer,
    })),
  };
}
