import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { enqueuePhotoModeration } from '@/lib/safety/moderationQueue';
import { isRealIdentityCheck } from '@/lib/safety/identityVerification';
import { DATE_VIBES, TONIGHT_OPTIONS, VALUES_OPTIONS, LIVING_PREFERENCES, FUTURE_VIBE_QUESTIONS, CHILDREN_OPTIONS } from '@/lib/constants';

// Onboarding photos used to be moderated here, synchronously, before this
// handler could even finish (see docs/IDENTITY_VERIFICATION_AND_SAFETY.md
// S11) -- that's gone now; photos are stored as PENDING and handed off to
// app/api/cron/moderate-photo to analyze asynchronously. maxDuration is
// no longer load-bearing for moderation, but left at a generous value for
// the rest of this handler's DB writes (profile + photos + interests/
// tribes/answers all in one upsert).
export const maxDuration = 30;


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
const mysteryCategoryEnum = z.enum(['MYSTERY_MATCH', 'VYBE_FLIP', 'NO_LABELS', 'OPTED_OUT']);

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
  // "What are you into?" — broad/casual, 3 to 5 (app-wide rule: no
  // onboarding selection step asks for a minimum above 3 or a maximum
  // above 5 -- see app/onboarding/page.tsx's matching interests step).
  interestIds: z.array(z.string()).min(3, 'Pick at least 3').max(5),
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

  const [profile, user, passkeys] = await Promise.all([
    db.profile.findUnique({
      where: { userId: session.userId },
      include: {
        interests: true,
        tribes: true,
        subCommunities: { include: { tribe: true } },
        relationshipStyles: true,
        answers: { include: { prompt: true } },
        photos: { orderBy: { position: 'asc' } },
      },
    }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { phone: true, phoneVerified: true, email: true, emailVerified: true, googleId: true },
    }),
    db.webAuthnCredential.findMany({
      where: { userId: session.userId },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Account & Security (see app/profile/page.tsx) -- deliberately exposing
  // presence, not the raw value, for the OAuth-linked field (a client
  // only needs "is Google linked?", never the provider's internal id
  // string). Apple Sign-In was removed 2026-10-05.
  const account = user
    ? {
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        email: user.email,
        emailVerified: user.emailVerified,
        googleLinked: !!user.googleId,
        passkeys,
      }
    : null;

  return NextResponse.json({ profile, account, verificationIsMock: !isRealIdentityCheck() });
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

  // Photos are only ever set in the `create` branch below (see the comment
  // by `photos:` in `update` -- editing the rest of the profile later must
  // never silently touch photos added since via app/api/profile/photos).
  // So this is the one place onboarding's collected photoUrls actually
  // become Photo rows. No moderation happens here any more -- every photo
  // is created as PENDING (the schema default) and handed off to the
  // async worker right after, same as app/api/profile/photos/route.ts.
  // This means onboarding can no longer be blocked by "all your photos
  // were rejected" (that gate required knowing the verdict synchronously,
  // which this redesign deliberately gives up -- see
  // docs/IDENTITY_VERIFICATION_AND_SAFETY.md S11). If every photo a new
  // user submitted ends up REJECTED, they find out via notification like
  // any other rejection and can add a new photo from the profile screen;
  // a profile with zero APPROVED photos simply shows no photo in
  // Discover until then, the same degraded-but-not-broken state an
  // admin removing all of someone's photos already produces today.
  const isNewProfile = !(await db.profile.findUnique({ where: { userId: session.userId }, select: { id: true } }));
  const newPhotos = data.photoUrls.map((url, position) => ({ url, position }));

  const profile = await db.profile.upsert({
    where: { userId: session.userId },
    include: { photos: true },
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
      photos: {
        create: newPhotos.map((p) => ({ url: p.url, position: p.position })),
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

  if (isNewProfile) {
    // No synchronous inline fallback here (unlike
    // app/api/profile/photos/route.ts) -- onboarding already stores every
    // photo as PENDING either way, so an unconfigured QStash just means
    // these rows wait rather than lengthening this request; see
    // lib/safety/moderationQueue.ts's doc comment on that trade-off.
    await Promise.all(
      profile.photos
        .filter((photo) => newPhotos.some((p) => p.url === photo.url))
        .map((photo) => enqueuePhotoModeration(photo.id)),
    );
  }

  return NextResponse.json({
    ok: true,
    profile,
    notice: isNewProfile
      ? "We're verifying your photos now -- you'll get a notification as each one is approved, usually within a few minutes."
      : null,
  });
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
  // Mystery Match -- see docs/MYSTERY_MATCH.md. mysteryNoLabelsAck lets
  // the client confirm the one-time No-Labels explainer in the SAME
  // request that selects it, rather than a separate round trip -- true
  // is the only value ever sent (the PATCH handler below turns it into
  // mysteryNoLabelsAckAt, and never un-sets it once set).
  mysteryCategory: mysteryCategoryEnum.optional(),
  mysteryNoLabelsAck: z.literal(true).optional(),
  // Push-notification category toggles -- see docs/PUSH_NOTIFICATIONS.md §5.
  notifyMatchesMessages: z.boolean().optional(),
  notifyVybeVouch: z.boolean().optional(),
  notifyReminders: z.boolean().optional(),
  bio: z.string().trim().max(280).optional(),
  interestIds: z.array(z.string()).max(5).optional(),
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
  const { interestIds, tribeIds, subCommunityIds, relationshipStyleIds, promptAnswers, mysteryCategory, mysteryNoLabelsAck, ...scalarUpdates } =
    parsed.data;

  // mysteryCategorySetAt only bumps when the category actually changes --
  // re-saving the same value (e.g. a client re-sending state) must never
  // reset the 7-day auto-rotation clock (see app/api/cron/mystery-match
  // and docs/MYSTERY_MATCH.md). Needs the current value first, so this is
  // a separate query rather than folding into the update's data object.
  let mysteryUpdate: { mysteryCategory?: typeof mysteryCategory; mysteryCategorySetAt?: Date; mysteryNoLabelsAckAt?: Date } = {};
  if (mysteryCategory !== undefined) {
    const current = await db.profile.findUnique({ where: { userId: session.userId }, select: { mysteryCategory: true } });
    if (current && current.mysteryCategory !== mysteryCategory) {
      mysteryUpdate = { mysteryCategory, mysteryCategorySetAt: new Date() };
    }
  }
  if (mysteryNoLabelsAck) {
    mysteryUpdate.mysteryNoLabelsAckAt = new Date();
  }

  const profile = await db.profile.update({
    where: { userId: session.userId },
    data: {
      ...scalarUpdates,
      ...mysteryUpdate,
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
