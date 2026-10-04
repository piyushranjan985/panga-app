import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';
import type { Prisma } from '@prisma/client';

// Same filters as app/(console)/support/page.tsx. Contact email/phone are
// left out of the CSV on purpose (same reasoning as users/export/route.ts:
// bulk PII export is a bigger risk than reading one ticket at a time,
// where the page already shows a guest's contact info to a signed-in
// CUSTOMER_SUPPORT admin).
export async function GET(req: Request) {
  const guard = await requirePermission('reporting.export');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');

  const where: Prisma.SupportTicketWhereInput = {};
  where.status = status ? (status as never) : { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED'] };
  if (priority) where.priority = priority as never;

  const tickets = await db.supportTicket.findMany({
    where,
    include: { user: { include: { profile: { select: { displayName: true } } } }, assignee: { select: { name: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 5000,
  });

  const header = ['Ticket ID', 'Subject', 'User', 'Category', 'Channel', 'Priority', 'Status', 'Assignee', 'Opened', 'Escalated', 'Resolved'];
  const rows = tickets.map((t) => [
    t.id,
    t.subject,
    t.user?.profile?.displayName ?? (t.userId ? t.userId : 'Guest'),
    t.category,
    t.channel,
    t.priority,
    t.status,
    t.assignee?.name ?? 'Unassigned',
    t.createdAt.toISOString(),
    t.escalatedAt?.toISOString() ?? '',
    t.resolvedAt?.toISOString() ?? '',
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'support.export',
    category: 'support',
    newValue: { count: tickets.length, filters: Object.fromEntries(searchParams) },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'support-tickets');
}
