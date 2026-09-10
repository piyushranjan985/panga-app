// Shared seed/reference data. Used by prisma/seed.ts (to populate the DB)
// and by the onboarding UI (to render pick-lists) so the two never drift.

export const INTERESTS: { label: string; emoji: string }[] = [
  { label: 'Indie Hindi playlists', emoji: '🎧' },
  { label: 'Trekking', emoji: '🥾' },
  { label: 'Street food crawling', emoji: '🍜' },
  { label: 'Cricket', emoji: '🏏' },
  { label: 'Stand-up comedy', emoji: '🎤' },
  { label: 'Thrifting', emoji: '👕' },
  { label: 'Filter coffee', emoji: '☕' },
  { label: 'K-dramas', emoji: '📺' },
  { label: 'Gigs & live music', emoji: '🎸' },
  { label: 'Bike rides', emoji: '🏍️' },
  { label: 'Startups & side hustles', emoji: '🚀' },
  { label: 'Festival food', emoji: '🪔' },
  { label: 'Fantasy cricket', emoji: '📊' },
  { label: 'Reading fiction', emoji: '📚' },
  { label: 'Dogs & strays', emoji: '🐕' },
  { label: 'Gaming', emoji: '🎮' },
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
