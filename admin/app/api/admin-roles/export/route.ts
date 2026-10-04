import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { toCsv, csvResponse } from '@/lib/csv';

// Admin-account access review: who can sign in to this portal, what role
// they hold, whether MFA is enrolled, and when they last signed in --
// gated on adminUsers.manage (same permission as the page itself) since
// this is the whole-org admin access list, a step above the generic
// reporting.export gate used elsewhere in this file's siblings.
export async function GET() {
  const guard = await requirePermission('adminUsers.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const admins = await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } });

  const header = ['Admin ID', 'Name', 'Email', 'Role', 'Status', 'MFA enrolled', 'Last login', 'Created'];
  const rows = admins.map((a) => [
    a.id,
    a.name,
    a.email,
    a.role,
    a.isActive ? 'Active' : 'Deactivated',
    a.mfaEnabled ? 'Yes' : 'No',
    a.lastLoginAt?.toISOString() ?? 'Never',
    a.createdAt.toISOString(),
  ]);
  const csv = toCsv(header, rows);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'adminRoles.export',
    category: 'config',
    newValue: { count: admins.length },
    context: await getRequestContext(),
  });

  return csvResponse(csv, 'admin-accounts');
}
