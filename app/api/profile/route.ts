import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const genderEnum = z.enum(['WOMAN', 'MAN', 'NON_BINARY', 'OTHER']);
const intentEnum = z.enum(['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY']);

const upsertSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  dateOfBirth: z.string().refine((v) => {
    const age = (Date.now() - new Date(v).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= 18 && age <= 100;
  }, 'You must be 18 or older to use Panga'),
  gender: genderEnum,
  lookingFor: z.array(genderEnum).min(1),
  city: z.string().trim().min(2),
  bio: z.string().trim().max(280).default(''),
  intent: intentEnum,
  avatarHue: z.number().int().min(1).max(6).default(1),
  interestIds: z.array(z.string()).max(8),
  circleIds: z.array(z.string()).max(6),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const profile = await db.profile.findUnique({
    where: { userId: session.userId },
    include: { interests: true, circles: { include: { circle: true } }, answers: { include: { prompt: true } } },
  });

  return NextResponse.json({ profile });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile data' }, { status: 400 });
  }
  const data = parsed.data;
  const avatarSeed = data.displayName.trim().charAt(0).toUpperCase() || 'P';

  const profile = await db.profile.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      displayName: data.displayName,
      dateOfBirth: new Date(data.dateOfBirth),
      gender: data.gender,
      lookingFor: data.lookingFor,
      city: data.city,
      bio: data.bio,
      intent: data.intent,
      avatarHue: data.avatarHue,
      avatarSeed,
      interests: { connect: data.interestIds.map((id) => ({ id })) },
      circles: { create: data.circleIds.map((circleId) => ({ circleId })) },
    },
    update: {
      displayName: data.displayName,
      dateOfBirth: new Date(data.dateOfBirth),
      gender: data.gender,
      lookingFor: data.lookingFor,
      city: data.city,
      bio: data.bio,
      intent: data.intent,
      avatarHue: data.avatarHue,
      avatarSeed,
      interests: { set: data.interestIds.map((id) => ({ id })) },
      circles: {
        deleteMany: {},
        create: data.circleIds.map((circleId) => ({ circleId })),
      },
    },
  });

  return NextResponse.json({ ok: true, profile });
}

const patchSchema = z.object({
  intent: intentEnum.optional(),
  quietMode: z.boolean().optional(),
  familyPreviewOn: z.boolean().optional(),
});

// Lightweight partial update for the toggles surfaced directly on the
// profile screen (intent, quiet mode, family preview) without resubmitting
// the whole onboarding payload.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid update' }, { status: 400 });

  const profile = await db.profile.update({
    where: { userId: session.userId },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true, profile });
}
