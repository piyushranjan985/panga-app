// Shared seed/reference data. Used by prisma/seed.ts (to populate the DB)
// and by the onboarding UI (to render pick-lists) so the two never drift.

// The "✨ What are you into?" onboarding step (app/onboarding/page.tsx) —
// short, casual tags, pick 5-8. This is the shallow/broad layer; Tribe
// (below) is the deeper one with drill-down into specific communities.
// `tagline` is the first-person phrase shown on the discover reveal card
// (see components/VibeCard.tsx) instead of `label`.
export const INTERESTS: { label: string; emoji: string; tagline: string }[] = [
  { label: 'Travel', emoji: '✈️', tagline: 'Take me somewhere' },
  { label: 'Foodie', emoji: '🍜', tagline: "Let's find the best food" },
  { label: 'Gaming', emoji: '🎮', tagline: 'Game night?' },
  { label: 'Music', emoji: '🎵', tagline: 'Always listening to something' },
  { label: 'Gym', emoji: '🏋️', tagline: 'Gym is therapy' },
  { label: 'Nature', emoji: '🌿', tagline: 'Touch grass 🌱' },
  { label: 'Netflix', emoji: '🎬', tagline: 'One more episode…' },
  { label: 'Coffee', emoji: '☕', tagline: 'Coffee walk?' },
  { label: 'Dogs', emoji: '🐶', tagline: 'Certified dog person' },
  { label: 'Books', emoji: '📚', tagline: 'Book > movie?' },
  { label: 'Concerts', emoji: '🎤', tagline: 'Front row energy' },
  { label: 'Photography', emoji: '📸', tagline: 'Always taking pics' },
  { label: 'Cooking', emoji: '🧑‍🍳', tagline: "I'll cook, you judge" },
  { label: 'Weekend trips', emoji: '🧳', tagline: 'Spontaneous trip?' },
  { label: 'Geeky stuff', emoji: '🧩', tagline: "Let's geek out" },
  { label: 'Fashion', emoji: '🛍️', tagline: 'Vintage > fast fashion' },
  { label: 'Wellness', emoji: '🧘', tagline: 'Slow living' },
  { label: 'Creativity', emoji: '🎨', tagline: 'Make something' },
  { label: 'Running', emoji: '🏃', tagline: "Let's go for a run" },
  { label: 'Cozy nights', emoji: '🌙', tagline: 'Cozy > clubbing' },
];

// "My ideal relationship is…" onboarding step — the values layer, pick
// exactly 3. `pairPhrase` is the "Both X" line shown on the Vibe Match
// reveal (lib/vibeMatch.ts) when two people share this one.
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

// "What's your tribe?" onboarding step — the deep-cut layer under
// Interests. Pick up to 5 tribes; for each one, pick 1-3 specific
// subCommunities. This is what lets matching find "you're both PC
// players," not just "you both like gaming."
//
// `personaLabel` is how a picked tribe shows on the profile page's "Your
// tribes" section (e.g. "🎮 Gamer" instead of "🎮 Gaming"). `activityPhrase`
// is the date-idea-flavored line used in the Vibe Match "you might get
// along over" section. `sharedPhrase` is the first-person-plural line used
// in the match-reveal "you found N shared worlds" moment.
export const TRIBES: {
  slug: string;
  label: string;
  emoji: string;
  personaLabel: string;
  activityPhrase: string;
  sharedPhrase: string;
  subCommunities: string[];
}[] = [
  {
    slug: 'gaming',
    label: 'Gaming',
    emoji: '🎮',
    personaLabel: 'Gamer',
    activityPhrase: 'Gaming nights',
    sharedPhrase: 'You both game',
    subCommunities: ['Nintendo', 'PlayStation', 'Xbox', 'PC', 'Mobile', 'Retro', 'Fortnite', 'Cozy games', 'Competitive'],
  },
  {
    slug: 'anime',
    label: 'Anime',
    emoji: '🎌',
    personaLabel: 'Anime fan',
    activityPhrase: 'Anime marathons',
    sharedPhrase: "You're both into anime",
    subCommunities: ['Shonen', 'Shojo', 'Studio Ghibli', 'Isekai', 'Slice of life', 'Fan art', 'Manga reader', 'Conventions'],
  },
  {
    slug: 'music',
    label: 'Music',
    emoji: '🎧',
    personaLabel: 'Music head',
    activityPhrase: 'Concert hunting',
    sharedPhrase: 'You both love music',
    subCommunities: ['Rave/Techno', 'K-pop', 'Hip-hop', 'Indie', 'Rock', 'Pop', 'Metal', 'Classical', 'Bollywood'],
  },
  {
    slug: 'booktok',
    label: 'BookTok',
    emoji: '📚',
    personaLabel: 'Reader',
    activityPhrase: 'Book swaps',
    sharedPhrase: "You're both bookworms",
    subCommunities: ['Romance', 'Fantasy', 'Thriller', 'Sci-fi', 'Literary', 'Self-development', 'Poetry'],
  },
  {
    slug: 'run-club',
    label: 'Run Club',
    emoji: '🏃',
    personaLabel: 'Runner',
    activityPhrase: 'Morning runs',
    sharedPhrase: 'You both run',
    subCommunities: ['5K casual', 'Marathon training', 'Trail running', 'Run clubs & crews', 'Track & speed work'],
  },
  {
    slug: 'coffee',
    label: 'Coffee',
    emoji: '☕',
    personaLabel: 'Coffee person',
    activityPhrase: 'Coffee dates',
    sharedPhrase: "You're both coffee people",
    subCommunities: ['Third-wave cafés', 'Filter coffee purist', 'Home brewing', 'Coffee & work sessions', 'Café hopping'],
  },
  {
    slug: 'concerts',
    label: 'Concerts',
    emoji: '🎤',
    personaLabel: 'Concert-goer',
    activityPhrase: 'Concert trips',
    sharedPhrase: 'You both chase live shows',
    subCommunities: ['Festivals', 'Indie gigs', 'Arena shows', 'Open mics', 'Local live scene'],
  },
  {
    slug: 'climbing',
    label: 'Climbing',
    emoji: '🧗',
    personaLabel: 'Climber',
    activityPhrase: 'Climbing sessions',
    sharedPhrase: 'You both climb',
    subCommunities: ['Bouldering', 'Sport climbing', 'Trad climbing', 'Outdoor trekking', 'Gym sessions'],
  },
  {
    slug: 'photography',
    label: 'Photography',
    emoji: '📸',
    personaLabel: 'Photographer',
    activityPhrase: 'Photo walks',
    sharedPhrase: "You're both always taking pics",
    subCommunities: ['Street photography', 'Film photography', 'Portrait', 'Travel photography', 'Content creation'],
  },
  {
    slug: 'foodies',
    label: 'Foodies',
    emoji: '🍜',
    personaLabel: 'Foodie',
    activityPhrase: 'Food crawls',
    sharedPhrase: "You're both foodies",
    subCommunities: ['Street food', 'Fine dining', 'Home cooking', 'Baking', 'Trying new cuisines'],
  },
  {
    slug: 'tech',
    label: 'Tech',
    emoji: '💻',
    personaLabel: 'Tech nerd',
    activityPhrase: 'Hackathon weekends',
    sharedPhrase: "You're both tech nerds",
    subCommunities: ['Startups & side hustles', 'AI/ML', 'Web3', 'Open source', 'Hackathons', 'Gadgets'],
  },
  {
    slug: 'thrifting',
    label: 'Thrifting',
    emoji: '🛍️',
    personaLabel: 'Thrifter',
    activityPhrase: 'Thrift hauls',
    sharedPhrase: 'You both thrift',
    subCommunities: ['Vintage fashion', 'Sneaker culture', 'Upcycling & DIY', 'Flea markets', 'Streetwear'],
  },
  {
    // The category that makes VybeMatch feel different from a matrimony
    // site — internet-native subcultures, not hobbies in the traditional
    // sense. See the onboarding "What's your tribe?" step.
    slug: 'internet-fandom',
    label: 'Internet & fandom',
    emoji: '🧠',
    personaLabel: 'Internet native',
    activityPhrase: 'Deep internet rabbit holes',
    sharedPhrase: "You're both terminally online (affectionately)",
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

// Vybe Check prompts: deliberately a forced pick between two fixed options,
// never free text — no typing, no blank-page anxiety, and every answer is
// directly comparable between two people (see components/VibeCard.tsx's
// reveal mechanic and app/onboarding/page.tsx's Vybe Check step).
export const PROMPTS: { text: string; emoji: string; optionA: string; optionB: string }[] = [
  { text: 'Chai tapri or filter coffee?', emoji: '☕', optionA: 'Chai tapri', optionB: 'Filter coffee' },
  { text: 'Sunday plan: trek or Netflix?', emoji: '🥾', optionA: 'Trek at sunrise', optionB: 'Netflix all day' },
  {
    text: 'Family time: big joint gatherings or quiet with just parents?',
    emoji: '👨‍👩‍👧',
    optionA: 'Big joint gatherings',
    optionB: 'Quiet, just parents',
  },
  { text: 'Free evening: solo recharge or friends over?', emoji: '✨', optionA: 'Solo recharge', optionB: 'Friends over' },
  { text: 'Biryani loyalty: Hyderabadi or Lucknowi?', emoji: '🌶️', optionA: 'Hyderabadi', optionB: 'Lucknowi' },
  {
    text: 'Love language: words of affirmation or acts of service?',
    emoji: '💬',
    optionA: 'Words of affirmation',
    optionB: 'Acts of service',
  },
  { text: 'Humor type: dry sarcasm or full-on goofy?', emoji: '😂', optionA: 'Dry sarcasm', optionB: 'Full-on goofy' },
  {
    text: 'Five years from now: settled & stable or still chasing something new?',
    emoji: '🧭',
    optionA: 'Settled & stable',
    optionB: 'Chasing something new',
  },
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
