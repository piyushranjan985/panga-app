import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

// The one endpoint that ever returns unmasked email/phone/DOB/precise
// location -- every call is its own audit entry ("PII access" is one of
// the spec's explicitly required audited event types), not just a
// permission check.
export async function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await requirePermission('users.viewSensitivePII');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: { select: { dateOfBirth: true, latitude: true, longitude: true, locationUpdatedAt: true } } },
  });
  if (!user) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'user.pii.unmask',
    category: 'user',
    targetType: 'User',
    targetId: userId,
    context: await getRequestContext(),
  });

  return NextResponse.json({
    email: user.email,
    phone: user.phone,
    dateOfBirth: user.profile?.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    preciseLocation:
      user.profile?.latitude != null && user.profile?.longitude != null
        ? {
            latitude: user.profile.latitude,
            longitude: user.profile.longitude,
            updatedAt: user.profile.locationUpdatedAt?.toISOString() ?? null,
          }
        : null,
  });
}
