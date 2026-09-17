// Shared seed/reference data. Used by prisma/seed.ts (to populate the DB)
// and by the onboarding UI (to render pick-lists) so the two never drift.

// `tagline` is the first-person phrase shown on the discover reveal card
// (see components/VibeCard.tsx) instead of `label` — label is what
// onboarding/profile pick-list chips show, tagline is the flirtier version
// used once someone's browsing the feed.
export const INTERESTS: { label: string; emoji: string; tagline: string }[] = [
  { label: 'Travel & exploring', emoji: '✈️', tagline: "Take me somewhere" },
  { label: 'Foodie', emoji: '🍜', tagline: "Let's find the best food" },
  { label: 'Music', emoji: '🎵', tagline: 'Always listening to something' },
  { label: 'Fitness & gym', emoji: '🏋️', tagline: 'Gym is therapy' },
  { label: 'Nature & outdoors', emoji: '🌿', tagline: 'Touch grass 🌱' },
  { label: 'Movies & series', emoji: '🎬', tagline: 'One more episode…' },
  { label: 'Gaming', emoji: '🎮', tagline: 'Game night?' },
  { label: 'Books / BookTok', emoji: '📚', tagline: 'Book > movie?' },
  { label: 'Cooking together', emoji: '🧑‍🍳', tagline: "I'll cook, you judge" },
  { label: 'Cafés & coffee', emoji: '☕', tagline: 'Coffee walk?' },
  { label: 'Running / walking', emoji: '🏃', tagline: "Let's go for a walk" },
  { label: 'Creative / arts', emoji: '🎨', tagline: 'Make something' },
  { label: 'Photography / content', emoji: '📸', tagline: 'Always taking pics' },
  { label: 'Weekend getaways', emoji: '🧳', tagline: 'Spontaneous trip?' },
  { label: 'Pets & animals', emoji: '🐶', tagline: 'Dog person / cat person' },
  { label: 'Concerts & live music', emoji: '🎤', tagline: 'Front row energy' },
  { label: 'Nerdy / niche interests', emoji: '🧩', tagline: "Let's geek out" },
  { label: 'Fashion & thrifting', emoji: '🛍️', tagline: 'Vintage > fast fashion' },
  { label: 'Wellness / mindfulness', emoji: '🧘', tagline: 'Slow living' },
  { label: 'Chill nights at home', emoji: '🌙', tagline: 'Cozy > clubbing' },
];

export const PROMPTS: { text: string; emoji: string }[] = [
  { text: 'Chai tapri or filter coffee?', emoji: '☕' },
  { text: 'Sunday plan: trek or Netflix?', emoji: '🥾' },
  { text: 'Family group chat energy?', emoji: '👨‍👩‍👧' },
  { text: 'A memory that shaped me', emoji: '✨' },
  { text: 'Most controversial food opinion', emoji: '🌶️' },
  { text: 'My love language is...', emoji: '💬' },
  { text: 'The last thing that made me laugh out loud', emoji: '😂' },
  { text: 'Where I actually want to be five years from now', emoji: '🧭' },
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
