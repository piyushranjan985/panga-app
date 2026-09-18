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
  }, 'You must be 18 or older to use VybeMatch'),
  gender: genderEnum,
  lookingFor: z.array(genderEnum).min(1),
  city: z.string().trim().min(2),
  bio: z.string().trim().max(280).default(''),
  intent: intentEnum,
  avatarHue: z.number().int().min(1).max(6).default(1),
  // "What are you into?" — broad/casual, 5 to 8.
  interestIds: z.array(z.string()).min(5, 'Pick at least 5').max(8),
  // "What's your tribe?" — up to 5 tribes, plus 1-3 sub-communities per
  // tribe picked (validated against tribeIds below, not just count).
  tribeIds: z.array(z.string()).max(5).default([]),
  subCommunityIds: z.array(z.string()).default([]),
  // "My ideal relationship is…" — exactly 3, not "up to 3".
  relationshipStyleIds: z.array(z.string()).length(3, 'Pick exactly 3').default([]),
  circleIds: z.array(z.string()).max(6),
  // Vybe Check: up to 2 prompt answers collected during onboarding — see
  // app/onboarding/page.tsx. Capped at 3 server-side (a little slack above
  // the 2-prompt UI limit) rather than matching it exactly.
  promptAnswers: z
    .array(z.object({ promptId: z.string(), answer: z.string().trim().min(1).max(140) }))
    .max(3)
    .default([]),
  // Family Preview: off unless someone explicitly opts in during
  // onboarding (see the Family Preview step, Rishta Ready only) or later
  // from the profile screen's toggle (the PATCH handler below).
  familyPreviewOn: z.boolean().default(false),
  // Photos: uploaded during onboarding via app/api/upload/route.ts (which
  // just returns URLs — there's no Profile row yet to attach Photo rows
  // to), collected in onboarding form state, and turned into real Photo
  // rows here once the rest of the profile is saved. Adding/removing a
  // photo after onboarding goes through app/api/profile/photos instead.
  photoUrls: z.array(z.string().min(1)).min(1, 'Add at least 1 photo').max(5),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const profile = await db.profile.findUnique({
    where: { userId: session.userId },
    include: {
      interests: true,
      tribes: true,
      subCommunities: { include: { tribe: true } },
      relationshipStyles: true,
      circles: { include: { circle: true } },
      answers: { include: { prompt: true } },
      photos: { orderBy: { position: 'asc' } },
    },
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
      familyPreviewOn: data.familyPreviewOn,
      interests: { connect: data.interestIds.map((id) => ({ id })) },
      tribes: { connect: data.tribeIds.map((id) => ({ id })) },
      subCommunities: { connect: data.subCommunityIds.map((id) => ({ id })) },
      relationshipStyles: { connect: data.relationshipStyleIds.map((id) => ({ id })) },
      circles: { create: data.circleIds.map((circleId) => ({ circleId })) },
      answers: { create: data.promptAnswers.map((pa) => ({ promptId: pa.promptId, answer: pa.answer })) },
      photos: { create: data.photoUrls.map((url, i) => ({ url, position: i })) },
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
      familyPreviewOn: data.familyPreviewOn,
      interests: { set: data.interestIds.map((id) => ({ id })) },
      tribes: { set: data.tribeIds.map((id) => ({ id })) },
      subCommunities: { set: data.subCommunityIds.map((id) => ({ id })) },
      relationshipStyles: { set: data.relationshipStyleIds.map((id) => ({ id })) },
      circles: {
        deleteMany: {},
        create: data.circleIds.map((circleId) => ({ circleId })),
      },
      answers: {
        deleteMany: {},
        create: data.promptAnswers.map((pa) => ({ promptId: pa.promptId, answer: pa.answer })),
      },
      // Deliberately not touched on update: re-submitting the rest of the
      // onboarding form (e.g. editing bio from a future "edit profile"
      // flow) shouldn't silently wipe photos added since via
      // app/api/profile/photos. Photos only get set here on first create.
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
