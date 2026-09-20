/**
 * The post-match "less typing, more interaction" mechanics: tap-to-answer
 * Vybe prompts, "Ask about me" question generation, quick "Say hi"
 * openers, and the "Make a plan" pick-lists. Deliberately framework- and
 * database-free like lib/matching.ts and lib/vibeMatch.ts -- callers (the
 * match modal, the chat page, and their API routes) hand in plain shared-
 * interest/tribe labels and get plain data back, so this whole file is
 * unit-testable without a database and has zero Prisma dependency.
 *
 * The core idea, from the product brief: instead of a stateful "poll"
 * message that both people vote on, a Vybe prompt is just a message bubble
 * with a question and two buttons. Tapping a button sends a normal new
 * text message with that button's label as the body -- no per-message
 * "who answered what" tracking needed, see app/matches/[matchId]/page.tsx.
 */

export interface StarterOption {
  label: string;
  emoji: string;
}

export interface Starter {
  question: string;
  emoji: string;
  options: [StarterOption, StarterOption];
  // Which shared interest/tribe this came from (e.g. "interest:Coffee",
  // "tribe:gaming", or "generic:2") -- lets callers avoid immediately
  // repeating the same starter when someone taps "⚡ Vybe" again.
  source: string;
}

export interface SharedProfileBits {
  interestLabels: string[];
  tribeSlugs: string[];
}

type StarterSeed = Omit<Starter, 'source'>;

// One binary tap-prompt per interest -- keyed by the exact label in
// lib/constants.ts's INTERESTS. Not every interest needs to be here (a
// missing one just never gets picked as a starter source), but all of
// them are, for variety.
const INTEREST_STARTERS: Record<string, StarterSeed> = {
  Coffee: { question: 'Chai tapri or fancy café?', emoji: '☕', options: [{ label: 'Chai tapri', emoji: '☕' }, { label: 'Fancy café', emoji: '✨' }] },
  Foodie: { question: 'Street food or fine dining?', emoji: '🍜', options: [{ label: 'Street food', emoji: '🌮' }, { label: 'Fine dining', emoji: '🍽️' }] },
  Concerts: { question: 'Front row or chill in the back?', emoji: '🎤', options: [{ label: 'Front row', emoji: '🙌' }, { label: 'Chill in the back', emoji: '😌' }] },
  Gaming: { question: 'Controller or keyboard & mouse?', emoji: '🎮', options: [{ label: 'Controller', emoji: '🎮' }, { label: 'Keyboard & mouse', emoji: '⌨️' }] },
  Music: { question: 'Live concert or curated playlist night?', emoji: '🎵', options: [{ label: 'Live concert', emoji: '🎤' }, { label: 'Playlist night', emoji: '🎧' }] },
  'Movies & shows': { question: 'Movie theatre or couch marathon?', emoji: '🎬', options: [{ label: 'Theatre', emoji: '🎬' }, { label: 'Couch marathon', emoji: '🛋️' }] },
  Gym: { question: 'Morning workout or evening workout?', emoji: '🏋️', options: [{ label: 'Morning', emoji: '🌅' }, { label: 'Evening', emoji: '🌙' }] },
  Nature: { question: 'Mountains or beaches?', emoji: '🌿', options: [{ label: 'Mountains', emoji: '🏔️' }, { label: 'Beaches', emoji: '🏖️' }] },
  Travel: { question: 'Planned itinerary or wing it?', emoji: '✈️', options: [{ label: 'Planned itinerary', emoji: '📋' }, { label: 'Wing it', emoji: '🎒' }] },
  'Weekend trips': { question: 'Road trip or flight somewhere?', emoji: '🧳', options: [{ label: 'Road trip', emoji: '🚗' }, { label: 'Flight somewhere', emoji: '✈️' }] },
  'Cozy nights': { question: 'Movie night or board games?', emoji: '🌙', options: [{ label: 'Movie night', emoji: '🎬' }, { label: 'Board games', emoji: '🎲' }] },
  Photography: { question: 'Film camera or phone camera?', emoji: '📸', options: [{ label: 'Film camera', emoji: '📷' }, { label: 'Phone camera', emoji: '📱' }] },
  Fashion: { question: 'Thrifted or new?', emoji: '🛍️', options: [{ label: 'Thrifted', emoji: '👖' }, { label: 'New', emoji: '🛍️' }] },
  Creativity: { question: 'Painting or writing?', emoji: '🎨', options: [{ label: 'Painting', emoji: '🎨' }, { label: 'Writing', emoji: '✍️' }] },
  Cooking: { question: 'Follow a recipe or wing it?', emoji: '🧑‍🍳', options: [{ label: 'Follow a recipe', emoji: '📖' }, { label: 'Wing it', emoji: '🔥' }] },
  Running: { question: 'Early morning run or evening run?', emoji: '🏃', options: [{ label: 'Morning', emoji: '🌅' }, { label: 'Evening', emoji: '🌆' }] },
  Dogs: { question: 'Big dog or small dog person?', emoji: '🐶', options: [{ label: 'Big dog', emoji: '🐕' }, { label: 'Small dog', emoji: '🐶' }] },
  Comedy: { question: 'Stand-up special or funny reels?', emoji: '😂', options: [{ label: 'Stand-up special', emoji: '🎤' }, { label: 'Funny reels', emoji: '📱' }] },
  Nightlife: { question: 'Club or house party?', emoji: '🎉', options: [{ label: 'Club', emoji: '🪩' }, { label: 'House party', emoji: '🏠' }] },
  'Beach days': { question: 'Sunbathing or beach volleyball?', emoji: '🏖️', options: [{ label: 'Sunbathing', emoji: '☀️' }, { label: 'Volleyball', emoji: '🏐' }] },
  Books: { question: 'Physical book or e-book?', emoji: '📚', options: [{ label: 'Physical book', emoji: '📖' }, { label: 'E-book', emoji: '📱' }] },
  'Geeky stuff': { question: 'Sci-fi or fantasy?', emoji: '🧩', options: [{ label: 'Sci-fi', emoji: '🚀' }, { label: 'Fantasy', emoji: '🐉' }] },
  Wellness: { question: 'Morning routine or evening wind-down?', emoji: '🧘', options: [{ label: 'Morning routine', emoji: '🌅' }, { label: 'Evening wind-down', emoji: '🌙' }] },
  'Home & interiors': { question: 'Minimalist or maximalist?', emoji: '🏡', options: [{ label: 'Minimalist', emoji: '◻️' }, { label: 'Maximalist', emoji: '🌈' }] },
  'Gardening / plants': { question: 'Indoor plants or a whole garden?', emoji: '🌱', options: [{ label: 'Indoor plants', emoji: '🪴' }, { label: 'A whole garden', emoji: '🌻' }] },
};

// One binary tap-prompt per tribe -- keyed by the tribe's `slug` (stable
// across relabels, unlike `label`), covering all of lib/constants.ts's
// TRIBES. Kept on a different axis from the same-named interest above
// where both exist (e.g. tribe "coffee" vs interest "Coffee") so picking
// up both as shared doesn't just repeat the same question twice.
const TRIBE_STARTERS: Record<string, StarterSeed> = {
  gaming: { question: 'Couch co-op or ranked solo?', emoji: '🎮', options: [{ label: 'Couch co-op', emoji: '🕹️' }, { label: 'Ranked solo', emoji: '🏆' }] },
  anime: { question: 'Sub or dub?', emoji: '🎌', options: [{ label: 'Sub', emoji: '📝' }, { label: 'Dub', emoji: '🎙️' }] },
  music: { question: 'New release or an old favorite?', emoji: '🎧', options: [{ label: 'New release', emoji: '🆕' }, { label: 'Old favorite', emoji: '💿' }] },
  booktok: { question: 'Finish the series or DNF and move on?', emoji: '📚', options: [{ label: 'Finish it', emoji: '📚' }, { label: 'DNF, move on', emoji: '🚪' }] },
  'run-club': { question: 'Solo run or run club?', emoji: '🏃', options: [{ label: 'Solo', emoji: '🎧' }, { label: 'Run club', emoji: '👥' }] },
  coffee: { question: 'Filter coffee or cold brew?', emoji: '☕', options: [{ label: 'Filter coffee', emoji: '☕' }, { label: 'Cold brew', emoji: '🧊' }] },
  concerts: { question: 'Festival or an intimate gig?', emoji: '🎤', options: [{ label: 'Festival', emoji: '🎪' }, { label: 'Intimate gig', emoji: '🎸' }] },
  climbing: { question: 'Bouldering or roped climbing?', emoji: '🧗', options: [{ label: 'Bouldering', emoji: '🧗' }, { label: 'Roped climbing', emoji: '🪢' }] },
  photography: { question: 'Golden hour or blue hour?', emoji: '📸', options: [{ label: 'Golden hour', emoji: '🌅' }, { label: 'Blue hour', emoji: '🌆' }] },
  foodies: { question: 'Cook at home or eat out?', emoji: '🍜', options: [{ label: 'Cook at home', emoji: '🍳' }, { label: 'Eat out', emoji: '🍽️' }] },
  tech: { question: 'Side project or ship something at work?', emoji: '💻', options: [{ label: 'Side project', emoji: '🛠️' }, { label: 'Ship at work', emoji: '💼' }] },
  thrifting: { question: 'Flea market or vintage store?', emoji: '🛍️', options: [{ label: 'Flea market', emoji: '🧺' }, { label: 'Vintage store', emoji: '👗' }] },
  outdoors: { question: 'Hike or camp?', emoji: '🌿', options: [{ label: 'Hike', emoji: '🥾' }, { label: 'Camp', emoji: '⛺' }] },
  'internet-fandom': { question: 'Reddit deep-dive or YouTube rabbit hole?', emoji: '🧠', options: [{ label: 'Reddit deep-dive', emoji: '🧵' }, { label: 'YouTube rabbit hole', emoji: '📺' }] },
};

// Fallback pool when two people share nothing in the catalogs above (rare
// -- matching already implies some overlap -- but always possible).
const GENERIC_STARTERS: StarterSeed[] = [
  { question: 'Morning person or night owl?', emoji: '⏰', options: [{ label: 'Morning person', emoji: '🌅' }, { label: 'Night owl', emoji: '🌙' }] },
  { question: 'Window seat or aisle seat?', emoji: '✈️', options: [{ label: 'Window', emoji: '🪟' }, { label: 'Aisle', emoji: '🚶' }] },
  { question: 'Sweet or spicy?', emoji: '😋', options: [{ label: 'Sweet', emoji: '🍬' }, { label: 'Spicy', emoji: '🌶️' }] },
  { question: 'Text person or call person?', emoji: '📱', options: [{ label: 'Text', emoji: '💬' }, { label: 'Call', emoji: '📞' }] },
  { question: 'Plan the day or wing it?', emoji: '✨', options: [{ label: 'Plan it', emoji: '📋' }, { label: 'Wing it', emoji: '🎲' }] },
];

/**
 * Picks one tap-to-answer starter, preferring something the two people
 * actually share. `excludeSources` (this match's already-used starter
 * `source`s) keeps repeated "⚡ Vybe" taps from serving the same question
 * twice in a row.
 */
export function pickStarter(shared: SharedProfileBits, excludeSources: string[] = []): Starter {
  const candidates: Starter[] = [];
  for (const label of shared.interestLabels) {
    const seed = INTEREST_STARTERS[label];
    const source = `interest:${label}`;
    if (seed && !excludeSources.includes(source)) candidates.push({ ...seed, source });
  }
  for (const slug of shared.tribeSlugs) {
    const seed = TRIBE_STARTERS[slug];
    const source = `tribe:${slug}`;
    if (seed && !excludeSources.includes(source)) candidates.push({ ...seed, source });
  }

  if (candidates.length > 0) {
    // Non-null: this branch only runs when candidates.length > 0.
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  // Nothing shared (or every shared starter's already been used this
  // conversation) -- fall back to the generic pool, still avoiding an
  // immediate repeat where possible.
  const genericCandidates = GENERIC_STARTERS.map((seed, i) => ({ ...seed, source: `generic:${i}` })).filter(
    (s) => !excludeSources.includes(s.source)
  );
  const pool = genericCandidates.length > 0 ? genericCandidates : GENERIC_STARTERS.map((seed, i) => ({ ...seed, source: `generic:${i}` }));
  // Non-null: pool is always built from a non-empty array above.
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// Open-ended "Ask about me" questions -- tapping "Ask me about... Gaming"
// on someone's profile composes and sends one of these as a normal text
// message, so the asker never has to invent an opening line themselves.
const INTEREST_ASK_QUESTIONS: Record<string, string> = {
  Coffee: "What's your go-to coffee order?",
  Foodie: "What's the best thing you've eaten recently?",
  Concerts: "What's the best live show you've ever been to?",
  Gaming: "What's the game you could play for hours?",
  Music: 'What song is stuck in your head lately?',
  'Movies & shows': "What's a show you'd make someone binge with you?",
  Gym: "What's your favorite way to work out?",
  Nature: "What's your favorite place to just be outside?",
  Travel: "What's the next place on your travel list?",
  'Weekend trips': 'Where would you go for a spontaneous weekend trip?',
  'Cozy nights': 'What does your ideal cozy night in look like?',
  Photography: 'What do you love photographing most?',
  Fashion: 'How would you describe your style in three words?',
  Creativity: "What's something creative you made that you're proud of?",
  Cooking: "What's your signature dish?",
  Running: 'What keeps you motivated to run?',
  Dogs: 'Tell me about your dog (or dream dog)?',
  Comedy: "Who's your favorite comedian right now?",
  Nightlife: "What's your ideal night out?",
  'Beach days': 'Mountains or beaches, and why?',
  Books: 'What book have you recommended the most?',
  'Geeky stuff': "What's a fandom you could talk about for hours?",
  Wellness: "What's part of your self-care routine?",
  'Home & interiors': "What's your dream home vibe?",
  'Gardening / plants': "What's the plant you're proudest of keeping alive?",
};

const TRIBE_ASK_QUESTIONS: Record<string, string> = {
  gaming: "What's your most-played game of all time?",
  anime: 'What anime got you hooked in the first place?',
  music: "What's on repeat for you this week?",
  booktok: 'What book do you recommend to everyone?',
  'run-club': "What's your favorite running route?",
  coffee: "What's your coffee order, exactly?",
  concerts: "What's the best concert you've been to?",
  climbing: 'What got you into climbing?',
  photography: "What's your favorite thing to photograph?",
  foodies: "What's the best meal you've had this year?",
  tech: 'What are you building or tinkering with lately?',
  thrifting: "What's the best thing you've ever thrifted?",
  outdoors: "What's your favorite trail or spot outdoors?",
  'internet-fandom': "What's a rabbit hole you fell into recently?",
};

export function askQuestionFor(kind: 'interest' | 'tribe', key: string): string | null {
  return (kind === 'interest' ? INTEREST_ASK_QUESTIONS[key] : TRIBE_ASK_QUESTIONS[key]) ?? null;
}

// A handful of interests/tribes get a personalized "Say hi" quick message
// (e.g. "Chai first? ☕") layered on top of the 3 universal ones below --
// see buildSayHiMessages.
const SAY_HI_HOOKS: { match: (shared: SharedProfileBits) => boolean; text: string }[] = [
  { match: (s) => s.interestLabels.includes('Coffee') || s.tribeSlugs.includes('coffee'), text: 'Chai first? ☕' },
  { match: (s) => s.interestLabels.includes('Gaming') || s.tribeSlugs.includes('gaming'), text: 'That gaming pick though 🎮' },
  { match: (s) => s.interestLabels.includes('Travel') || s.interestLabels.includes('Weekend trips'), text: "Let's plan that trip already ✈️" },
  { match: (s) => s.interestLabels.includes('Foodie') || s.tribeSlugs.includes('foodies'), text: 'Street food or fine dining, go 🍜' },
  { match: (s) => s.interestLabels.includes('Music') || s.tribeSlugs.includes('music'), text: "What's on your playlist? 🎧" },
  { match: (s) => s.tribeSlugs.includes('booktok') || s.interestLabels.includes('Books'), text: 'What are you reading right now? 📚' },
  { match: (s) => s.interestLabels.includes('Dogs'), text: 'Tell me about your dog 🐶' },
  { match: (s) => s.tribeSlugs.includes('outdoors') || s.interestLabels.includes('Nature'), text: 'Hike this weekend? 🥾' },
];

/**
 * Quick-start "Say hi" openers for the match screen -- 3 universal ones
 * plus up to 2 shaped by whatever the two people actually share, e.g.
 * "Chai first? ☕" when both picked Coffee. Tapping one just sends it as
 * a normal text message (see the match modal / chat page).
 */
export function buildSayHiMessages(shared: SharedProfileBits): string[] {
  const universal = ['Hey! 👋', 'Okay, we matched 😄', 'Your profile caught my attention 👀'];
  const hooks = SAY_HI_HOOKS.filter((h) => h.match(shared))
    .slice(0, 2)
    .map((h) => h.text);
  return [...universal, ...hooks];
}

// "Make a plan" pick-lists -- activity, then vibe. Proposing one posts a
// PLAN-kind message (see prisma/schema.prisma's MessageKind) as a static
// card; the two people then work out details in ordinary messages below
// it, rather than this becoming a whole separate scheduling flow.
export const PLAN_ACTIVITIES: StarterOption[] = [
  { label: 'Coffee', emoji: '☕' },
  { label: 'Food', emoji: '🍜' },
  { label: 'Movie', emoji: '🎬' },
  { label: 'Gaming', emoji: '🎮' },
  { label: 'Walk', emoji: '🚶' },
  { label: 'Concert/event', emoji: '🎤' },
  { label: 'Explore somewhere', emoji: '🏖️' },
];

export const PLAN_VIBES: StarterOption[] = [
  { label: 'Chill', emoji: '😌' },
  { label: 'Fun', emoji: '🎉' },
  { label: 'Adventure', emoji: '🧭' },
  { label: 'Foodie', emoji: '🍽️' },
];
