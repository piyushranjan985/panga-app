/**
 * Seeds reference data (circles, interests, prompts) plus a handful of demo
 * users so `/discover` has something to show right after `docker compose up`.
 * Run with: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { CIRCLES, INTERESTS, PROMPTS } from '../lib/constants';

const db = new PrismaClient();

function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

const DEMO_USERS = [
  {
    phone: '+919810000001',
    displayName: 'Aanya',
    dob: '2001-03-12',
    gender: 'WOMAN' as const,
    lookingFor: ['MAN' as const],
    city: 'Pune',
    bio: 'Trying to find the best filter coffee in Koregaon Park.',
    intent: 'SOMETHING_REAL' as const,
    avatarHue: 1,
    circles: ['mumbai-indie-music', 'pune-marathon-runners'],
    interests: ['Indie Hindi playlists', 'Trekking', 'Filter coffee'],
    prompts: [
      { text: 'Chai tapri or filter coffee?', answer: 'Filter coffee, no debate' },
      { text: 'Sunday plan: trek or Netflix?', answer: 'Trek, then Netflix as a reward' },
    ],
  },
  {
    phone: '+919810000002',
    displayName: 'Rohan',
    dob: '1999-07-22',
    gender: 'MAN' as const,
    lookingFor: ['WOMAN' as const],
    city: 'Bengaluru',
    bio: 'Building a startup by day, doing open mics badly by night.',
    intent: 'SOMETHING_REAL' as const,
    avatarHue: 2,
    circles: ['bengaluru-startups', 'delhi-ncr-standup'],
    interests: ['Stand-up comedy', "Startups & side hustles", 'Cricket'],
    prompts: [
      { text: 'Most controversial food opinion', answer: 'Pineapple absolutely belongs on pizza' },
      { text: 'My love language is...', answer: 'Sending memes at 1am' },
    ],
  },
  {
    phone: '+919810000003',
    displayName: 'Kavya',
    dob: '2002-11-05',
    gender: 'WOMAN' as const,
    lookingFor: ['MAN' as const, 'WOMAN' as const],
    city: 'Delhi NCR',
    bio: 'Thrift flips and street food crawls. Ask me about Sarojini.',
    intent: 'JUST_VIBING' as const,
    avatarHue: 3,
    circles: ['du-north-campus', 'diwali-foodies'],
    interests: ['Thrifting', 'Street food crawling', 'K-dramas'],
    prompts: [{ text: 'A memory that shaped me', answer: 'My first solo trip to Rishikesh at 19' }],
  },
  {
    phone: '+919810000004',
    displayName: 'Meher',
    dob: '1997-01-30',
    gender: 'WOMAN' as const,
    lookingFor: ['MAN' as const],
    city: 'Bengaluru',
    bio: 'Rishta-ready and unbothered about saying so out loud.',
    intent: 'RISHTA_READY' as const,
    avatarHue: 4,
    circles: ['bengaluru-startups'],
    interests: ['Reading fiction', 'Dogs & strays', 'Festival food'],
    prompts: [{ text: 'Family group chat energy?', answer: 'Loud, loving, mildly chaotic' }],
  },
  {
    phone: '+919810000005',
    displayName: 'Arjun',
    dob: '1996-09-14',
    gender: 'MAN' as const,
    lookingFor: ['WOMAN' as const],
    city: 'Bengaluru',
    bio: 'Also rishta-ready. Also terrified of bio-data forms.',
    intent: 'RISHTA_READY' as const,
    avatarHue: 5,
    circles: ['bengaluru-startups', 'ipl-fantasy-league'],
    interests: ['Cricket', 'Fantasy cricket', 'Bike rides'],
    prompts: [{ text: 'Where I actually want to be five years from now', answer: 'Running my own studio, still terrible at cricket' }],
  },
];

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

  console.log('Seeding demo users...');
  for (const u of DEMO_USERS) {
    const user = await db.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: { phone: u.phone, phoneVerified: true },
    });

    const interestRows = await db.interest.findMany({ where: { label: { in: u.interests } } });
    const circleRows = await db.circle.findMany({ where: { slug: { in: u.circles } } });
    const promptRows = await db.prompt.findMany({ where: { text: { in: u.prompts.map((p) => p.text) } } });

    await db.profile.upsert({
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
        verification: 'VERIFIED',
        interests: { connect: interestRows.map((i) => ({ id: i.id })) },
        circles: { create: circleRows.map((c) => ({ circleId: c.id })) },
        answers: {
          create: u.prompts.map((p) => ({
            promptId: promptRows.find((row) => row.text === p.text)!.id,
            answer: p.answer,
          })),
        },
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
  }

  console.log(`Done. ${DEMO_USERS.length} demo users seeded — log in with any of their numbers and OTP 123456.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
