import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export interface WriteAuditInput {
  actorEmail: string;
  action: string; // dot-path, e.g. "user.self_delete"
  category: 'user' | 'moderation' | 'content' | 'support' | 'privacy' | 'auth' | 'config' | 'payments' | 'system';
  targetType?: string;
  targetId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

// Consumer-app counterpart to admin/lib/audit.ts + admin/lib/requestContext.ts,
// same AuditLogEntry table -- one shared prisma/schema.prisma (see lib/db.ts's
// comment), two separate Next apps writing into it, so a self-service action
// taken here (currently just app/api/me/delete) shows up in the admin
// portal's Audit Logs view right alongside every admin-triggered one, rather
// than needing a second trail that could drift out of sync with the first.
//
// AuditLogEntry.actorId is typed for an AdminUser (see admin/lib/audit.ts) --
// there's no admin acting on a self-service route, so actorId is always null
// here and actorEmail carries the user's own identifier instead (their
// email, falling back to phone, falling back to their user id for a
// socially-signed-in user with neither). requestId/ip/userAgent are pulled
// from the current request the same way admin/lib/requestContext.ts does.
export async function writeAudit(input: WriteAuditInput) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
  const userAgent = h.get('user-agent') || undefined;

  await db.auditLogEntry.create({
    data: {
      actorId: null,
      actorEmail: input.actorEmail,
      action: input.action,
      category: input.category,
      targetType: input.targetType,
      targetId: input.targetId,
      previousValue: input.previousValue === undefined ? undefined : (input.previousValue as object),
      newValue: input.newValue === undefined ? undefined : (input.newValue as object),
      reason: input.reason,
      requestId: randomUUID(),
      ip,
      userAgent,
    },
  });
}
