import { redirect } from 'next/navigation';
import { getOptionalAdmin } from '@/lib/pageGuard';
import PageHeader from '@/components/PageHeader';
import ChangePasswordForm from '@/components/ChangePasswordForm';

export default async function AccountPage() {
  const admin = await getOptionalAdmin();
  if (!admin) redirect('/login');

  return (
    <div>
      <PageHeader title="Your account" description="Manage your own sign-in credentials." />
      <div className="space-y-8 p-8">
        <div className="max-w-sm rounded-card border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">Signed in as</p>
          <p className="mt-1 text-sm font-semibold text-ink">{admin.name}</p>
          <p className="text-xs text-inkFaint">{admin.email}</p>
          <p className="mt-2 text-xs text-inkSoft">
            Two-factor authentication: {admin.mfaEnabled ? <span className="text-success">enabled</span> : <span className="text-warning">not set up</span>}
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold text-inkSoft">Change password</h2>
          <ChangePasswordForm mfaEnabled={admin.mfaEnabled} />
        </div>
      </div>
    </div>
  );
}
