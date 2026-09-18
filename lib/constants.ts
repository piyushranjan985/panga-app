// Shared seed/reference data. Used by prisma/seed.ts (to populate the DB)
// and by the onboarding UI (to render pick-lists) so the two never drift.
//
// Onboarding is intent-specific (see app/onboarding/page.tsx): the first
// two steps (Basics, Photos) are identical for all three intents, then the
// experience progressively diverges. Several lists below carry an
// `intents` tag so one shared table can serve all three flows without
// duplicating rows -- an empty `intents` array means "show for every
// intent." A few lists (Date Vibe, Tonight, Values, Future Vibe, Children,
// Living Preference) are single-intent, plain tag/enum-style pick-lists
// with no drill-down or cross-intent reuse, so they're just constants --
// no DB table, no relation, stored directly as string fields on Profile
// (see prisma/schema.prisma) and validated against these lists in
// app/api/profile/route.ts.

type IntentType = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';

// The "✨ What are you into?" onboarding step (app/onboarding/page.tsx) --
// short, casual tags, pick 5-8. This is the shallow/broad layer; Tribe
// (below) is the deeper one with drill-down into specific communities,
// and only exists for Something Real / Rishta Ready.
// `tagline` is the first-person phrase shown on the discover reveal card
// (see components/VibeCard.tsx) instead of `label`. `intents`: empty =
// shown for all three intents.
export const INTERESTS: { label: string; emoji: string; tagline: string; intents: IntentType[] }[] = [
  { label: 'Coffee', emoji: '☕', tagline: 'Coffee walk?', intents: [] },
  { label: 'Foodie', emoji: '🍜', tagline: "Let's find the best food", intents: [] },
  { label: 'Concerts', emoji: '🎤', tagline: 'Front row energy', intents: [] },
  { label: 'Gaming', emoji: '🎮', tagline: 'Game night?', intents: [] },
  { label: 'Music', emoji: '🎵', tagline: 'Always listening to something', intents: [] },
  { label: 'Movies & shows', emoji: '🎬', tagline: 'One more episode...', intents: [] },
  { label: 'Gym', emoji: '🏋️', tagline: 'Gym is therapy', intents: [] },
  { label: 'Nature', emoji: '🌿', tagline: 'Touch grass', intents: [] },
  { label: 'Travel', emoji: '✈️', tagline: 'Take me somewhere', intents: [] },
  { label: 'Weekend trips', emoji: '🧳', tagline: 'Spontaneous trip?', intents: [] },
  { label: 'Cozy nights', emoji: '🌙', tagline: 'Cozy > clubbing', intents: [] },
  { label: 'Photography', emoji: '📸', tagline: 'Always taking pics', intents: [] },
  { label: 'Fashion', emoji: '🛍️', tagline: 'Vintage > fast fashion', intents: [] },
  { label: 'Creativity', emoji: '🎨', tagline: 'Make something', intents: [] },
  { label: 'Cooking', emoji: '🧑‍🍳', tagline: "I'll cook, you judge", intents: [] },
  { label: 'Running', emoji: '🏃', tagline: "Let's go for a run", intents: [] },
  { label: 'Dogs', emoji: '🐶', tagline: 'Certified dog person', intents: [] },
  { label: 'Comedy', emoji: '😂', tagline: 'Send me the funny reel', intents: ['JUST_VIBING'] },
  { label: 'Nightlife', emoji: '🎉', tagline: 'Out till late', intents: ['JUST_VIBING'] },
  { label: 'Beach days', emoji: '🏖️', tagline: 'Sand between my toes', intents: ['JUST_VIBING'] },
  { label: 'Books', emoji: '📚', tagline: 'Book > movie?', intents: ['SOMETHING_REAL', 'RISHTA_READY'] },
  { label: 'Geeky stuff', emoji: '🧩', tagline: "Let's geek out", intents: ['SOMETHING_REAL', 'RISHTA_READY'] },
  { label: 'Wellness', emoji: '🧘', tagline: 'Slow living', intents: ['SOMETHING_REAL', 'RISHTA_READY'] },
  { label: 'Home & interiors', emoji: '🏡', tagline: 'Nesting energy', intents: ['RISHTA_READY'] },
  { label: 'Gardening / plants', emoji: '🌱', tagline: 'Ask me about my plants', intents: ['RISHTA_READY'] },
];

// "My ideal relationship is..." onboarding step, shown only for Something
// Real (renamed on-screen to "Your relationship vibe" -- see
// app/onboarding/page.tsx) -- the values layer, pick exactly 3. `pairPhrase`
// is the "Both X" line shown on the Vibe Match reveal (lib/vibeMatch.ts)
// when two people share this one.
export const RELATIONSHIP_STYLES: { label: string; emoji: string; pairPhrase: string }[] = [
  { label: 'Best friends first', emoji: '🤝', pairPhrase: 'Both want best friends first' },
  { label: 'Deep conversations', emoji: '💬', pairPhrase: 'Both crave deep conversations' },
  { label: 'Lots of laughs', emoji: '😂', pairPhrase: 'Both here for the laughs' },
  { label: 'Building a life together', emoji: '🏗️', pairPhrase: 'Both building a life together' },
  { label: 'Adventure partners', emoji: '🧭', pairPhrase: 'Both adventure partners' },
  { label: 'Calm & peaceful', emoji: '🕊️', pairPhrase: 'Both keep it calm & peaceful' },
  { label: 'Very affectionate', emoji: '🤗', pairPhrase: 'Both very affectionate' },
  { label: 'Independent but close', emoji: '🌤️', pairPhrase: 'Both independent but close' },
  { label: 'Family-oriented', emoji: '🏡', pairPhrase: 'Both family-oriented' },
  { label: 'Career + relationship balance', emoji: '⚖️', pairPhrase: 'Both balance career & relationship' },
];

// "What's your tribe?" onboarding step -- the deep-cut layer under
// Interests, shown for Something Real (full list) and Rishta Ready
// (reduced list -- Concerts and Internet & fandom are Something Real
// only, tagged below). Never shown for Just Vibing, which uses Date Vibe
// instead -- a niche-community layer is too deep for a casual flow.
//
// Pick up to 5 tribes (4 for Rishta Ready); for each one, pick 1-3
// specific subCommunities. `personaLabel` is how a picked tribe shows on
// the profile page's "Your tribes" section. `activityPhrase` is the
// date-idea-flavored line used in the Vibe Match "you might get along
// over" section. `sharedPhrase` is the first-person-plural line used in
// the match-reveal "you found N shared worlds" moment. `intents`: empty =
// Something Real + Rishta Ready both.
export const TRIBES: {
  slug: string;
  label: string;
  emoji: string;
  personaLabel: string;
  activityPhrase: string;
  sharedPhrase: string;
  intents: IntentType[];
  subCommunities: string[];
}[] = [
  {
    slug: 'gaming',
    label: 'Gaming',
    emoji: '🎮',
    personaLabel: 'Gamer',
    activityPhrase: 'Gaming nights',
    sharedPhrase: 'You both game',
    intents: [],
    subCommunities: ['Nintendo', 'PlayStation', 'Xbox', 'PC', 'Mobile', 'Retro', 'Fortnite', 'Cozy games', 'Competitive'],
  },
  {
    slug: 'anime',
    label: 'Anime',
    emoji: '🎌',
    personaLabel: 'Anime fan',
    activityPhrase: 'Anime marathons',
    sharedPhrase: "You're both into anime",
    intents: [],
    subCommunities: ['Shonen', 'Shojo', 'Studio Ghibli', 'Isekai', 'Slice of life', 'Fan art', 'Manga reader', 'Conventions'],
  },
  {
    slug: 'music',
    label: 'Music',
    emoji: '🎧',
    personaLabel: 'Music head',
    activityPhrase: 'Concert hunting',
    sharedPhrase: 'You both love music',
    intents: [],
    subCommunities: ['Rave/Techno', 'K-pop', 'Hip-hop', 'Indie', 'Rock', 'Pop', 'Metal', 'Classical', 'Bollywood'],
  },
  {
    slug: 'booktok',
    label: 'BookTok',
    emoji: '📚',
    personaLabel: 'Reader',
    activityPhrase: 'Book swaps',
    sharedPhrase: "You're both bookworms",
    intents: [],
    subCommunities: ['Romance', 'Fantasy', 'Thriller', 'Sci-fi', 'Literary', 'Self-development', 'Poetry'],
  },
  {
    slug: 'run-club',
    label: 'Run Club',
    emoji: '🏃',
    personaLabel: 'Runner',
    activityPhrase: 'Morning runs',
    sharedPhrase: 'You both run',
    intents: [],
    subCommunities: ['5K casual', 'Marathon training', 'Trail running', 'Run clubs & crews', 'Track & speed work'],
  },
  {
    slug: 'coffee',
    label: 'Coffee',
    emoji: '☕',
    personaLabel: 'Coffee person',
    activityPhrase: 'Coffee dates',
    sharedPhrase: "You're both coffee people",
    intents: [],
    subCommunities: ['Third-wave cafes', 'Filter coffee purist', 'Home brewing', 'Coffee & work sessions', 'Cafe hopping'],
  },
  {
    slug: 'concerts',
    label: 'Concerts',
    emoji: '🎤',
    personaLabel: 'Concert-goer',
    activityPhrase: 'Concert trips',
    sharedPhrase: 'You both chase live shows',
    intents: ['SOMETHING_REAL'],
    subCommunities: ['Festivals', 'Indie gigs', 'Arena shows', 'Open mics', 'Local live scene'],
  },
  {
    slug: 'climbing',
    label: 'Climbing',
    emoji: '🧗',
    personaLabel: 'Climber',
    activityPhrase: 'Climbing sessions',
    sharedPhrase: 'You both climb',
    intents: [],
    subCommunities: ['Bouldering', 'Sport climbing', 'Trad climbing', 'Outdoor trekking', 'Gym sessions'],
  },
  {
    slug: 'photography',
    label: 'Photography',
    emoji: '📸',
    personaLabel: 'Photographer',
    activityPhrase: 'Photo walks',
    sharedPhrase: "You're both always taking pics",
    intents: [],
    subCommunities: ['Street photography', 'Film photography', 'Portrait', 'Travel photography', 'Content creation'],
  },
  {
    slug: 'foodies',
    label: 'Foodies',
    emoji: '🍜',
    personaLabel: 'Foodie',
    activityPhrase: 'Food crawls',
    sharedPhrase: "You're both foodies",
    intents: [],
    subCommunities: ['Street food', 'Fine dining', 'Home cooking', 'Baking', 'Trying new cuisines'],
  },
  {
    slug: 'tech',
    label: 'Tech',
    emoji: '💻',
    personaLabel: 'Tech nerd',
    activityPhrase: 'Hackathon weekends',
    sharedPhrase: "You're both tech nerds",
    intents: [],
    subCommunities: ['Startups & side hustles', 'AI/ML', 'Web3', 'Open source', 'Hackathons', 'Gadgets'],
  },
  {
    slug: 'thrifting',
    label: 'Thrifting',
    emoji: '🛍️',
    personaLabel: 'Thrifter',
    activityPhrase: 'Thrift hauls',
    sharedPhrase: 'You both thrift',
    intents: [],
    subCommunities: ['Vintage fashion', 'Sneaker culture', 'Upcycling & DIY', 'Flea markets', 'Streetwear'],
  },
  {
    slug: 'internet-fandom',
    label: 'Internet & fandom',
    emoji: '🧠',
    personaLabel: 'Internet native',
    activityPhrase: 'Deep internet rabbit holes',
    sharedPhrase: "You're both terminally online (affectionately)",
    intents: ['SOMETHING_REAL'],
    subCommunities: [
      'Reddit communities',
      'YouTube deep-dives',
      'Cosplay',
      'Trivia',
      'Geoguessr',
      'AI nerds',
      'Digital art',
      'Meme culture',
      'Niche internet communities',
    ],
  },
];

// Vybe Check prompts: deliberately a forced pick between two fixed
// options, never free text -- no typing, no blank-page anxiety, and every
// answer is directly comparable between two people (see
// components/VibeCard.tsx's reveal mechanic and app/onboarding/page.tsx's
// Vybe Check step). The tone shifts hard by intent -- playful for Just
// Vibing, relationship-facing for Something Real, future/family-facing
// for Rishta Ready -- so every prompt below is tagged to exactly one.
export const PROMPTS: { text: string; emoji: string; optionA: string; optionB: string; intents: IntentType[] }[] = [
  // --- Just Vibing (pick 2) ---
  { text: 'Friday night: stay in or go out?', emoji: '🌃', optionA: 'Netflix & snacks', optionB: "Let's go out", intents: ['JUST_VIBING'] },
  { text: 'Holiday: beach or adventure?', emoji: '🏝️', optionA: 'Beach & chill', optionB: 'Adventure & explore', intents: ['JUST_VIBING'] },
  { text: 'Date vibe: coffee or drinks?', emoji: '☕', optionA: 'Coffee & conversation', optionB: 'Drinks & chaos', intents: ['JUST_VIBING'] },
  { text: 'Message style: text all day or just call?', emoji: '💬', optionA: 'Text me all day', optionB: 'Just call me', intents: ['JUST_VIBING'] },
  { text: 'Plans: plan it or wing it?', emoji: '📅', optionA: 'Plan it', optionB: 'Wing it', intents: ['JUST_VIBING'] },
  { text: 'Social battery: more the merrier or small group?', emoji: '🕺', optionA: 'The more people, the better', optionB: 'Small group / low-key', intents: ['JUST_VIBING'] },
  // --- Something Real (pick 2) ---
  { text: 'Communication: talk it out or take space first?', emoji: '💬', optionA: 'Talk it out immediately', optionB: 'Give me some space first', intents: ['SOMETHING_REAL'] },
  { text: 'Sunday together or independent?', emoji: '🥰', optionA: 'Do everything together', optionB: 'Together, but independent', intents: ['SOMETHING_REAL'] },
  { text: 'Relationship pace: feeling or building slowly?', emoji: '🔥', optionA: 'Go with the feeling', optionB: 'Build it slowly', intents: ['SOMETHING_REAL'] },
  { text: 'Social life: always together or our own world?', emoji: '👯', optionA: 'Couple + friends everywhere', optionB: 'Our own little world', intents: ['SOMETHING_REAL'] },
  { text: 'Love language: words or actions?', emoji: '💌', optionA: 'Words & reassurance', optionB: 'Actions & affection', intents: ['SOMETHING_REAL'] },
  { text: 'Conflict: solve it now or cool down first?', emoji: '🗣️', optionA: "Let's solve it now", optionB: "Let's cool down first", intents: ['SOMETHING_REAL'] },
  { text: 'Spontaneity: surprise me or tell me the plan?', emoji: '🎲', optionA: 'Surprise me', optionB: 'Tell me the plan', intents: ['SOMETHING_REAL'] },
  { text: 'Ideal evening: laugh until 2AM or quiet talk?', emoji: '😂', optionA: 'Laugh until 2 AM', optionB: 'Quiet deep conversation', intents: ['SOMETHING_REAL'] },
  // --- Rishta Ready (pick 2-3) ---
  { text: 'Home: build our own or stay close to family?', emoji: '🏡', optionA: 'Build our own home', optionB: 'Stay close to family', intents: ['RISHTA_READY'] },
  { text: 'Lifestyle: keep exploring or build a routine?', emoji: '🌍', optionA: 'Keep exploring', optionB: 'Build a stable routine', intents: ['RISHTA_READY'] },
  { text: 'Career: chase ambitions or protect our life together?', emoji: '🚀', optionA: 'Chase big ambitions', optionB: 'Protect our life together', intents: ['RISHTA_READY'] },
  { text: 'Money: build wealth or spend on experiences?', emoji: '📈', optionA: 'Build wealth together', optionB: 'Spend on experiences', intents: ['RISHTA_READY'] },
  { text: 'Family size: big family or small & close-knit?', emoji: '👨‍👩‍👧', optionA: 'Big family life', optionB: 'Small, close-knit family', intents: ['RISHTA_READY'] },
  { text: 'Conflict: talk it through now or take space first?', emoji: '🧘', optionA: 'Talk everything through', optionB: 'Take space, then talk', intents: ['RISHTA_READY'] },
  { text: 'Partnership: do everything together or stay independent?', emoji: '❤️', optionA: 'Partners in everything', optionB: 'Two independent people', intents: ['RISHTA_READY'] },
  { text: 'Five years from now: settled or still chasing something new?', emoji: '🧭', optionA: 'Settled & stable', optionB: 'Still chasing something new', intents: ['RISHTA_READY'] },
];

// --- Just Vibing only ------------------------------------------------------

// "What's your kind of date?" -- replaces Tribe for Just Vibing (too deep
// a layer for a casual flow). Pick exactly 3. Plain tags, not a relational
// table -- see prisma/schema.prisma's Profile.dateVibeTags.
export const DATE_VIBES: { slug: string; label: string; emoji: string }[] = [
  { slug: 'coffee-conversation', label: 'Coffee & conversation', emoji: '☕' },
  { slug: 'food-adventure', label: 'Food adventure', emoji: '🍜' },
  { slug: 'movie-night', label: 'Movie night', emoji: '🎬' },
  { slug: 'drinks-nightlife', label: 'Drinks & nightlife', emoji: '🍸' },
  { slug: 'long-walk', label: 'Long walk', emoji: '🚶' },
  { slug: 'concert', label: 'Concert', emoji: '🎤' },
  { slug: 'gaming', label: 'Gaming', emoji: '🎮' },
  { slug: 'beach-day', label: 'Beach day', emoji: '🏖️' },
  { slug: 'active-date', label: 'Active date', emoji: '🏃' },
  { slug: 'creative', label: 'Something creative', emoji: '🎨' },
  { slug: 'shopping-exploring', label: 'Shopping / exploring', emoji: '🛍️' },
  { slug: 'road-trip', label: 'Random road trip', emoji: '🚗' },
];

// "What are you looking for tonight?" -- Just Vibing only, pick up to 2.
// Distinguishes casual dating from hookup-oriented expectations without
// making the app overly explicit. See Profile.tonightTags.
export const TONIGHT_OPTIONS: { slug: string; label: string; emoji: string }[] = [
  { slug: 'talk', label: 'Someone to talk to', emoji: '💬' },
  { slug: 'casual-coffee', label: 'Casual coffee', emoji: '☕' },
  { slug: 'dinner-date', label: 'Dinner / food date', emoji: '🍜' },
  { slug: 'go-out', label: 'Go out & have fun', emoji: '🎉' },
  { slug: 'event-buddy', label: 'Concert / event buddy', emoji: '🎤' },
  { slug: 'walk-explore', label: 'Walk & explore', emoji: '🚶' },
  { slug: 'chemistry', label: 'Chemistry & see where it goes', emoji: '🔥' },
  { slug: 'open-to-more', label: 'Open to something more', emoji: '❤️' },
];

// --- Rishta Ready only ------------------------------------------------------

// Basics step's extra question ("Where do you see yourself living?") --
// single-select. See Profile.livingPreference.
export const LIVING_PREFERENCES: { slug: string; label: string; emoji: string }[] = [
  { slug: 'urban', label: 'Same city / urban life', emoji: '🏙️' },
  { slug: 'open-to-moving', label: 'Open to moving', emoji: '🌍' },
  { slug: 'close-to-family', label: 'Prefer staying close to family', emoji: '🏡' },
  { slug: 'abroad', label: 'Open to another country', emoji: '✈️' },
];

// "What matters most?" -- the values layer for Rishta Ready, replacing
// the Something Real "relationship vibe" step. Pick exactly 4. See
// Profile.valuesTags.
export const VALUES_OPTIONS: { slug: string; label: string; emoji: string }[] = [
  { slug: 'family', label: 'Family', emoji: '🏡' },
  { slug: 'career', label: 'Career & ambition', emoji: '🚀' },
  { slug: 'partnership', label: 'Partnership', emoji: '❤️' },
  { slug: 'financial-stability', label: 'Financial stability', emoji: '💰' },
  { slug: 'personal-growth', label: 'Personal growth', emoji: '🌱' },
  { slug: 'peace-stability', label: 'Peace & stability', emoji: '🧘' },
  { slug: 'travel-experiences', label: 'Travel & experiences', emoji: '🌍' },
  { slug: 'community', label: 'Community', emoji: '🤝' },
  { slug: 'building-a-home', label: 'Building a home', emoji: '🏠' },
  { slug: 'having-children', label: 'Having children', emoji: '👨‍👩‍👧' },
  { slug: 'faith-spirituality', label: 'Faith / spirituality', emoji: '🙏' },
  { slug: 'work-life-balance', label: 'Work-life balance', emoji: '⚖️' },
];

// "Your future vibe" -- 4 forced binary picks, Rishta Ready only. See
// Profile.futureHome / futureFamily / futureCareer / futureMoney.
export const FUTURE_VIBE_QUESTIONS: {
  key: 'home' | 'family' | 'career' | 'money';
  question: string;
  optionA: { slug: string; label: string; emoji: string };
  optionB: { slug: string; label: string; emoji: string };
}[] = [
  {
    key: 'home',
    question: 'Where do you see home?',
    optionA: { slug: 'city', label: 'City life', emoji: '🏙️' },
    optionB: { slug: 'suburban', label: 'Quiet / suburban life', emoji: '🏡' },
  },
  {
    key: 'family',
    question: 'Family life?',
    optionA: { slug: 'family_central', label: 'Family is central', emoji: '👨‍👩‍👧' },
    optionB: { slug: 'couple_first', label: 'Couple comes first', emoji: '🌤️' },
  },
  {
    key: 'career',
    question: 'Career?',
    optionA: { slug: 'career_priority', label: 'Career is a major priority', emoji: '🚀' },
    optionB: { slug: 'balance', label: 'Balance is more important', emoji: '⚖️' },
  },
  {
    key: 'money',
    question: 'Money?',
    optionA: { slug: 'save_build', label: 'Save & build', emoji: '💰' },
    optionB: { slug: 'enjoy_experience', label: 'Enjoy & experience', emoji: '✨' },
  },
];

// Children: deliberately 3-way, not binary -- "want" / "don't want" alone
// can't capture someone who's unsure or still open to discussing it.
// Rishta Ready only. See Profile.children.
export const CHILDREN_OPTIONS: { slug: string; label: string; emoji: string }[] = [
  { slug: 'want-children', label: 'Want children', emoji: '👶' },
  { slug: 'dont-want-children', label: "Don't want children", emoji: '🚫' },
  { slug: 'open-unsure', label: 'Open / unsure', emoji: '🤔' },
];

export const CIRCLES: { slug: string; name: string; city: string | null; category: string; description: string }[] = [
  { slug: 'iitb-27', name: "IIT Bombay '27", city: 'Mumbai', category: 'college', description: 'Current students & recent grads' },
  { slug: 'du-north-campus', name: 'DU North Campus', city: 'Delhi NCR', category: 'college', description: 'Delhi University, North Campus colleges' },
  { slug: 'mumbai-indie-music', name: 'Mumbai Indie Music', city: 'Mumbai', category: 'interest', description: 'Gig-goers and bedroom musicians' },
  { slug: 'bengaluru-startups', name: 'Bengaluru Startup Circle', city: 'Bengaluru', category: 'interest', description: 'Builders, first hires, and the eternally-fundraising' },
  { slug: 'diwali-foodies', name: 'Diwali Foodies', city: null, category: 'festival', description: 'Mithai opinions welcome, fights encouraged' },
  { slug: 'pune-marathon-runners', name: 'Pune Marathon Runners', city: 'Pune', category: 'interest', description: '5am starts, unreasonable enthusiasm' },
  { slug: 'delhi-ncr-standup', name: 'Delhi NCR Open Mics', city: 'Delhi NCR', category: 'interest', description: 'Comedy nights and the people who suffer through them' },
  { slug: 'ipl-fantasy-league', name: 'IPL Fantasy League', city: null, category: 'interest', description: 'Season-long chaos, one group chat' },
];

export const CITIES = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Pune', 'Hyderabad', 'Chennai'];

export const AVATAR_HUES = [1, 2, 3, 4, 5, 6] as const;
