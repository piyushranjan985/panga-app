import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

// Same filters as the Audit Logs page, exported as CSV -- a separate,
// audit-logged-export permission (auditLogs.export) from just viewing the
// log, since bulk export of the audit trail is itself a sensitive action
// worth its own record.
export async function GET(req: Request) {
  const guard = await requirePermission('auditLogs.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const where: Prisma.AuditLogEntryWhereInput = {};
  const and: Prisma.AuditLogEntryWhereInput[] = [];
  const category = searchParams.get('category');
  const actorEmail = searchParams.get('actorEmail');
  const action = searchParams.get('action');
  const targetId = searchParams.get('targetId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (category) and.push({ category });
  if (actorEmail) and.push({ actorEmail: { contains: actorEmail, mode: 'insensitive' } });
  if (action) and.push({ action: { contains: action, mode: 'insensitive' } });
  if (targetId) and.push({ targetId });
  if (from) and.push({ createdAt: { gte: new Date(from) } });
  if (to) and.push({ createdAt: { lte: new Date(to) } });
  if (and.length > 0) where.AND = and;

  const entries = await db.auditLogEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });

  const header = 'Timestamp,Actor,Action,Category,TargetType,TargetId,Reason,IP,RequestId';
  const rows = entries.map((e) =>
    [e.createdAt.toISOString(), e.actorEmail, e.action, e.category, e.targetType ?? '', e.targetId ?? '', e.reason ?? '', e.ip ?? '', e.requestId]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  const csv = [header, ...rows].join('\n');

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'auditLogs.export',
    category: 'system',
    newValue: { count: entries.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="vybematch-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
