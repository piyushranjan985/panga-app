import { NextResponse } from 'next/server';
import { getCurrentAdmin, type CurrentAdmin } from '@/lib/session';
import { hasPermission, requiresStepUp, type Permission } from '@/lib/rbac';

export type GuardResult =
  | { admin: CurrentAdmin; sessionId: string }
  | { error: NextResponse };

// Every mutating (and most reading) API route starts with:
//   const guard = await requirePermission('users.action.ban');
//   if ('error' in guard) return guard.error;
//   const { admin } = guard;
// One call, one place that enforces "signed in -> has this permission ->
// (if the permission demands it) has a fresh step-up" -- see lib/rbac.ts.
export async function requirePermission(permission: Permission): Promise<GuardResult> {
  const current = await getCurrentAdmin();
  if (!current) {
    return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  }
  if (!hasPermission(current.admin.role, permission)) {
    return { error: NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 }) };
  }
  if (requiresStepUp(permission) && !current.stepUpValid) {
    return {
      error: NextResponse.json(
        { error: 'Re-verify your identity to continue.', stepUpRequired: true },
        { status: 403 },
      ),
    };
  }
  return { admin: current.admin, sessionId: current.sessionId };
}
