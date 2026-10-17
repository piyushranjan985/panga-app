import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import OpenCaseButton from '@/components/OpenCaseButton';
import { matchingUserIds } from '@/lib/userSearch';
import type { Prisma } from '@prisma/client';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePageAccess('moderation.view');
  const sp = await searchParams;

  // A report has two users on it -- the person who filed it and the
  // person it's about -- so a search box here, unlike most others in
  // this portal, has to match either side: an admin chasing up a report
  // a user just filed, and one chasing a report a user was named in,
  // both start from the same phone/email/name they have on hand (see
  // admin/lib/userSearch.ts).
  const where: Prisma.ReportWhereInput = {};
  const q = sp.q?.trim();
  if (q) {
    const ids = await matchingUserIds(q);
    where.OR = [{ reporterId: { in: ids } }, { aboutId: { in: ids } }];
  }

  const reports = await db.report.findMany({
    where,
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
      <PageHeader
        title="Reports"
        description="Every report filed by a user, cross-referenced with any moderation case it became."
        actions={
          hasPermission(admin.role, 'reporting.export') && (
            <a
              href={`/api/reports/export?${new URLSearchParams({ q: sp.q ?? '' }).toString()}`}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas"
            >
              Export CSV
            </a>
          )
        }
      />
      <div className="p-8">
        <form className="mb-5 flex flex-wrap gap-2" method="get">
          <input
            type="text"
            name="q"
            defaultValue={sp.q}
            placeholder="Search reporter or reported user's name, email, or phone"
            className="min-w-[280px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Filter</button>
        </form>

        {reports.length === 0 ? (
          <EmptyState title={q ? 'No reports match this search' : 'No reports yet'} />
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
