import { db } from '@/lib/db';

// Compiles everything VybeMatch holds about one Data Principal into a
// single JSON-serializable object -- the substance of a DPDP ACCESS /
// PORTABILITY response. Deliberately a plain function (not a stored file)
// -- see app/api/privacy/requests/[requestId]/export/route.ts, which
// streams this directly rather than writing to blob storage and handing
// back a signed URL, since that infrastructure doesn't exist yet. Every
// call site must audit-log the export itself (this function doesn't).
export async function compileUserDataExport(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: {
        include: {
          interests: { select: { label: true } },
          tribes: { select: { label: true } },
          subCommunities: { select: { label: true } },
          relationshipStyles: { select: { label: true } },
          answers: { include: { prompt: { select: { text: true } } } },
          photos: { where: { removedAt: null }, select: { url: true, position: true, createdAt: true } },
        },
      },
      swipesSent: { select: { toUserId: true, action: true, createdAt: true } },
      matchesAsUserA: { select: { id: true, userBId: true, createdAt: true, unmatchedAt: true } },
      matchesAsUserB: { select: { id: true, userAId: true, createdAt: true, unmatchedAt: true } },
      messagesSent: { select: { matchId: true, body: true, kind: true, createdAt: true } },
      reportsFiled: { select: { aboutId: true, reason: true, createdAt: true } },
      // reporterId is deliberately NOT included: revealing who filed a
      // report about this account is a safety/retaliation risk, and DPDP's
      // access right doesn't require disclosing a third party's identity.
      reportsReceived: { select: { reason: true, createdAt: true } },
      blocksMade: { select: { blockedId: true, createdAt: true } },
      dateFeedback: true,
      consentRecords: { orderBy: { createdAt: 'asc' } },
      privacyRequests: {
        select: { id: true, type: true, status: true, createdAt: true, completedAt: true },
      },
      supportTickets: {
        select: { id: true, subject: true, category: true, status: true, createdAt: true },
      },
      loginEvents: {
        select: { method: true, platform: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
    },
  });

  if (!user) return null;

  return {
    exportGeneratedAt: new Date().toISOString(),
    legalBasis: 'DPDP Act 2023 -- Data Principal right to access / data portability',
    account: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      signupMethods: [user.googleId && 'google', user.facebookId && 'facebook', user.phone && 'phone_otp', user.email && 'email_otp'].filter(Boolean),
      status: user.status,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
    },
    profile: user.profile && {
      displayName: user.profile.displayName,
      dateOfBirth: user.profile.dateOfBirth,
      gender: user.profile.gender,
      lookingFor: user.profile.lookingFor,
      city: user.profile.city,
      bio: user.profile.bio,
      intent: user.profile.intent,
      interests: user.profile.interests.map((i) => i.label),
      tribes: user.profile.tribes.map((t) => t.label),
      subCommunities: user.profile.subCommunities.map((s) => s.label),
      relationshipStyles: user.profile.relationshipStyles.map((r) => r.label),
      promptAnswers: user.profile.answers.map((a) => ({ prompt: a.prompt.text, answer: a.answer })),
      photos: user.profile.photos,
      preciseLocationCollected: user.profile.latitude != null,
    },
    activity: {
      swipes: user.swipesSent,
      matches: [
        ...user.matchesAsUserA.map((m) => ({ ...m, otherUserId: m.userBId })),
        ...user.matchesAsUserB.map((m) => ({ ...m, otherUserId: m.userAId })),
      ],
      messagesSent: user.messagesSent,
      reportsFiled: user.reportsFiled,
      reportsReceived: user.reportsReceived,
      blocksMade: user.blocksMade,
      dateFeedback: user.dateFeedback,
    },
    consents: user.consentRecords,
    privacyRequests: user.privacyRequests,
    supportTickets: user.supportTickets,
    loginHistory: user.loginEvents,
  };
}
