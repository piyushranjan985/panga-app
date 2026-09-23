import { db } from '@/lib/db';
import type { RequestContext } from '@/lib/requestContext';

export interface WriteAuditInput {
  actorId: string | null;
  actorEmail: string;
  action: string; // dot-path, e.g. "user.suspend"
  category: 'user' | 'moderation' | 'content' | 'support' | 'privacy' | 'auth' | 'config' | 'payments' | 'system';
  targetType?: string;
  targetId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  context: RequestContext;
}

// The one place that writes to AuditLogEntry -- every sensitive route in
// this app calls this instead of touching the table directly, so "who /
// what / when / target / previous value / new value / reason / IP+device /
// request ID" (the spec's required audit shape) is always complete and
// consistently named. No update/delete is ever exposed for this model --
// see app/api/audit/route.ts (GET only).
export async function writeAudit(input: WriteAuditInput) {
  await db.auditLogEntry.create({
    data: {
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: input.action,
      category: input.category,
      targetType: input.targetType,
      targetId: input.targetId,
      previousValue: input.previousValue === undefined ? undefined : (input.previousValue as object),
      newValue: input.newValue === undefined ? undefined : (input.newValue as object),
      reason: input.reason,
      requestId: input.context.requestId,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
    },
  });
}
