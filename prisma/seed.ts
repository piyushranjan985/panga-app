/**
 * Seeds reference data (circles, interests, prompts) plus demo users so
 * /discover has something real to show right after setup.
 *
 * Two kinds of demo users:
 *  - DEMO_USERS: 5 hand-written, specific profiles (used in walkthroughs,
 *    screenshots, etc. — keep these recognizable).
 *  - generateBulkUsers(500): programmatically generated profiles for
 *    load-testing the discover/matching feed at a realistic population
 *    size. Randomized from fixed pools below, not meant to be individually
 *    memorable the way the 5 hand-written ones are.
 *
 * Every seeded user (both kinds) gets 1-5 photos — pravatar.cc URLs, not
 * Vercel Blob, since these aren't real uploads and don't need real storage;
 * Photo.url doesn't care which kind of URL it holds.
 *
 * Run with: npm run db:seed
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';
import { CIRCLES, INTERESTS, PROMPTS, CITIES } from '../lib/constants';

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
  interests: string[]; // labels
  prompts: { text: string; answer: string }[];
  photos: string[]; // urls
}

// pravatar.cc serves a fixed set of 70 real face-crop photos by number —
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
    interests: ['Indie Hindi playlists', 'Trekking', 'Filter coffee'],
    prompts: [
      { text: 'Chai tapri or filter coffee?', answer: 'Filter coffee, no debate' },
      { text: 'Sunday plan: trek or Netflix?', answer: 'Trek, then Netflix as a reward' },
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
    interests: ['Stand-up comedy', 'Startups & side hustles', 'Cricket'],
    prompts: [
      { text: 'Most controversial food opinion', answer: 'Pineapple absolutely belongs on pizza' },
      { text: 'My love language is...', answer: 'Sending memes at 1am' },
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
    interests: ['Thrifting', 'Street food crawling', 'K-dramas'],
    prompts: [{ text: 'A memory that shaped me', answer: 'My first solo trip to Rishikesh at 19' }],
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
    interests: ['Reading fiction', 'Dogs & strays', 'Festival food'],
    prompts: [{ text: 'Family group chat energy?', answer: 'Loud, loving, mildly chaotic' }],
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
    interests: ['Cricket', 'Fantasy cricket', 'Bike rides'],
    prompts: [
      { text: 'Where I actually want to be five years from now', answer: 'Running my own studio, still terrible at cricket' },
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

const PROMPT_ANSWER_BANK: Record<string, string[]> = {
  'Chai tapri or filter coffee?': ['Chai tapri, obviously', 'Filter coffee, no contest', 'Depends on my mood, honestly'],
  'Sunday plan: trek or Netflix?': ['Netflix, let’s be real', 'Trek if I can wake up early enough', 'Both — trek then Netflix'],
  'Family group chat energy?': ['Loud and full of forwards', 'Surprisingly chill', 'Mostly memes and festival wishes'],
  'A memory that shaped me': ['Moving cities alone at 19', 'My first solo trip', 'A really long train journey'],
  'Most controversial food opinion': ['Pineapple belongs on pizza', 'Maggi is overrated', 'Filter coffee > everything'],
  'My love language is...': ['Sending memes', 'Feeding people', 'Remembering the small things'],
  'The last thing that made me laugh out loud': ['A typo in a work email', 'My dog attacking a cucumber', 'A very specific meme'],
  'Where I actually want to be five years from now': ['Running my own thing', 'Somewhere by the coast', 'Honestly, still figuring it out'],
};

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
// rather than a new random set each time — makes `npm run db:seed` runs
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

    const interests = pickMany(INTERESTS, randomInt(3, 6, rng), rng).map((x) => x.label);
    const primaryInterest = interests[0] ?? 'good vibes';
    const bio = pick(BIO_TEMPLATES, rng)(city, primaryInterest);

    const cityCircles = CIRCLES.filter((c) => c.city === null || c.city === city);
    const circles = pickMany(cityCircles, randomInt(0, Math.min(3, cityCircles.length), rng), rng).map((c) => c.slug);

    const promptCount = randomInt(1, 2, rng);
    const chosenPrompts = pickMany(PROMPTS, promptCount, rng);
    const prompts = chosenPrompts.map((p) => ({
      text: p.text,
      answer: pick(PROMPT_ANSWER_BANK[p.text] ?? ['Ask me in person'], rng),
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
    await db.interest.upsert({ where: { label: i.label }, update: {}, create: i });
  }
  for (const p of PROMPTS) {
    await db.prompt.upsert({ where: { text: p.text }, update: {}, create: p });
  }

  // Fetched once and looked up in memory from here on — doing this per-user
  // was fine for 5 demo users, not for hundreds.
  const [allInterests, allCircles, allPrompts] = await Promise.all([
    db.interest.findMany(),
    db.circle.findMany(),
    db.prompt.findMany(),
  ]);
  const interestByLabel = new Map(allInterests.map((i) => [i.label, i.id]));
  const circleBySlug = new Map(allCircles.map((c) => [c.slug, c.id]));
  const promptByText = new Map(allPrompts.map((p) => [p.text, p.id]));

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
        circles: { create: circleIds.map((circleId) => ({ circleId })) },
        answers: { create: promptRows.map((p) => ({ promptId: p.promptId, answer: p.answer })) },
        photos: { create: u.photos.map((url, i) => ({ url, position: i })) },
      },
    });

    // profile.upsert only sets photos on CREATE (see above) — a profile
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

  console.log(`Done. ${allUsers.length} demo users seeded — log in with any of their numbers and OTP 123456.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
