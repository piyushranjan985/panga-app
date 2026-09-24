import { requirePageAccess } from '@/lib/pageGuard';
import PageHeader from '@/components/PageHeader';
import TrendsClient from '@/components/TrendsClient';

export default async function TrendsPage() {
  await requirePageAccess('analytics.view');
  return (
    <div>
      <PageHeader
        title="Trends"
        description="Historical trends -- toggle day, week, month or year. Hover any chart for exact values."
      />
      <div className="p-8">
        <TrendsClient />
      </div>
    </div>
  );
}
