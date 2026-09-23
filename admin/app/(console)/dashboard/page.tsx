import { requirePageAccess } from '@/lib/pageGuard';
import PageHeader from '@/components/PageHeader';
import DashboardClient from '@/components/DashboardClient';

export default async function DashboardPage() {
  const admin = await requirePageAccess('dashboard.view');
  return (
    <div>
      <PageHeader title="Dashboard" description="Real-time and historical operational overview." />
      <div className="p-8">
        <DashboardClient role={admin.role} />
      </div>
    </div>
  );
}
