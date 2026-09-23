import { redirect } from 'next/navigation';
import { getCurrentAdmin, type CurrentAdmin } from '@/lib/session';
import { hasPermission, type Permission } from '@/lib/rbac';

// Server-component equivalent of requirePermission() -- redirects instead
// of returning a JSON error, since pages render HTML. Every page under
// app/(console)/ calls this first.
export async function requirePageAccess(permission: Permission): Promise<CurrentAdmin> {
  const current = await getCurrentAdmin();
  if (!current) redirect('/login');
  if (!hasPermission(current.admin.role, permission)) redirect('/forbidden');
  return current.admin;
}

export async function getOptionalAdmin(): Promise<CurrentAdmin | null> {
  const current = await getCurrentAdmin();
  return current?.admin ?? null;
}
