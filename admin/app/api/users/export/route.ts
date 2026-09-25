import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

// Exports are permission-controlled and logged, per the spec's Data &
// Reporting section -- every call writes an audit entry with the filters
// used, and the CSV itself never includes raw email/phone (masked, same
// as the list/detail pages) since bulk PII export is a bigger risk than a
// single unmask click and isn't something this endpoint does.
export async function GET(req: Request) {
  const guard = await requirePermission('users.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const where: Prisma.UserWhereInput = {};
  const and: Prisma.UserWhereInput[] = [];
  const status = searchParams.get('status');
  const city = searchParams.get('city');
  if (status) and.push({ status: status as never });
  if (city) and.push({ profile: { city } });
  if (and.length > 0) where.AND = and;

  const users = await db.user.findMany({
    where,
    include: { profile: { select: { displayName: true, city: true, intent: true, verification: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const header = 'User ID,Display Name,City,Intent,Verification,Status,Joined';
  const rows = users.map((u) =>
    [u.id, u.profile?.displayName ?? '', u.profile?.city ?? '', u.profile?.intent ?? '', u.profile?.verification ?? '', u.status, u.createdAt.toISOString()]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  const csv = [header, ...rows].join('\n');

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'user.export',
    category: 'user',
    newValue: { count: users.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="findmyvybe-users-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
