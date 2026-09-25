import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { DATE_VIBES, TONIGHT_OPTIONS, VALUES_OPTIONS, LIVING_PREFERENCES, FUTURE_VIBE_QUESTIONS, CHILDREN_OPTIONS } from '@/lib/constants';

// Intent-scoped pick-lists (see lib/constants.ts) validated as fixed
// slug enums -- these aren't DB-backed relations, just plain string
// fields on Profile, so this is the only place enforcing "must be one of
// the real options."
const dateVibeEnum = z.enum(DATE_VIBES.map((d) => d.slug) as [string, ...string[]]);
const tonightEnum = z.enum(TONIGHT_OPTIONS.map((t) => t.slug) as [string, ...string[]]);
const valuesEnum = z.enum(VALUES_OPTIONS.map((v) => v.slug) as [string, ...string[]]);
const livingPreferenceEnum = z.enum(LIVING_PREFERENCES.map((l) => l.slug) as [string, ...string[]]);
const childrenEnum = z.enum(CHILDREN_OPTIONS.map((c) => c.slug) as [string, ...string[]]);
function futureVibeEnum(key: 'home' | 'family' | 'career' | 'money') {
  const q = FUTURE_VIBE_QUESTIONS.find((question) => question.key === key);
  if (!q) throw new Error(`Missing FUTURE_VIBE_QUESTIONS entry for "${key}"`);
  return z.enum([q.optionA.slug, q.optionB.slug]);
}
const futureHomeEnum = futureVibeEnum('home');
const futureFamilyEnum = futureVibeEnum('family');
const futureCareerEnum = futureVibeEnum('career');
const futureMoneyEnum = futureVibeEnum('money');

const genderEnum = z.enum(['WOMAN', 'MAN', 'NON_BINARY', 'OTHER']);
const intentEnum = z.enum(['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY']);

const upsertSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  dateOfBirth: z.string().refine((v) => {
    const age = (Date.now() - new Date(v).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= 18 && age <= 100;
  }, 'You must be 18 or older to use findmyVybe'),
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
  // Length enforced conditionally in the superRefine below (exactly 3 for
  // Something Real only; empty for the other two intents, which don't
  // have this step).
  relationshipStyleIds: z.array(z.string()).max(3).default([]),
  // Vybe Check: 2-3 prompt answers collected during onboarding — see
  // app/onboarding/page.tsx (Rishta Ready allows 3, everyone else exactly
  // 2; enforced precisely in the superRefine below, this cap is just the
  // outer bound).
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

  // --- Just Vibing only ("What's your kind of date?" / "Tonight?") ---
  dateVibeTags: z.array(dateVibeEnum).max(3).default([]),
  tonightTags: z.array(tonightEnum).max(2).default([]),

  // --- Rishta Ready only (Basics' extra question, Values, Future Vibe, Children) ---
  livingPreference: livingPreferenceEnum.optional(),
  valuesTags: z.array(valuesEnum).max(4).default([]),
  futureHome: futureHomeEnum.optional(),
  futureFamily: futureFamilyEnum.optional(),
  futureCareer: futureCareerEnum.optional(),
  futureMoney: futureMoneyEnum.optional(),
  children: childrenEnum.optional(),
}).superRefine((data, ctx) => {
  // Every onboarding flow diverges hard by intent past the shared
  // Basics/Photos/Interests steps (see app/onboarding/page.tsx) — this
  // mirrors that branching server-side so a client can't skip a required
  // step just by omitting the field.
  if (data.intent === 'JUST_VIBING') {
    if (data.dateVibeTags.length !== 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick exactly 3 for "What\'s your kind of date?"', path: ['dateVibeTags'] });
    }
  } else {
    if (data.tribeIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick at least 1 tribe', path: ['tribeIds'] });
    }
    if (data.intent === 'SOMETHING_REAL') {
      if (data.relationshipStyleIds.length !== 3) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick exactly 3 relationship styles', path: ['relationshipStyleIds'] });
      }
    } else {
      // RISHTA_READY
      if (!data.livingPreference) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick where you see yourself living', path: ['livingPreference'] });
      }
      if (data.valuesTags.length !== 4) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick exactly 4 for "What matters most?"', path: ['valuesTags'] });
      }
      if (!data.futureHome || !data.futureFamily || !data.futureCareer || !data.futureMoney) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Answer all 4 future vibe questions', path: ['futureHome'] });
      }
      if (!data.children) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a children preference', path: ['children'] });
      }
    }
  }
  const vybeMax = data.intent === 'RISHTA_READY' ? 3 : 2;
  if (data.promptAnswers.length < 2 || data.promptAnswers.length > vybeMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: vybeMax === 3 ? 'Pick 2-3 Vybe Check prompts' : 'Pick 2 Vybe Check prompts',
      path: ['promptAnswers'],
    });
  }
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
      answers: { create: data.promptAnswers.map((pa) => ({ promptId: pa.promptId, answer: pa.answer })) },
      photos: { create: data.photoUrls.map((url, i) => ({ url, position: i })) },
      dateVibeTags: data.dateVibeTags,
      tonightTags: data.tonightTags,
      livingPreference: data.livingPreference ?? null,
      valuesTags: data.valuesTags,
      futureHome: data.futureHome ?? null,
      futureFamily: data.futureFamily ?? null,
      futureCareer: data.futureCareer ?? null,
      futureMoney: data.futureMoney ?? null,
      children: data.children ?? null,
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
      answers: {
        deleteMany: {},
        create: data.promptAnswers.map((pa) => ({ promptId: pa.promptId, answer: pa.answer })),
      },
      dateVibeTags: data.dateVibeTags,
      tonightTags: data.tonightTags,
      livingPreference: data.livingPreference ?? null,
      valuesTags: data.valuesTags,
      futureHome: data.futureHome ?? null,
      futureFamily: data.futureFamily ?? null,
      futureCareer: data.futureCareer ?? null,
      futureMoney: data.futureMoney ?? null,
      children: data.children ?? null,
      // Deliberately not touched on update: re-submitting the rest of the
      // onboarding form (e.g. editing bio from a future "edit profile"
      // flow) shouldn't silently wipe photos added since via
      // app/api/profile/photos. Photos only get set here on first create.
    },
  });

  return NextResponse.json({ ok: true, profile });
}

// Partial-update schema for everything editable straight from the profile
// screen (see app/profile/page.tsx's per-section "Edit" buttons) --
// simple toggles plus every relation/tag field upsertSchema above also
// accepts, all optional so a save only ever touches the one section it
// came from. Reuses the same enums as upsertSchema so a slug field can
// never drift out of sync between onboarding and profile-page editing.
const patchSchema = z.object({
  intent: intentEnum.optional(),
  quietMode: z.boolean().optional(),
  familyPreviewOn: z.boolean().optional(),
  bio: z.string().trim().max(280).optional(),
  interestIds: z.array(z.string()).max(8).optional(),
  tribeIds: z.array(z.string()).max(5).optional(),
  subCommunityIds: z.array(z.string()).optional(),
  relationshipStyleIds: z.array(z.string()).max(3).optional(),
  promptAnswers: z
    .array(z.object({ promptId: z.string(), answer: z.string().trim().min(1).max(140) }))
    .max(3)
    .optional(),
  dateVibeTags: z.array(dateVibeEnum).max(3).optional(),
  tonightTags: z.array(tonightEnum).max(2).optional(),
  livingPreference: livingPreferenceEnum.optional(),
  valuesTags: z.array(valuesEnum).max(4).optional(),
  futureHome: futureHomeEnum.optional(),
  futureFamily: futureFamilyEnum.optional(),
  futureCareer: futureCareerEnum.optional(),
  futureMoney: futureMoneyEnum.optional(),
  children: childrenEnum.optional(),
});

// Lightweight partial update for everything editable directly from the
// profile screen -- the simple toggles (intent, quiet mode, family
// preview) plus, since the "show the rest of the data + make it
// editable" profile-page rework, one section's worth of relation/tag
// fields at a time (e.g. just interestIds, or just promptAnswers).
// Doesn't resubmit the whole onboarding payload, and unlike PUT doesn't
// require every required-for-that-intent field to be present -- a
// section can be saved on its own once it's already been set once via
// onboarding. Returns the full profile (same include as GET) so the
// profile page can just re-sync its local state from the response.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid update' }, { status: 400 });
  }
  const { interestIds, tribeIds, subCommunityIds, relationshipStyleIds, promptAnswers, ...scalarUpdates } = parsed.data;

  const profile = await db.profile.update({
    where: { userId: session.userId },
    data: {
      ...scalarUpdates,
      ...(interestIds !== undefined ? { interests: { set: interestIds.map((id) => ({ id })) } } : {}),
      ...(tribeIds !== undefined ? { tribes: { set: tribeIds.map((id) => ({ id })) } } : {}),
      ...(subCommunityIds !== undefined ? { subCommunities: { set: subCommunityIds.map((id) => ({ id })) } } : {}),
      ...(relationshipStyleIds !== undefined
        ? { relationshipStyles: { set: relationshipStyleIds.map((id) => ({ id })) } }
        : {}),
      ...(promptAnswers !== undefined
        ? { answers: { deleteMany: {}, create: promptAnswers.map((pa) => ({ promptId: pa.promptId, answer: pa.answer })) } }
        : {}),
    },
    include: {
      interests: true,
      tribes: true,
      subCommunities: { include: { tribe: true } },
      relationshipStyles: true,
      answers: { include: { prompt: true } },
      photos: { orderBy: { position: 'asc' } },
    },
  });

  return NextResponse.json({ ok: true, profile });
}
