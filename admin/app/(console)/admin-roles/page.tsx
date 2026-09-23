import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import NewAdminForm from '@/components/NewAdminForm';
import AdminUserActions from '@/components/AdminUserActions';
import { ROLE_PERMISSIONS, ALL_PERMISSIONS_FOR_DISPLAY } from '@/lib/rbac';

export default async function AdminRolesPage() {
  const current = await requirePageAccess('adminUsers.manage');

  const admins = await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  const roles = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[];

  return (
    <div>
      <PageHeader title="Admin & Roles" description="Who can sign in to this portal, what role they hold, and exactly what each role can do." />
      <div className="space-y-8 p-8">
        <NewAdminForm />

        <section>
          <h2 className="mb-3 text-sm font-bold">Admin accounts</h2>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Admin</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">MFA</th>
                  <th className="px-4 py-2.5">Last login</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 align-top hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{a.name}</p>
                      <p className="text-xs text-inkFaint">{a.email}</p>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{a.role.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5"><Badge tone={a.isActive ? 'success' : 'default'}>{a.isActive ? 'Active' : 'Deactivated'}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={a.mfaEnabled ? 'success' : 'warning'}>{a.mfaEnabled ? 'Enrolled' : 'Not enrolled'}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{a.lastLoginAt ? a.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : 'Never'}</td>
                    <td className="px-4 py-2.5">
                      {a.id === current.id ? (
                        <p className="text-xs text-inkFaint">This is you -- ask another admin to change your role or status.</p>
                      ) : (
                        <AdminUserActions adminId={a.id} role={a.role} isActive={a.isActive} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold">Permission matrix</h2>
          <p className="mb-3 max-w-2xl text-xs text-inkFaint">
            Every role&apos;s grant is spelled out explicitly in admin/lib/rbac.ts (no inheritance) -- this table is
            that file, rendered. Rows marked with a step-up icon also demand a fresh password + MFA check
            (lib/rbac.ts&apos;s STEP_UP_REQUIRED) even from an already-signed-in admin with the permission.
          </p>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-canvas text-left font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="sticky left-0 bg-canvas px-3 py-2">Permission</th>
                  {roles.map((r) => (
                    <th key={r} className="px-2 py-2 text-center">{r.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_PERMISSIONS_FOR_DISPLAY.map(({ permission, stepUp }) => (
                  <tr key={permission} className="border-b border-border last:border-0">
                    <td className="sticky left-0 bg-surface px-3 py-1.5 font-mono">{permission}{stepUp && <span title="Requires step-up re-verification"> 🔒</span>}</td>
                    {roles.map((r) => (
                      <td key={r} className="px-2 py-1.5 text-center">{ROLE_PERMISSIONS[r].includes(permission) ? '●' : ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
