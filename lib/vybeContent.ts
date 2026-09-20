/**
 * Intent-aware content catalogs for the post-match experience: Vybe
 * prompts, Ask-about-me topics, Quick hello openers, and Make-a-plan
 * flows. Pure data + pure functions (no DB, no framework) like
 * lib/conversationStarters.ts, which this file builds on top of for the
 * interest/tribe-keyed Vybe prompt catalogs (still intent-neutral --
 * "co-op or ranked solo" fits a casual, relationship, or marriage match
 * equally).
 *
 * "Casual" / "Relationship" / "Marriage" below correspond 1:1 to this
 * app's IntentType: JUST_VIBING / SOMETHING_REAL / RISHTA_READY.
 *
 * The tiered picker (pickVybePrompt) always prefers something drawn from
 * an actual shared signal (lib/matchSignals.ts) over the generic pool,
 * and always says why a prompt appeared ("You both picked Travel") --
 * see the "you both picked..." system in the product spec.
 */
import {
  INTEREST_STARTERS as BASE_INTEREST_STARTERS,
  TRIBE_STARTERS as BASE_TRIBE_STARTERS,
  askQuestionFor,
  type StarterOption,
  type Starter,
} from './conversationStarters';
import { NO_STRONG_SIGNAL_TEXT, type PairIntent, type SignalItem } from './matchSignals';

export type { StarterOption };

type StarterSeed = Omit<Starter, 'source'>;

// ---------------------------------------------------------------------
// Vybe -- generic intent-flavored pools (used only once no themed shared
// signal is available -- see pickVybePrompt's tier order below).
// ---------------------------------------------------------------------

const CASUAL_GENERIC_PROMPTS: StarterSeed[] = [
  { question: 'Chai ☕ or coffee?', emoji: '☕', options: [{ label: 'Chai', emoji: '☕' }, { label: 'Coffee', emoji: '☕' }] },
  { question: 'Street food 🌮 or fancy dinner?', emoji: '🌮', options: [{ label: 'Street food', emoji: '🌮' }, { label: 'Fancy dinner', emoji: '🍽️' }] },
  { question: 'Biryani 🍛 or pizza 🍕?', emoji: '🍛', options: [{ label: 'Biryani', emoji: '🍛' }, { label: 'Pizza', emoji: '🍕' }] },
  { question: 'Sweet 🍰 or spicy 🌶️?', emoji: '🍰', options: [{ label: 'Sweet', emoji: '🍰' }, { label: 'Spicy', emoji: '🌶️' }] },
  { question: 'Breakfast date or late-night food?', emoji: '🍳', options: [{ label: 'Breakfast date', emoji: '🍳' }, { label: 'Late-night food', emoji: '🌙' }] },
  { question: 'Try somewhere new or go to your favourite place?', emoji: '📍', options: [{ label: 'Somewhere new', emoji: '✨' }, { label: 'My favourite place', emoji: '❤️' }] },
  { question: 'Spontaneous plan or planned properly?', emoji: '🗓️', options: [{ label: 'Spontaneous', emoji: '🎲' }, { label: 'Planned properly', emoji: '📋' }] },
  { question: 'Road trip 🚗 or stay-in?', emoji: '🚗', options: [{ label: 'Road trip', emoji: '🚗' }, { label: 'Stay-in', emoji: '🛋️' }] },
  { question: 'Beach 🏖️ or city night?', emoji: '🏖️', options: [{ label: 'Beach', emoji: '🏖️' }, { label: 'City night', emoji: '🌃' }] },
  { question: 'Day plan or late-night plan?', emoji: '🌗', options: [{ label: 'Day plan', emoji: '☀️' }, { label: 'Late-night plan', emoji: '🌙' }] },
  { question: 'Explore somewhere new or chill at home?', emoji: '🧭', options: [{ label: 'Explore somewhere new', emoji: '🧭' }, { label: 'Chill at home', emoji: '🛋️' }] },
  { question: 'Friends everywhere or small circle?', emoji: '👯', options: [{ label: 'Friends everywhere', emoji: '👯' }, { label: 'Small circle', emoji: '🤏' }] },
  { question: 'Party 🎉 or house hang?', emoji: '🎉', options: [{ label: 'Party', emoji: '🎉' }, { label: 'House hang', emoji: '🏠' }] },
  { question: 'Talk all night or comfortable silence?', emoji: '🌌', options: [{ label: 'Talk all night', emoji: '💬' }, { label: 'Comfortable silence', emoji: '🤫' }] },
  { question: 'Go out or cancel plans and stay in?', emoji: '🚪', options: [{ label: 'Go out', emoji: '🚪' }, { label: 'Cancel & stay in', emoji: '🛋️' }] },
  { question: 'Slow burn or instant chemistry?', emoji: '🔥', options: [{ label: 'Slow burn', emoji: '🐢' }, { label: 'Instant chemistry', emoji: '⚡' }] },
  { question: 'Tease each other or be cute?', emoji: '😏', options: [{ label: 'Tease each other', emoji: '😏' }, { label: 'Be cute', emoji: '🥰' }] },
  { question: 'Memes all day or late-night conversations?', emoji: '📱', options: [{ label: 'Memes all day', emoji: '📱' }, { label: 'Late-night talks', emoji: '🌙' }] },
  { question: '"Let\'s see where it goes" or spontaneous adventure?', emoji: '🎲', options: [{ label: "Let's see where it goes", emoji: '🌊' }, { label: 'Spontaneous adventure', emoji: '🎢' }] },
  { question: 'Coffee or drinks?', emoji: '☕', options: [{ label: 'Coffee', emoji: '☕' }, { label: 'Drinks', emoji: '🍹' }] },
  { question: 'Food crawl or movie?', emoji: '🍜', options: [{ label: 'Food crawl', emoji: '🍜' }, { label: 'Movie', emoji: '🎬' }] },
  { question: 'Arcade 🎮 or bowling 🎳?', emoji: '🎮', options: [{ label: 'Arcade', emoji: '🎮' }, { label: 'Bowling', emoji: '🎳' }] },
  { question: 'Concert 🎤 or club?', emoji: '🎤', options: [{ label: 'Concert', emoji: '🎤' }, { label: 'Club', emoji: '🪩' }] },
  { question: 'Beach walk or city walk?', emoji: '🚶', options: [{ label: 'Beach walk', emoji: '🏖️' }, { label: 'City walk', emoji: '🏙️' }] },
  { question: 'Gaming night or Netflix night?', emoji: '🎮', options: [{ label: 'Gaming night', emoji: '🎮' }, { label: 'Netflix night', emoji: '🍿' }] },
];

const RELATIONSHIP_GENERIC_PROMPTS: StarterSeed[] = [
  { question: 'Text all day or call at night?', emoji: '📱', options: [{ label: 'Text all day', emoji: '💬' }, { label: 'Call at night', emoji: '📞' }] },
  { question: 'Talk it out immediately or take some time?', emoji: '🗣️', options: [{ label: 'Talk it out now', emoji: '🗣️' }, { label: 'Take some time', emoji: '🧘' }] },
  { question: 'Random "thinking of you" texts or planned calls?', emoji: '💌', options: [{ label: '"Thinking of you" texts', emoji: '💌' }, { label: 'Planned calls', emoji: '📅' }] },
  { question: 'Memes as love language or words?', emoji: '📱', options: [{ label: 'Memes', emoji: '📱' }, { label: 'Words', emoji: '💬' }] },
  { question: 'Voice notes or long texts?', emoji: '🎙️', options: [{ label: 'Voice notes', emoji: '🎙️' }, { label: 'Long texts', emoji: '📝' }] },
  { question: 'Deep conversations or playful banter?', emoji: '💭', options: [{ label: 'Deep conversations', emoji: '💭' }, { label: 'Playful banter', emoji: '😄' }] },
  { question: 'Someone who listens or someone who makes you laugh?', emoji: '👂', options: [{ label: 'Who listens', emoji: '👂' }, { label: 'Who makes me laugh', emoji: '😂' }] },
  { question: 'Words of affirmation or acts of service?', emoji: '💬', options: [{ label: 'Words of affirmation', emoji: '💬' }, { label: 'Acts of service', emoji: '🤲' }] },
  { question: 'Talk about everything or keep some mystery?', emoji: '🔮', options: [{ label: 'Talk about everything', emoji: '📖' }, { label: 'Keep some mystery', emoji: '🔮' }] },
  { question: 'Best friends first or instant romance?', emoji: '🤝', options: [{ label: 'Best friends first', emoji: '🤝' }, { label: 'Instant romance', emoji: '💘' }] },
  { question: 'Plan everything or be spontaneous?', emoji: '📋', options: [{ label: 'Plan everything', emoji: '📋' }, { label: 'Be spontaneous', emoji: '🎲' }] },
  { question: 'Couple time or independent time?', emoji: '🥰', options: [{ label: 'Couple time', emoji: '🥰' }, { label: 'Independent time', emoji: '🌤️' }] },
  { question: 'Quiet weekends or always doing something?', emoji: '🛋️', options: [{ label: 'Quiet weekends', emoji: '🛋️' }, { label: 'Always doing something', emoji: '🏃' }] },
  { question: 'Travel together or build a home base?', emoji: '✈️', options: [{ label: 'Travel together', emoji: '✈️' }, { label: 'Build a home base', emoji: '🏡' }] },
  { question: 'Big social circle or just us?', emoji: '👯', options: [{ label: 'Big social circle', emoji: '👯' }, { label: 'Just us', emoji: '💕' }] },
];

const MARRIAGE_GENERIC_PROMPTS: StarterSeed[] = [
  { question: 'Best friends first or partners in crime?', emoji: '🤝', options: [{ label: 'Best friends first', emoji: '🤝' }, { label: 'Partners in crime', emoji: '😏' }] },
  { question: "Build together or support each other's individual dreams?", emoji: '🏗️', options: [{ label: 'Build together', emoji: '🏗️' }, { label: 'Support individual dreams', emoji: '🌟' }] },
  { question: 'Equal partnership or traditional roles?', emoji: '⚖️', options: [{ label: 'Equal partnership', emoji: '⚖️' }, { label: 'Traditional roles', emoji: '🏡' }] },
  { question: 'Talk through everything or give each other space?', emoji: '💬', options: [{ label: 'Talk through everything', emoji: '💬' }, { label: 'Give each other space', emoji: '🌤️' }] },
  { question: 'Big city 🏙️ or quieter city 🌿?', emoji: '🏙️', options: [{ label: 'Big city', emoji: '🏙️' }, { label: 'Quieter city', emoji: '🌿' }] },
  { question: 'Apartment life or house life?', emoji: '🏢', options: [{ label: 'Apartment life', emoji: '🏢' }, { label: 'House life', emoji: '🏠' }] },
  { question: 'Minimal home or cosy home?', emoji: '🏡', options: [{ label: 'Minimal home', emoji: '◻️' }, { label: 'Cosy home', emoji: '🕯️' }] },
  { question: 'Always travelling or strong home base?', emoji: '✈️', options: [{ label: 'Always travelling', emoji: '✈️' }, { label: 'Strong home base', emoji: '🏡' }] },
  { question: 'Family close by or some distance?', emoji: '👨‍👩‍👧', options: [{ label: 'Family close by', emoji: '👨‍👩‍👧' }, { label: 'Some distance', emoji: '🗺️' }] },
  { question: 'Big family gatherings or small family time?', emoji: '🎉', options: [{ label: 'Big gatherings', emoji: '🎉' }, { label: 'Small family time', emoji: '🕯️' }] },
  { question: 'Festivals with everyone or quiet celebrations?', emoji: '🪔', options: [{ label: 'Festivals with everyone', emoji: '🪔' }, { label: 'Quiet celebrations', emoji: '🕯️' }] },
  { question: 'Both career-focused, or one leads depending on the situation?', emoji: '💼', options: [{ label: 'Both career-focused', emoji: '💼' }, { label: 'One leads, depends', emoji: '🔄' }] },
  { question: 'Build careers together or work-life balance over growth?', emoji: '⚖️', options: [{ label: 'Build careers together', emoji: '💼' }, { label: 'Work-life balance', emoji: '⚖️' }] },
  { question: 'Save for the future or enjoy today?', emoji: '💰', options: [{ label: 'Save for the future', emoji: '💰' }, { label: 'Enjoy today', emoji: '✨' }] },
  { question: 'Experiences or things?', emoji: '🎁', options: [{ label: 'Experiences', emoji: '🌍' }, { label: 'Things', emoji: '🎁' }] },
  { question: 'Travel often or invest in home?', emoji: '✈️', options: [{ label: 'Travel often', emoji: '✈️' }, { label: 'Invest in home', emoji: '🏡' }] },
  { question: 'Budget carefully or spontaneous spending?', emoji: '📊', options: [{ label: 'Budget carefully', emoji: '📊' }, { label: 'Spontaneous spending', emoji: '💸' }] },
];

const GENERIC_PROMPTS_BY_INTENT: Record<PairIntent, StarterSeed[]> = {
  JUST_VIBING: CASUAL_GENERIC_PROMPTS,
  SOMETHING_REAL: RELATIONSHIP_GENERIC_PROMPTS,
  RISHTA_READY: MARRIAGE_GENERIC_PROMPTS,
};

// RelationshipStyle-keyed prompts -- only reachable for Something Real
// matches, since RelationshipStyle only gets picked during that
// onboarding flow (see prisma/schema.prisma).
const RELATIONSHIP_STYLE_PROMPTS: Record<string, StarterSeed> = {
  'Lots of laughs': {
    question: 'Serious question: who should make the other laugh more? 😂',
    emoji: '😂',
    options: [{ label: 'Me, obviously', emoji: '😎' }, { label: "Let's find out", emoji: '😂' }],
  },
  'Deep conversations': {
    question: '2am conversations or Sunday morning conversations?',
    emoji: '🧠',
    options: [{ label: '2am conversations', emoji: '🌙' }, { label: 'Sunday morning', emoji: '☀️' }],
  },
  'Family-oriented': {
    question: 'Big family gatherings or peaceful weekends with just us?',
    emoji: '🏡',
    options: [{ label: 'Big family gatherings', emoji: '🎉' }, { label: 'Peaceful, just us', emoji: '🕊️' }],
  },
  'Career + relationship balance': {
    question: 'Power couple energy or keep work and love separate?',
    emoji: '⚖️',
    options: [{ label: 'Power couple energy', emoji: '💼' }, { label: 'Keep them separate', emoji: '🚪' }],
  },
};

export interface VybePrompt {
  question: string;
  emoji: string;
  options: [StarterOption, StarterOption];
  attribution: string;
  source: string;
}

function seedToPrompt(seed: StarterSeed, attribution: string, source: string): VybePrompt {
  return { ...seed, attribution, source };
}

/**
 * The signature "⚡ Vybe" mechanic's tiered picker. Always prefers the
 * strongest available *unused* shared signal over the generic pool, and
 * always returns an attribution line ("You both picked Travel") so the
 * question never feels random -- see the product spec's "you both
 * picked..." system. `excludeSources` is this match's already-used
 * prompt sources, so repeated taps don't immediately repeat a question.
 */
export function pickVybePrompt(pairIntent: PairIntent, signals: SignalItem[], excludeSources: string[] = []): VybePrompt {
  const notUsed = (source: string) => !excludeSources.includes(source);

  // Tier 1: exact Vybe Check match -- try to land it on a themed prompt
  // if the shared answer maps to one (e.g. "Chai" -> the Coffee prompt),
  // otherwise phrase a direct combination prompt from the answer itself.
  const exactVybe = signals.filter((s) => s.tier === 'exactVybe' && notUsed(s.sourceKey));
  for (const s of exactVybe) {
    const themed = BASE_INTEREST_STARTERS[matchThemeForAnswer(s.label)];
    if (themed) return seedToPrompt(themed, s.attribution, s.sourceKey);
  }
  if (exactVybe.length > 0) {
    const s = exactVybe[0]!;
    return {
      question: `${s.label}, but which version? 😏`,
      emoji: s.emoji || '⚡',
      options: [{ label: 'Chill version', emoji: '😌' }, { label: 'Full send', emoji: '🚀' }],
      attribution: s.attribution,
      source: s.sourceKey,
    };
  }

  // Tier 2: shared sub-interest / tribe.
  const subOrTribe = signals.filter((s) => (s.tier === 'subInterest' || s.tier === 'tribe') && notUsed(s.sourceKey));
  for (const s of subOrTribe) {
    const tribeSlug = s.sourceKey.split(':')[1];
    const seed = tribeSlug ? BASE_TRIBE_STARTERS[tribeSlug] : undefined;
    if (seed) return seedToPrompt(seed, s.attribution, s.sourceKey);
  }

  // Tier 3: shared interest.
  const interest = signals.filter((s) => s.tier === 'interest' && notUsed(s.sourceKey));
  for (const s of interest) {
    const seed = BASE_INTEREST_STARTERS[s.label];
    if (seed) return seedToPrompt(seed, s.attribution, s.sourceKey);
  }

  // Tier 4: shared relationship value (Something Real only).
  const relValue = signals.filter((s) => s.tier === 'relationshipValue' && notUsed(s.sourceKey));
  for (const s of relValue) {
    const seed = RELATIONSHIP_STYLE_PROMPTS[s.label];
    if (seed) return seedToPrompt(seed, s.attribution, s.sourceKey);
  }

  // Tier 5 (date preference) and Tier 6 (future/life preference) don't
  // have hand-authored themed prompts -- they're thematically covered by
  // the generic pools below (Weekend/Home/Family categories), so they
  // fall through intentionally.

  // Tier 7: complementary/difference -- generalizes to any pair of
  // different answers without needing a themed catalog entry.
  const complementary = signals.filter((s) => s.tier === 'complementary' && notUsed(s.sourceKey));
  if (complementary.length > 0) {
    const s = complementary[0]!;
    const c = s.complementary!;
    return {
      question: `${c.aLabel} or ${c.bLabel}? Okay, important question...`,
      emoji: '🤔',
      options: [{ label: c.aLabel, emoji: c.aEmoji || '1️⃣' }, { label: c.bLabel, emoji: c.bEmoji || '2️⃣' }],
      attribution: s.attribution,
      source: s.sourceKey,
    };
  }

  // Tier 8: generic intent-flavored pool.
  const pool = GENERIC_PROMPTS_BY_INTENT[pairIntent];
  const available = pool.map((seed, i) => ({ seed, source: `generic:${pairIntent}:${i}` })).filter((p) => notUsed(p.source));
  const chooseFrom = available.length > 0 ? available : pool.map((seed, i) => ({ seed, source: `generic:${pairIntent}:${i}` }));
  const picked = chooseFrom[Math.floor(Math.random() * chooseFrom.length)]!;
  return seedToPrompt(picked.seed, '⚡ A little something to break the ice', picked.source);
}

// Loose keyword mapping from a Vybe Check answer's free text to one of
// lib/conversationStarters.ts's themed interest prompts, so a Tier-1
// exact match can still land on a real themed question when the words
// overlap (e.g. an answer literally containing "coffee" or "chai").
function matchThemeForAnswer(answer: string): string {
  const lower = answer.toLowerCase();
  if (lower.includes('chai') || lower.includes('coffee')) return 'Coffee';
  if (lower.includes('food') || lower.includes('dinner') || lower.includes('biryani')) return 'Foodie';
  if (lower.includes('game') || lower.includes('gaming')) return 'Gaming';
  if (lower.includes('travel') || lower.includes('trip') || lower.includes('explore')) return 'Travel';
  if (lower.includes('music') || lower.includes('concert')) return 'Music';
  if (lower.includes('movie') || lower.includes('show') || lower.includes('netflix')) return 'Movies & shows';
  return '';
}

// ---------------------------------------------------------------------
// Ask about me -- casual stays interest/tribe-keyed (only topics that
// actually exist on the partner's profile, per the spec); relationship
// and marriage switch to a fixed set of life-topic categories instead,
// since those intents' questions are abstract ("What makes you feel
// appreciated?") rather than tied to a specific profile pick.
// ---------------------------------------------------------------------

export interface AskTopic {
  key: string;
  emoji: string;
  label: string;
  question: string;
  attribution?: string; // set only when this topic is a mutual interest
}

// Casual, non-mutual phrasing overrides for a handful of interests the
// spec calls out by name; anything else falls back to
// lib/conversationStarters.ts's existing (already casual-toned)
// INTEREST_ASK_QUESTIONS/TRIBE_ASK_QUESTIONS catalogs.
const CASUAL_ASK_OVERRIDES: Record<string, string> = {
  Gaming: "What's your current obsession?",
  Foodie: "What's the one food you'll never say no to?",
  Travel: "What's your most spontaneous trip?",
  Music: "What's your current repeat song?",
  'Movies & shows': 'What\'s a movie you can watch again and again?',
};

// Special phrasing when the topic is something BOTH people picked, not
// just something on the partner's profile -- see the spec's "Mutual
// interest" example under Ask about me.
const CASUAL_MUTUAL_ASK_OVERRIDES: Record<string, string> = {
  Gaming: "What's the one game you could play all night?",
  Foodie: "What's the best meal you've ever mutually agreed on?",
  Travel: "Where should our first trip together be?",
  Music: "Should we make a shared playlist?",
};

const CASUAL_UNIVERSAL_TOPICS: AskTopic[] = [
  { key: 'weekend', emoji: '🌞', label: 'Weekend', question: 'What does your perfect Saturday look like?' },
  { key: 'personality', emoji: '😄', label: 'Personality', question: "What's something you do that your friends always make fun of?" },
  { key: 'dating', emoji: '💘', label: 'Dating', question: "What's your idea of a genuinely fun date?" },
];

const RELATIONSHIP_ASK_TOPICS: AskTopic[] = [
  { key: 'personality', emoji: '😄', label: 'Personality', question: 'What makes you feel instantly comfortable with someone?' },
  { key: 'communication', emoji: '💬', label: 'Communication', question: "What's your favourite way to stay connected?" },
  { key: 'love', emoji: '❤️', label: 'Love', question: 'What makes you feel appreciated?' },
  { key: 'relationship', emoji: '💞', label: 'Relationship', question: "What's something small that means a lot to you?" },
  { key: 'lifestyle', emoji: '🌿', label: 'Lifestyle', question: 'What does a really good weekend with your person look like?' },
  { key: 'emotional', emoji: '🫂', label: 'Emotional', question: 'What helps you open up to someone?' },
  { key: 'values', emoji: '🧭', label: 'Values', question: "What's something you won't compromise on in a relationship?" },
  { key: 'future', emoji: '🔮', label: 'Future', question: 'What kind of life would make you genuinely happy?' },
];

const MARRIAGE_ASK_TOPICS: AskTopic[] = [
  { key: 'partnership', emoji: '🤝', label: 'Partnership', question: 'What does a good partnership look like to you?' },
  { key: 'home', emoji: '🏡', label: 'Home', question: 'What kind of home would you love to build?' },
  { key: 'family', emoji: '👨‍👩‍👧', label: 'Family', question: 'How important is family involvement in your life?' },
  { key: 'career', emoji: '💼', label: 'Career', question: 'What does supporting each other\'s career mean to you?' },
  { key: 'lifestyle', emoji: '🌿', label: 'Lifestyle', question: "What's something you definitely want your future life to include?" },
  { key: 'money', emoji: '💰', label: 'Money', question: 'Are you more of a planner or a live-in-the-moment person?' },
  { key: 'conflict', emoji: '🧘', label: 'Conflict', question: 'When something feels wrong, do you talk immediately or take some space first?' },
  { key: 'future', emoji: '🔭', label: 'Future', question: 'What would your ideal ordinary Sunday look like 5 years from now?' },
  { key: 'marriage', emoji: '💍', label: 'Marriage', question: 'What makes a marriage feel like a partnership to you?' },
];

/**
 * Ask-about-me's topic list for the "Ask [Name] about..." picker.
 * `partnerInterests`/`partnerTribes` gate what's shown for a casual
 * match -- only what's actually on their profile, per the spec.
 * `sharedSignals` upgrades a topic to its mutual phrasing when both
 * people picked it (casual), or surfaces a matched-relationship-style
 * special topic (relationship).
 */
export function getAskAboutTopics(
  pairIntent: PairIntent,
  partnerInterests: { label: string; emoji: string }[],
  partnerTribes: { slug: string; label: string; emoji: string }[],
  sharedSignals: SignalItem[]
): AskTopic[] {
  if (pairIntent === 'SOMETHING_REAL') {
    const bestFriendsFirst = sharedSignals.find((s) => s.tier === 'relationshipValue' && s.label === 'Best friends first');
    if (bestFriendsFirst) {
      return [
        {
          key: 'best-friends-first',
          emoji: '🤝',
          label: 'Best friends first',
          question: 'What makes someone become your person?',
          attribution: 'You both chose Best friends first',
        },
        ...RELATIONSHIP_ASK_TOPICS,
      ];
    }
    return RELATIONSHIP_ASK_TOPICS;
  }

  if (pairIntent === 'RISHTA_READY') {
    return MARRIAGE_ASK_TOPICS;
  }

  // Casual: interest/tribe-based, only what's on their profile.
  const sharedInterestLabels = new Set(sharedSignals.filter((s) => s.tier === 'interest').map((s) => s.label));
  const interestTopics: AskTopic[] = partnerInterests.map((i) => {
    const mutual = sharedInterestLabels.has(i.label);
    const question =
      (mutual && CASUAL_MUTUAL_ASK_OVERRIDES[i.label]) ||
      CASUAL_ASK_OVERRIDES[i.label] ||
      askQuestionFor('interest', i.label) ||
      `Tell me more about ${i.label.toLowerCase()}?`;
    return {
      key: `interest:${i.label}`,
      emoji: i.emoji,
      label: i.label,
      question,
      attribution: mutual ? `You both picked ${i.label}` : undefined,
    };
  });
  const tribeTopics: AskTopic[] = partnerTribes.map((t) => ({
    key: `tribe:${t.slug}`,
    emoji: t.emoji,
    label: t.label,
    question: askQuestionFor('tribe', t.slug) || `What got you into ${t.label.toLowerCase()}?`,
  }));

  return [...interestTopics, ...tribeTopics, ...CASUAL_UNIVERSAL_TOPICS];
}

// ---------------------------------------------------------------------
// Quick hello -- context-aware by intent (spec section 25).
// ---------------------------------------------------------------------

const QUICK_HELLO_BY_INTENT: Record<PairIntent, string[]> = {
  JUST_VIBING: [
    'Hey 👋',
    'Okay, we matched 😄',
    'Your profile caught my attention 👀',
    'Chai date? ☕',
    'So... what are we doing this weekend? 😏',
    'That gaming choice though 🎮',
    'You seem fun 😂',
  ],
  SOMETHING_REAL: [
    'Hey 👋 Glad we matched.',
    'Your profile actually made me curious.',
    'I think we have a few things in common 🙂',
    'Our Vybe looks promising 👀',
    'Okay, important question...',
    'Deep conversations or terrible jokes first? 😂',
  ],
  RISHTA_READY: [
    'Hi 👋 Nice to match with you.',
    'I liked what you shared about yourself.',
    'We seem to have some interesting things in common.',
    'Would love to get to know you.',
    'I think we should start with coffee ☕',
    'What caught your attention on my profile?',
  ],
};

export function getQuickHelloMessages(pairIntent: PairIntent): string[] {
  return QUICK_HELLO_BY_INTENT[pairIntent];
}

// ---------------------------------------------------------------------
// Make a plan -- three different flows by intent (spec sections 17-19).
// Casual stays single-step (surface a themed recommendation straight
// away when a shared interest supports one, per "not a huge Make a Plan
// button -- straight to options"); Relationship and Marriage are short
// multi-step wizards. "Pick a day" substitutes a few relative options
// for a real calendar picker, which this MVP doesn't have.
// ---------------------------------------------------------------------

export interface PlanOption extends StarterOption {}

export interface PlanStep {
  stepId: string;
  prompt: string;
  options: PlanOption[];
}

export interface PlanRecommendation {
  key: string;
  label: string;
  emoji: string;
  why: string;
  options: PlanOption[];
}

const CASUAL_THEMED_PLANS: Record<string, PlanRecommendation> = {
  Gaming: {
    key: 'gaming', label: 'Game night', emoji: '🎮', why: 'You both game 🎮',
    options: [{ label: 'Arcade', emoji: '🕹️' }, { label: 'Gaming café', emoji: '🎮' }, { label: 'Nintendo night', emoji: '🎮' }, { label: 'Co-op session', emoji: '🕹️' }],
  },
  Foodie: {
    key: 'food', label: 'Food adventure', emoji: '🍜', why: 'You both love food 🍜',
    options: [{ label: 'Street food crawl', emoji: '🌮' }, { label: 'Try a new restaurant', emoji: '🍽️' }, { label: 'Café hopping', emoji: '☕' }, { label: 'Biryani hunt', emoji: '🍛' }],
  },
  Music: {
    key: 'music', label: 'Music date', emoji: '🎵', why: 'You both love music 🎵',
    options: [{ label: 'Concert', emoji: '🎤' }, { label: 'Karaoke', emoji: '🎤' }, { label: 'Live gig', emoji: '🎸' }, { label: 'Coffee + playlist swap', emoji: '☕' }],
  },
  Travel: {
    key: 'travel', label: 'Mini adventure', emoji: '✈️', why: 'You both love travel ✈️',
    options: [{ label: 'Explore a new neighbourhood', emoji: '🧭' }, { label: 'Day trip', emoji: '🚗' }, { label: 'Sunset spot', emoji: '🌅' }, { label: 'Café + walk', emoji: '☕' }],
  },
};

export const CASUAL_PLAN_ACTIVITIES: PlanOption[] = [
  { label: 'Coffee', emoji: '☕' },
  { label: 'Food', emoji: '🍜' },
  { label: 'Movie', emoji: '🎬' },
  { label: 'Gaming', emoji: '🎮' },
  { label: 'Concert/event', emoji: '🎤' },
  { label: 'Walk & explore', emoji: '🚶' },
  { label: 'Drinks', emoji: '🍹' },
  { label: 'Day out', emoji: '🏖️' },
  { label: 'Short road trip', emoji: '🚗' },
];

/** Up to 3 themed plan recommendations drawn from this pair's actual
 * shared interests -- never recommends an activity neither of them
 * picked (see the spec's "Do NOT recommend Gaming if neither selected
 * gaming"). Casual only. */
export function getCasualPlanRecommendations(sharedSignals: SignalItem[]): PlanRecommendation[] {
  const sharedInterestLabels = new Set(sharedSignals.filter((s) => s.tier === 'interest').map((s) => s.label));
  const order = ['Gaming', 'Foodie', 'Music', 'Travel'];
  return order.filter((l) => sharedInterestLabels.has(l)).map((l) => CASUAL_THEMED_PLANS[l]!).slice(0, 3);
}

const RELATIONSHIP_PLAN_STEP1: PlanOption[] = [
  { label: 'Coffee & conversation', emoji: '☕' },
  { label: 'Food adventure', emoji: '🍜' },
  { label: 'Movie night', emoji: '🎬' },
  { label: 'Concert', emoji: '🎤' },
  { label: 'Long walk', emoji: '🚶' },
  { label: 'Explore somewhere', emoji: '🏞️' },
  { label: 'Play together', emoji: '🎮' },
  { label: 'Cook together', emoji: '🧑‍🍳' },
  { label: 'Creative date', emoji: '🎨' },
  { label: 'Sunset date', emoji: '🌅' },
];
const PLAN_ENERGY_OPTIONS: PlanOption[] = [
  { label: 'Chill', emoji: '😌' },
  { label: 'Cute', emoji: '🥰' },
  { label: 'Fun', emoji: '🎉' },
  { label: 'Adventure', emoji: '🧭' },
];
// A real calendar picker is out of scope for this MVP -- relative-day
// options cover "pick a day" without needing one.
const PLAN_DAY_OPTIONS: PlanOption[] = [
  { label: 'Today', emoji: '📍' },
  { label: 'Tomorrow', emoji: '➡️' },
  { label: 'This weekend', emoji: '🗓️' },
  { label: 'Next week', emoji: '📅' },
];
const PLAN_TIME_OPTIONS: PlanOption[] = [
  { label: 'Morning', emoji: '🌅' },
  { label: 'Afternoon', emoji: '☀️' },
  { label: 'Evening', emoji: '🌆' },
  { label: 'Night', emoji: '🌙' },
];

const MARRIAGE_PLAN_STEP1: PlanOption[] = [
  { label: 'Coffee & conversation', emoji: '☕' },
  { label: 'Lunch', emoji: '🍜' },
  { label: 'Walk + coffee', emoji: '🚶' },
  { label: 'Explore somewhere', emoji: '🏞️' },
  { label: 'Bookstore + café', emoji: '📚' },
  { label: 'Museum/art', emoji: '🎨' },
  { label: 'Dessert date', emoji: '🍰' },
  { label: 'Park walk', emoji: '🌳' },
];
const MARRIAGE_MEETING_VIBE: PlanOption[] = [
  { label: 'Keep it simple', emoji: '🕊️' },
  { label: "Let's actually talk", emoji: '💬' },
  { label: 'Do something together', emoji: '🤝' },
];
const MARRIAGE_CONVERSATION_VIBE: PlanOption[] = [
  { label: 'Life & relationships', emoji: '❤️' },
  { label: 'Travel', emoji: '✈️' },
  { label: 'Career', emoji: '💼' },
  { label: 'Family', emoji: '👨‍👩‍👧' },
  { label: 'Food & culture', emoji: '🍜' },
  { label: 'Music & interests', emoji: '🎵' },
  { label: 'Future lifestyle', emoji: '🏡' },
];

/** The multi-step wizard for Relationship/Marriage plans. Casual doesn't
 * use this -- see getCasualPlanRecommendations + CASUAL_PLAN_ACTIVITIES,
 * which stay single-step by design. */
export function getPlanFlow(pairIntent: PairIntent): PlanStep[] {
  if (pairIntent === 'RISHTA_READY') {
    return [
      { stepId: 'activity', prompt: 'Pick a first-meet option', options: MARRIAGE_PLAN_STEP1 },
      { stepId: 'meetingVibe', prompt: 'Meeting vibe', options: MARRIAGE_MEETING_VIBE },
      { stepId: 'conversationVibe', prompt: 'Conversation vibe', options: MARRIAGE_CONVERSATION_VIBE },
    ];
  }
  return [
    { stepId: 'activity', prompt: 'Pick your date vibe', options: RELATIONSHIP_PLAN_STEP1 },
    { stepId: 'energy', prompt: 'Pick the energy', options: PLAN_ENERGY_OPTIONS },
    { stepId: 'day', prompt: 'Pick a day', options: PLAN_DAY_OPTIONS },
    { stepId: 'time', prompt: 'Pick a time', options: PLAN_TIME_OPTIONS },
  ];
}

export const SAFETY_BEFORE_MEETING = {
  title: 'Meeting for the first time?',
  body: "Keep your first meet public and let someone you trust know where you'll be.",
  cta: 'Got it',
};

export const VIDEO_VYBE_COPY = {
  title: '📹 Quick video Vybe',
  subtitle: 'Not ready to meet yet? Try a 10-minute video chat first.',
  options: [{ label: '10 min', emoji: '🎥' }, { label: 'Maybe later', emoji: '🕐' }] as [PlanOption, PlanOption],
};

// ---------------------------------------------------------------------
// Match screen -- "Why you two might click" (spec section 1). Never a
// percentage; always natural-language, ranked, capped at the top 2-4
// signals, with NO_STRONG_SIGNAL_TEXT as the graceful fallback when a
// match has too little shared data (e.g. both skipped Vybe Check).
// ---------------------------------------------------------------------

export interface MatchExplanationLine {
  emoji: string;
  text: string;
}

export function getMatchExplanation(rankedPositiveSignals: SignalItem[]): MatchExplanationLine[] | null {
  if (rankedPositiveSignals.length === 0) return null;
  return rankedPositiveSignals.slice(0, 4).map((s) => ({ emoji: s.emoji, text: s.attribution }));
}

export { NO_STRONG_SIGNAL_TEXT };
