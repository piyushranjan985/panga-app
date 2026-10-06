import type { Gender, IntentType } from '@/lib/matching';

/**
 * Deterministic, regex/keyword-based natural-language search parser for
 * Discover's search box (see item 5 of the Sept 2026 feature request).
 *
 * Deliberately NOT an LLM call -- this project has kept $0 in paid third-
 * party AI APIs throughout (self-hosted nsfwjs/face-api for photo
 * moderation, free-tier email/SMS/push, see lib/matching.ts's and
 * lib/push.ts's comments for the same pattern elsewhere), and the user
 * explicitly chose to keep this feature free/rule-based rather than wire
 * up a paid API for "AI search." This file is pure and framework/DB-free
 * (like lib/matching.ts) so it's trivially unit-testable and has nothing
 * to do with scoring/eligibility -- app/api/discover/search/route.ts is
 * what wires its output into a real query.
 *
 * It only ever *narrows* -- a field this can't confidently extract from
 * the text is simply left unset, and the caller falls back to whatever
 * the structured filter panel (or nothing) supplied for that field. It
 * never has to be "right" about everything in one sentence; the search UI
 * offers both a free-text box and explicit filter controls side by side
 * for exactly this reason (see app/discover/page.tsx).
 */

export interface ParsedSearchQuery {
  gender?: Gender;
  ageMin?: number;
  ageMax?: number;
  distanceKm?: number;
  intent?: IntentType;
  interestIds: string[];
  tribeIds: string[];
}

export interface SearchTaxonomyLabel {
  id: string;
  label: string;
}

const GENDER_PATTERNS: { re: RegExp; gender: Gender }[] = [
  { re: /\b(girls?|women|woman|females?)\b/i, gender: 'WOMAN' },
  { re: /\b(boys?|men|man|males?)\b/i, gender: 'MAN' },
  { re: /\b(non-?binary|enby)\b/i, gender: 'NON_BINARY' },
];

const INTENT_PATTERNS: { re: RegExp; intent: IntentType }[] = [
  { re: /\b(just\s*vibing|casual(ly)?|hookup|hanging out)\b/i, intent: 'JUST_VIBING' },
  { re: /\b(something\s*real|serious(ly)?|relationship)\b/i, intent: 'SOMETHING_REAL' },
  { re: /\b(rishta|shaadi|marry|marriage|marriage-?minded)\b/i, intent: 'RISHTA_READY' },
];

// Order matters: "between X and Y" / "X to Y" must be tried before the
// looser under/over/plus patterns, and distance is extracted (and removed
// from the working text) before age, so "within 10 km" never gets misread
// as an age range.
const DISTANCE_PATTERNS = [/within\s+(\d{1,3})\s*k?m\b/i, /(\d{1,3})\s*km\b/i];

const AGE_RANGE_PATTERNS = [
  /between\s+(\d{1,2})\s+(?:and|to)\s+(\d{1,2})/i,
  /(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*(?:yrs?|years?|y\.?o\.?)?\b/i,
];
const AGE_UNDER_RE = /\bunder\s+(\d{1,2})\b/i;
const AGE_OVER_RE = /\b(?:over|above)\s+(\d{1,2})\b/i;
const AGE_PLUS_RE = /\b(\d{1,2})\s*\+/;

/** Longest-label-first substring match against a known taxonomy (interests or tribes), case-insensitive. */
function matchLabels(text: string, taxonomy: SearchTaxonomyLabel[]): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const sorted = [...taxonomy].sort((a, b) => b.label.length - a.label.length);
  for (const item of sorted) {
    if (item.label.length < 3) continue; // skip labels too short to match meaningfully (avoids noisy false positives)
    if (lower.includes(item.label.toLowerCase())) matched.push(item.id);
  }
  return matched;
}

export function parseSearchQuery(
  rawText: string,
  taxonomy: { interests: SearchTaxonomyLabel[]; tribes: SearchTaxonomyLabel[] },
): ParsedSearchQuery {
  const result: ParsedSearchQuery = { interestIds: [], tribeIds: [] };
  const text = (rawText ?? '').trim();
  if (!text) return result;

  // Distance first, and strip the matched text out of the working copy so
  // the age-range regexes below never see its digits.
  let remaining = text;
  for (const re of DISTANCE_PATTERNS) {
    const m = remaining.match(re);
    if (m) {
      result.distanceKm = parseInt(m[1]!, 10);
      remaining = remaining.slice(0, m.index) + remaining.slice((m.index ?? 0) + m[0].length);
      break;
    }
  }

  for (const re of AGE_RANGE_PATTERNS) {
    const m = remaining.match(re);
    if (m) {
      const a = parseInt(m[1]!, 10);
      const b = parseInt(m[2]!, 10);
      result.ageMin = Math.min(a, b);
      result.ageMax = Math.max(a, b);
      break;
    }
  }
  if (result.ageMin === undefined) {
    const under = remaining.match(AGE_UNDER_RE);
    const over = remaining.match(AGE_OVER_RE);
    const plus = remaining.match(AGE_PLUS_RE);
    if (under) result.ageMax = Math.max(18, parseInt(under[1]!, 10) - 1);
    if (over) result.ageMin = parseInt(over[1]!, 10) + 1;
    if (plus) result.ageMin = parseInt(plus[1]!, 10);
  }

  for (const { re, gender } of GENDER_PATTERNS) {
    if (re.test(text)) {
      result.gender = gender;
      break;
    }
  }

  for (const { re, intent } of INTENT_PATTERNS) {
    if (re.test(text)) {
      result.intent = intent;
      break;
    }
  }

  result.interestIds = matchLabels(text, taxonomy.interests);
  result.tribeIds = matchLabels(text, taxonomy.tribes);

  return result;
}
