import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRealIdentityCheck } from '@/lib/safety/identityVerification';

/**
 * Public, unauthenticated endpoint behind the Family Preview feature: a
 * curated, read-only summary of a profile meant to be shared outside the
 * app (with family, say) — deliberately far narrower than the real swipe
 * profile: no bio, no interests, no Vybe Check prompt answers, nothing
 * from the discovery/swipe side of the product. Only returns anything if
 * the profile owner has explicitly turned this on (familyPreviewOn);
 * everything else — no such profile, or preview turned off — comes back
 * as the same 404 so this endpoint can't be used to probe who has an
 * account here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const profile = await db.profile.findUnique({
    where: { userId },
    include: { photos: { orderBy: { position: 'asc' }, take: 1 } },
  });

  if (!profile || !profile.familyPreviewOn) {
    return NextResponse.json({ error: "This preview link isn't available." }, { status: 404 });
  }

  const ageMs = Date.now() - profile.dateOfBirth.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));

  return NextResponse.json({
    preview: {
      displayName: profile.displayName,
      age,
      city: profile.city,
      intent: profile.intent,
      verification: profile.verification,
      verificationIsMock: !isRealIdentityCheck(),
      photoUrl: profile.photos[0]?.url ?? null,
    },
  });
}
