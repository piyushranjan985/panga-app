/**
 * Seeds reference data (circles, interests, prompts, tribes, date vibes,
 * values, etc.) plus demo users so /discover has something real to show
 * right after setup.
 *
 * Two kinds of demo users:
 *  - DEMO_USERS: 5 hand-written, specific profiles (used in walkthroughs,
 *    screenshots, etc. -- keep these recognizable).
 *  - generateBulkUsers(500): programmatically generated profiles for
 *    load-testing the discover/matching feed at a realistic population
 *    size. Randomized from fixed pools below, not meant to be individually
 *    memorable the way the 5 hand-written ones are.
 *
 * Every seeded user (both kinds) gets 1-5 photos -- pravatar.cc URLs, not
 * Vercel Blob, since these aren't real uploads and don't need real storage;
 * Photo.url doesn't care which kind of URL it holds.
 *
 * Onboarding -- and this seed file's data -- is intent-specific (see
 * app/onboarding/page.tsx and lib/constants.ts): Just Vibing gets Date
 * Vibe/Tonight instead of Tribe/Relationship; Rishta Ready gets
 * Tribe/Values/Future Vibe/Children instead of Relationship. Every demo
 * and generated user below only sets the fields that exist for its intent.
 *
 * Run with: npm run db:seed
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';
import {
  CIRCLES,
  INTERESTS,
  PROMPTS,
  CITIES,
  TRIBES,
  RELATIONSHIP_STYLES,
  DATE_VIBES,
  TONIGHT_OPTIONS,
  VALUES_OPTIONS,
  LIVING_PREFERENCES,
  FUTURE_VIBE_QUESTIONS,
  CHILDREN_OPTIONS,
} from '../lib/constants';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

type Gender = 'WOMAN' | 'MAN' | 'NON_BINARY' | 'OTHER';
type Intent = 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY';
type Verification = 'VERIFIED' | 'PENDING' | 'UNVERIFIED';

interface SeedUser {
  phone: string;
  displayName: string;
  dob: string;
  gender: Gender;
  lookingFor: Gender[];
  city: string;
  bio: string;
  intent: Intent;
  avatarHue: number;
  verification: Verification;
  circles: string[]; // slugs
  interests: string[]; // labels (the short "What are you into?" set)
  tribes: { slug: string; subCommunities: string[] }[]; // Something Real / Rishta Ready only
  relationshipStyles: string[]; // Something Real only, exactly 3
  dateVibeTags?: string[]; // Just Vibing only, exactly 3 (slugs)
  tonightTags?: string[]; // Just Vibing only, up to 2 (slugs)
  valuesTags?: string[]; // Rishta Ready only, exactly 4 (slugs)
  livingPreference?: string; // Rishta Ready only (slug)
  futureHome?: string; // Rishta Ready only (slug)
  futureFamily?: string;
  futureCareer?: string;
  futureMoney?: string;
  children?: string; // Rishta Ready only (slug)
  prompts: { text: string; answer: string }[];
  photos: string[]; // urls
}

// pravatar.cc serves a fixed set of 70 real face-crop photos by number --
// no API key, no rate limit that matters at this volume. Real duplicate
// faces across 500 seeded accounts are expected and fine; this is filler
// data for exercising the feed/matching code, not a photo library.
function pravatar(n: number): string {
  return `https://i.pravatar.cc/500?img=${((n - 1) % 70) + 1}`;
}

const DEMO_USERS: SeedUser[] = [
  {
    phone: '+919810000001',
    displayName: 'Aanya',
    dob: '2001-03-12',
    gender: 'WOMAN',
    lookingFor: ['MAN'],
    city: 'Pune',
    bio: 'Trying to find the best filter coffee in Koregaon Park.',
    intent: 'SOMETHING_REAL',
    avatarHue: 1,
    verification: 'VERIFIED',
    circles: ['mumbai-indie-music', 'pune-marathon-runners'],
    interests: ['Coffee', 'Nature', 'Music'],
    tribes: [
      { slug: 'coffee', subCommunities: ['Cafe hopping', 'Filter coffee purist'] },
      { slug: 'music', subCommunities: ['Indie', 'Bollywood'] },
    ],
    relationshipStyles: ['Deep conversations', 'Adventure partners', 'Calm & peaceful'],
    prompts: [
      { text: 'Communication: talk it out or take space first?', answer: 'Give me some space first' },
      { text: 'Relationship pace: feeling or building slowly?', answer: 'Build it slowly' },
    ],
    photos: [pravatar(47), pravatar(48), pravatar(23)],
  },
  {
    phone: '+919810000002',
    displayName: 'Rohan',
    dob: '1999-07-22',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    city: 'Bengaluru',
    bio: 'Building a startup by day, doing open mics badly by night.',
    intent: 'SOMETHING_REAL',
    avatarHue: 2,
    verification: 'VERIFIED',
    circles: ['bengaluru-startups', 'delhi-ncr-standup'],
    interests: ['Creativity', 'Geeky stuff', 'Concerts'],
    tribes: [
      { slug: 'tech', subCommunities: ['Startups & side hustles', 'AI/ML'] },
      { slug: 'concerts', subCommunities: ['Open mics', 'Indie gigs'] },
    ],
    relationshipStyles: ['Lots of laughs', 'Deep conversations', 'Career + relationship balance'],
    prompts: [
      { text: 'Love language: words or actions?', answer: 'Words & reassurance' },
      { text: 'Ideal evening: laugh until 2AM or quiet talk?', answer: 'Laugh until 2 AM' },
    ],
    photos: [pravatar(12), pravatar(13)],
  },
  {
    phone: '+919810000003',
    displayName: 'Kavya',
    dob: '2002-11-05',
    gender: 'WOMAN',
    lookingFor: ['MAN', 'WOMAN'],
    city: 'Delhi NCR',
    bio: 'Thrift flips and street food crawls. Ask me about Sarojini.',
    intent: 'JUST_VIBING',
    avatarHue: 3,
    verification: 'VERIFIED',
    circles: ['du-north-campus', 'diwali-foodies'],
    interests: ['Fashion', 'Foodie', 'Nightlife'],
    tribes: [],
    relationshipStyles: [],
    dateVibeTags: ['food-adventure', 'shopping-exploring', 'drinks-nightlife'],
    tonightTags: ['go-out', 'chemistry'],
    prompts: [
      { text: 'Social battery: more the merrier or small group?', answer: 'The more people, the better' },
      { text: 'Friday night: stay in or go out?', answer: "Let's go out" },
    ],
    photos: [pravatar(31), pravatar(32), pravatar(33), pravatar(34)],
  },
  {
    phone: '+919810000004',
    displayName: 'Meher',
    dob: '1997-01-30',
    gender: 'WOMAN',
    lookingFor: ['MAN'],
    city: 'Bengaluru',
    bio: 'Rishta-ready and unbothered about saying so out loud.',
    intent: 'RISHTA_READY',
    avatarHue: 4,
    verification: 'VERIFIED',
    circles: ['bengaluru-startups'],
    interests: ['Books', 'Dogs', 'Foodie'],
    tribes: [
      { slug: 'booktok', subCommunities: ['Romance', 'Literary'] },
      { slug: 'foodies', subCommunities: ['Fine dining', 'Home cooking'] },
    ],
    relationshipStyles: [],
    livingPreference: 'close-to-family',
    valuesTags: ['family', 'partnership', 'peace-stability', 'building-a-home'],
    futureHome: 'suburban',
    futureFamily: 'family_central',
    futureCareer: 'balance',
    futureMoney: 'save_build',
    children: 'want-children',
    prompts: [
      { text: 'Family size: big family or small & close-knit?', answer: 'Big family life' },
      { text: 'Home: build our own or stay close to family?', answer: 'Stay close to family' },
    ],
    photos: [pravatar(44)],
  },
  {
    phone: '+919810000005',
    displayName: 'Arjun',
    dob: '1996-09-14',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    city: 'Bengaluru',
    bio: 'Also rishta-ready. Also terrified of bio-data forms.',
    intent: 'RISHTA_READY',
    avatarHue: 5,
    verification: 'VERIFIED',
    circles: ['bengaluru-startups', 'ipl-fantasy-league'],
    interests: ['Geeky stuff', 'Nature', 'Gym'],
    tribes: [
      { slug: 'tech', subCommunities: ['Gadgets', 'AI/ML'] },
      { slug: 'run-club', subCommunities: ['Trail running', '5K casual'] },
    ],
    relationshipStyles: [],
    livingPreference: 'urban',
    valuesTags: ['career', 'financial-stability', 'personal-growth', 'partnership'],
    futureHome: 'city',
    futureFamily: 'couple_first',
    futureCareer: 'career_priority',
    futureMoney: 'save_build',
    children: 'open-unsure',
    prompts: [
      { text: 'Five years from now: settled or still chasing something new?', answer: 'Still chasing something new' },
      { text: 'Career: chase ambitions or protect our life together?', answer: 'Chase big ambitions' },
    ],
    photos: [pravatar(5), pravatar(6)],
  },
];

// --- Bulk generator -------------------------------------------------------

const FEMALE_NAMES = [
  'Priya', 'Ananya', 'Isha', 'Sneha', 'Divya', 'Neha', 'Riya', 'Pooja', 'Shreya', 'Tanya',
  'Nisha', 'Kritika', 'Anjali', 'Simran', 'Ritika', 'Aditi', 'Sanya', 'Ishita', 'Vidya', 'Aisha',
  'Kiara', 'Myra', 'Zara', 'Naina', 'Pallavi', 'Rhea', 'Sana', 'Tara', 'Trisha', 'Yamini',
  'Bhavya', 'Charvi', 'Diya', 'Esha', 'Gauri', 'Ira', 'Jiya', 'Khushi', 'Lavanya', 'Meera',
];
const MALE_NAMES = [
  'Aditya', 'Karan', 'Vikram', 'Rahul', 'Aryan', 'Siddharth', 'Nikhil', 'Varun', 'Kabir', 'Yash',
  'Dev', 'Ishaan', 'Krish', 'Manav', 'Om', 'Pranav', 'Raghav', 'Sahil', 'Tarun', 'Uday',
  'Vivaan', 'Zain', 'Ayaan', 'Dhruv', 'Farhan', 'Gaurav', 'Harsh', 'Ivan', 'Jatin', 'Kunal',
  'Lakshya', 'Mihir', 'Naman', 'Omkar', 'Parth', 'Rohit', 'Shaurya', 'Tejas', 'Utkarsh', 'Vihaan',
];
const UNISEX_NAMES = ['Aman', 'Avi', 'Deepa', 'Jai', 'Kiran', 'Robin', 'Sam', 'Shubham'];

const BIO_TEMPLATES = [
  (city: string, interest: string) => `${city} based. Currently obsessed with ${interest.toLowerCase()}.`,
  (city: string, interest: string) => `${interest} enthusiast, ${city} local, bad at bios.`,
  (city: string, interest: string) => `Here for ${interest.toLowerCase()} recommendations and good conversation.`,
  (city: string, interest: string) => `${city} born and raised. Ask me about ${interest.toLowerCase()}.`,
  (city: string, interest: string) => `Probably talking about ${interest.toLowerCase()} right now.`,
  () => `New here, figuring out the vybe.`,
  () => `Send help, my group chat has 400 unread messages.`,
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}
function pickMany<T>(arr: T[], count: number, rng: () => number): T[] {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}
function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Small seeded PRNG (mulberry32) so a reseed produces the same 500 profiles
// rather than a new random set each time -- makes `npm run db:seed` runs
// reproducible and diffable.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDateForAge(age: number, rng: () => number): string {
  const now = new Date();
  const year = now.getFullYear() - age;
  const month = randomInt(0, 11, rng);
  const day = randomInt(1, 28, rng);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function generateBulkUsers(count: number, phoneStart: number): SeedUser[] {
  const rng = mulberry32(20260917);
  const users: SeedUser[] = [];

  for (let i = 0; i < count; i++) {
    const genderRoll = rng();
    const gender: Gender = genderRoll < 0.47 ? 'WOMAN' : genderRoll < 0.94 ? 'MAN' : rng() < 0.5 ? 'NON_BINARY' : 'OTHER';
    const name =
      gender === 'WOMAN'
        ? pick(FEMALE_NAMES, rng)
        : gender === 'MAN'
          ? pick(MALE_NAMES, rng)
          : pick(UNISEX_NAMES, rng);

    // Mostly straight-shaped preferences with some variety, matching the
    // hand-written demo users' pattern rather than modeling every real
    // orientation combination here.
    let lookingFor: Gender[];
    const orientationRoll = rng();
    if (gender === 'WOMAN') lookingFor = orientationRoll < 0.85 ? ['MAN'] : orientationRoll < 0.95 ? ['WOMAN'] : ['MAN', 'WOMAN'];
    else if (gender === 'MAN') lookingFor = orientationRoll < 0.85 ? ['WOMAN'] : orientationRoll < 0.95 ? ['MAN'] : ['MAN', 'WOMAN'];
    else lookingFor = pickMany(['MAN', 'WOMAN', 'NON_BINARY', 'OTHER'], randomInt(1, 2, rng), rng);

    const city = pick(CITIES, rng);
    const age = randomInt(18, 34, rng);
    const intentRoll = rng();
    const intent: Intent = intentRoll < 0.4 ? 'SOMETHING_REAL' : intentRoll < 0.72 ? 'JUST_VIBING' : 'RISHTA_READY';

    // Interests are intent-scoped (see lib/constants.ts) -- an empty
    // `intents` tag means "shown for every intent."
    const availableInterests = INTERESTS.filter((x) => x.intents.length === 0 || x.intents.includes(intent));
    const interests = pickMany(availableInterests, randomInt(5, 8, rng), rng).map((x) => x.label);
    const primaryInterest = interests[0] ?? 'good vibes';
    const bio = pick(BIO_TEMPLATES, rng)(city, primaryInterest);

    const cityCircles = CIRCLES.filter((c) => c.city === null || c.city === city);
    const circles = pickMany(cityCircles, randomInt(0, Math.min(3, cityCircles.length), rng), rng).map((c) => c.slug);

    // Everything past this point branches hard by intent -- see
    // app/onboarding/page.tsx's per-intent step lists. Just Vibing never
    // sees Tribe/Relationship; Rishta Ready sees Tribe but swaps
    // Relationship for Values/Future Vibe/Children.
    let tribes: { slug: string; subCommunities: string[] }[] = [];
    let relationshipStyles: string[] = [];
    let dateVibeTags: string[] | undefined;
    let tonightTags: string[] | undefined;
    let valuesTags: string[] | undefined;
    let livingPreference: string | undefined;
    let futureHome: string | undefined;
    let futureFamily: string | undefined;
    let futureCareer: string | undefined;
    let futureMoney: string | undefined;
    let children: string | undefined;

    if (intent === 'JUST_VIBING') {
      dateVibeTags = pickMany(DATE_VIBES, 3, rng).map((d) => d.slug);
      tonightTags = pickMany(TONIGHT_OPTIONS, randomInt(0, 2, rng), rng).map((t) => t.slug);
    } else {
      // Tribe: 1-5 tribes (1-4 for Rishta Ready), each with 1-3
      // subCommunities -- mirrors the onboarding "What's your tribe?"
      // step's own cardinality, filtered to tribes tagged for this intent.
      const availableTribes = TRIBES.filter((t) => t.intents.length === 0 || t.intents.includes(intent));
      const tribeMax = intent === 'RISHTA_READY' ? 4 : 5;
      const chosenTribes = pickMany(availableTribes, randomInt(1, tribeMax, rng), rng);
      tribes = chosenTribes.map((t) => ({
        slug: t.slug,
        subCommunities: pickMany(t.subCommunities, randomInt(1, Math.min(3, t.subCommunities.length), rng), rng),
      }));

      if (intent === 'SOMETHING_REAL') {
        // "My ideal relationship is..." -- exactly 3, matching the
        // onboarding step.
        relationshipStyles = pickMany(RELATIONSHIP_STYLES, 3, rng).map((r) => r.label);
      } else {
        // Rishta Ready: Values (exactly 4), Future Vibe (4 binary picks),
        // Children (3-way), and the Basics step's living-preference
        // question -- matching the onboarding step cardinalities.
        valuesTags = pickMany(VALUES_OPTIONS, 4, rng).map((v) => v.slug);
        livingPreference = pick(LIVING_PREFERENCES, rng).slug;
        for (const q of FUTURE_VIBE_QUESTIONS) {
          const answer = rng() < 0.5 ? q.optionA.slug : q.optionB.slug;
          if (q.key === 'home') futureHome = answer;
          else if (q.key === 'family') futureFamily = answer;
          else if (q.key === 'career') futureCareer = answer;
          else futureMoney = answer;
        }
        children = pick(CHILDREN_OPTIONS, rng).slug;
      }
    }

    // Vybe Check is a forced binary pick -- every seeded answer is one of
    // the prompt's own two fixed options, matching the real onboarding UI.
    // Prompts are intent-scoped; Rishta Ready allows 2-3, everyone else 2.
    const availablePrompts = PROMPTS.filter((p) => p.intents.length === 0 || p.intents.includes(intent));
    const promptCount = intent === 'RISHTA_READY' ? randomInt(2, 3, rng) : 2;
    const chosenPrompts = pickMany(availablePrompts, promptCount, rng);
    const prompts = chosenPrompts.map((p) => ({
      text: p.text,
      answer: pick([p.optionA, p.optionB], rng),
    }));

    const photoCount = randomInt(1, 5, rng);
    const photos = Array.from({ length: photoCount }, () => pravatar(randomInt(1, 70, rng)));

    const verificationRoll = rng();
    const verification: Verification = verificationRoll < 0.65 ? 'VERIFIED' : verificationRoll < 0.85 ? 'PENDING' : 'UNVERIFIED';

    users.push({
      phone: `+91${phoneStart + i}`,
      displayName: name,
      dob: isoDateForAge(age, rng),
      gender,
      lookingFor,
      city,
      bio,
      intent,
      avatarHue: randomInt(1, 6, rng),
      verification,
      circles,
      interests,
      tribes,
      relationshipStyles,
      dateVibeTags,
      tonightTags,
      valuesTags,
      livingPreference,
      futureHome,
      futureFamily,
      futureCareer,
      futureMoney,
      children,
      prompts,
      photos,
    });
  }

  return users;
}

async function main() {
  console.log('Seeding circles, interests, prompts...');
  for (const c of CIRCLES) {
    await db.circle.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  for (const i of INTERESTS) {
    // Unlike the circle/prompt upserts, this one does update existing rows --
    // interests get their emoji/tagline/intents tweaked more often, and
    // there's no "don't overwrite something a real session changed"
    // concern here the way there is for user photos.
    await db.interest.upsert({
      where: { label: i.label },
      update: { emoji: i.emoji, tagline: i.tagline, intents: i.intents },
      create: i,
    });
  }
  // Retire interests that are no longer in the current list (e.g. a past
  // redesign of the interest set) so onboarding's pick-list doesn't show
  // stale options nobody can pick anymore. Cascades to each profile's
  // interest connections -- those profiles just lose that one tag, nothing
  // else about them changes.
  const currentLabels = INTERESTS.map((i) => i.label);
  await db.interest.deleteMany({ where: { label: { notIn: currentLabels } } });

  for (const p of PROMPTS) {
    // Real update (not {}) so tweaking a prompt's emoji/options/intents
    // propagates on reseed -- same pattern as the interest upsert above.
    await db.prompt.upsert({
      where: { text: p.text },
      update: { emoji: p.emoji, optionA: p.optionA, optionB: p.optionB, intents: p.intents },
      create: p,
    });
  }
  // Retire prompts no longer in the current list (e.g. the intent-specific
  // Vybe Check redesign) so onboarding never offers a stale prompt.
  // Cascades to each profile's PromptAnswer rows for it.
  const currentPromptTexts = PROMPTS.map((p) => p.text);
  await db.prompt.deleteMany({ where: { text: { notIn: currentPromptTexts } } });

  console.log('Seeding tribes, sub-communities, relationship styles...');
  for (const t of TRIBES) {
    const tribeRow = await db.tribe.upsert({
      where: { slug: t.slug },
      update: {
        label: t.label,
        emoji: t.emoji,
        personaLabel: t.personaLabel,
        activityPhrase: t.activityPhrase,
        sharedPhrase: t.sharedPhrase,
        intents: t.intents,
      },
      create: {
        slug: t.slug,
        label: t.label,
        emoji: t.emoji,
        personaLabel: t.personaLabel,
        activityPhrase: t.activityPhrase,
        sharedPhrase: t.sharedPhrase,
        intents: t.intents,
      },
    });
    for (const label of t.subCommunities) {
      await db.subCommunity.upsert({
        where: { tribeId_label: { tribeId: tribeRow.id, label } },
        update: {},
        create: { tribeId: tribeRow.id, label },
      });
    }
  }
  for (const r of RELATIONSHIP_STYLES) {
    await db.relationshipStyle.upsert({
      where: { label: r.label },
      update: { emoji: r.emoji, pairPhrase: r.pairPhrase },
      create: r,
    });
  }

  // Fetched once and looked up in memory from here on -- doing this per-user
  // was fine for 5 demo users, not for hundreds.
  const [allInterests, allCircles, allPrompts, allTribes, allSubCommunities, allRelationshipStyles] = await Promise.all([
    db.interest.findMany(),
    db.circle.findMany(),
    db.prompt.findMany(),
    db.tribe.findMany(),
    db.subCommunity.findMany(),
    db.relationshipStyle.findMany(),
  ]);
  const interestByLabel = new Map(allInterests.map((i) => [i.label, i.id]));
  const circleBySlug = new Map(allCircles.map((c) => [c.slug, c.id]));
  const promptByText = new Map(allPrompts.map((p) => [p.text, p.id]));
  const tribeBySlug = new Map(allTribes.map((t) => [t.slug, t.id]));
  // Sub-communities aren't globally unique by label (e.g. "Rock" could
  // exist under two different tribes in theory), so key by tribeId+label.
  const subCommunityByKey = new Map(allSubCommunities.map((s) => [`${s.tribeId}::${s.label}`, s.id]));
  const relationshipStyleByLabel = new Map(allRelationshipStyles.map((r) => [r.label, r.id]));

  const bulkUsers = generateBulkUsers(500, 9820000000);
  const allUsers: SeedUser[] = [...DEMO_USERS, ...bulkUsers];

  console.log(`Seeding ${allUsers.length} demo users (${DEMO_USERS.length} hand-written + ${bulkUsers.length} generated)...`);
  let done = 0;
  for (const u of allUsers) {
    const user = await db.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: { phone: u.phone, phoneVerified: true },
    });

    const interestIds = u.interests.map((label) => interestByLabel.get(label)).filter((id): id is string => Boolean(id));
    const circleIds = u.circles.map((slug) => circleBySlug.get(slug)).filter((id): id is string => Boolean(id));
    const promptRows = u.prompts
      .map((p) => ({ promptId: promptByText.get(p.text), answer: p.answer }))
      .filter((p): p is { promptId: string; answer: string } => Boolean(p.promptId));
    const tribeIds = u.tribes.map((t) => tribeBySlug.get(t.slug)).filter((id): id is string => Boolean(id));
    const subCommunityIds = u.tribes.flatMap((t) => {
      const tribeId = tribeBySlug.get(t.slug);
      if (!tribeId) return [];
      return t.subCommunities
        .map((label) => subCommunityByKey.get(`${tribeId}::${label}`))
        .filter((id): id is string => Boolean(id));
    });
    const relationshipStyleIds = u.relationshipStyles
      .map((label) => relationshipStyleByLabel.get(label))
      .filter((id): id is string => Boolean(id));

    const profile = await db.profile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        displayName: u.displayName,
        dateOfBirth: new Date(u.dob),
        gender: u.gender,
        lookingFor: u.lookingFor,
        city: u.city,
        bio: u.bio,
        intent: u.intent,
        avatarSeed: u.displayName.charAt(0),
        avatarHue: u.avatarHue,
        verification: u.verification,
        interests: { connect: interestIds.map((id) => ({ id })) },
        tribes: { connect: tribeIds.map((id) => ({ id })) },
        subCommunities: { connect: subCommunityIds.map((id) => ({ id })) },
        relationshipStyles: { connect: relationshipStyleIds.map((id) => ({ id })) },
        circles: { create: circleIds.map((circleId) => ({ circleId })) },
        answers: { create: promptRows.map((p) => ({ promptId: p.promptId, answer: p.answer })) },
        photos: { create: u.photos.map((url, i) => ({ url, position: i })) },
        dateVibeTags: u.dateVibeTags ?? [],
        tonightTags: u.tonightTags ?? [],
        valuesTags: u.valuesTags ?? [],
        livingPreference: u.livingPreference ?? null,
        futureHome: u.futureHome ?? null,
        futureFamily: u.futureFamily ?? null,
        futureCareer: u.futureCareer ?? null,
        futureMoney: u.futureMoney ?? null,
        children: u.children ?? null,
      },
    });

    // profile.upsert only sets photos on CREATE (see above) -- a profile
    // that already existed before the photo feature shipped (e.g. the 5
    // hand-written demo users, seeded in an earlier run) hits the no-op
    // update branch and would otherwise stay photo-less forever. Backfill
    // it here, but only when it truly has none yet, so a re-seed never
    // wipes photos a real session uploaded onto a demo account.
    const existingPhotoCount = await db.photo.count({ where: { profileId: profile.id } });
    if (existingPhotoCount === 0 && u.photos.length > 0) {
      await db.photo.createMany({
        data: u.photos.map((url, i) => ({ profileId: profile.id, url, position: i })),
      });
    }

    // tribes/subCommunities/relationshipStyles are many-to-many relations,
    // so `connect` (not `set`) is safe to run every time, on both the
    // create and update paths -- it only adds, it never removes. That means
    // a profile that existed before this feature shipped still gets the
    // seed data attached on the next re-seed, the same fix as the photo
    // backfill above, without needing an existence check first.
    await db.profile.update({
      where: { id: profile.id },
      data: {
        tribes: { connect: tribeIds.map((id) => ({ id })) },
        subCommunities: { connect: subCommunityIds.map((id) => ({ id })) },
        relationshipStyles: { connect: relationshipStyleIds.map((id) => ({ id })) },
      },
    });

    // Every demo account also accepts OTP 123456 for local testing.
    await db.otpCode.create({
      data: {
        userId: user.id,
        codeHash: hashOtp('123456'),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    done += 1;
    if (done % 50 === 0) console.log(`  ...${done}/${allUsers.length}`);
  }

  console.log(`Done. ${allUsers.length} demo users seeded -- log in with any of their numbers and OTP 123456.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
