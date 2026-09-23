import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import OpenCaseButton from '@/components/OpenCaseButton';

export default async function ReportsPage() {
  const admin = await requirePageAccess('moderation.view');

  const reports = await db.report.findMany({
    include: {
      reporter: { include: { profile: { select: { displayName: true } } } },
      about: { include: { profile: { select: { displayName: true } } } },
      moderationCases: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const canOpenCase = hasPermission(admin.role, 'moderation.assign');

  return (
    <div>
      <PageHeader title="Reports" description="Every report filed by a user, cross-referenced with any moderation case it became." />
      <div className="p-8">
        {reports.length === 0 ? (
          <EmptyState title="No reports yet" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Reported user</th>
                  <th className="px-4 py-2.5">Reporter</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">Filed</th>
                  <th className="px-4 py-2.5">Case</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link href={`/users/${r.aboutId}`} className="font-semibold text-brand hover:underline">
                        {r.about.profile?.displayName ?? r.aboutId}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{r.reporter.profile?.displayName ?? r.reporterId}</td>
                    <td className="px-4 py-2.5 text-inkSoft">
                      {r.reason}
                      {r.details && <span className="block text-xs text-inkFaint">{r.details}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{r.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-2.5">
                      {r.moderationCases[0] ? (
                        <Link href={`/moderation/${r.moderationCases[0].id}`} className="text-brand hover:underline">
                          <Badge>{r.moderationCases[0].status}</Badge>
                        </Link>
                      ) : canOpenCase ? (
                        <OpenCaseButton reportId={r.id} />
                      ) : (
                        <span className="text-xs text-inkFaint">No case</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
