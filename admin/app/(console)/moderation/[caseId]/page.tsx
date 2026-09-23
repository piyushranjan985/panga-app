import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import ModerationCaseActions from '@/components/ModerationCaseActions';
import ModerationNoteForm from '@/components/ModerationNoteForm';

export default async function ModerationCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const admin = await requirePageAccess('moderation.view');
  const { caseId } = await params;

  const c = await db.moderationCase.findUnique({
    where: { id: caseId },
    include: {
      subjectUser: { include: { profile: { select: { displayName: true, city: true, bio: true } } } },
      report: { include: { reporter: { include: { profile: { select: { displayName: true } } } } } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      appeals: true,
      assignee: { select: { id: true, name: true } },
    },
  });
  if (!c) notFound();

  const admins = await db.adminUser.findMany({
    where: { isActive: true, role: { in: ['SUPER_ADMIN', 'ADMIN', 'TRUST_AND_SAFETY', 'MODERATOR'] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const canViewRisk = hasPermission(admin.role, 'moderation.viewRiskScore');

  return (
    <div>
      <PageHeader
        title={`Case -- ${c.subjectUser.profile?.displayName ?? c.subjectUserId}`}
        description={`${c.category} · opened ${c.createdAt.toISOString().slice(0, 10)}`}
      />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={c.status === 'RESOLVED' ? 'success' : c.status === 'DISMISSED' ? 'default' : 'warning'}>{c.status}</Badge>
              <Badge tone={c.severity === 'CRITICAL' ? 'critical' : c.severity === 'HIGH' || c.severity === 'MEDIUM' ? 'warning' : 'default'}>{c.severity}</Badge>
              <Badge tone="info">{c.sourceType.replace('_', ' ')}</Badge>
              {c.isRepeatOffender && <Badge tone="critical">Repeat offender</Badge>}
              {canViewRisk && c.riskScore != null && <Badge>{`risk ${c.riskScore.toFixed(2)}`}</Badge>}
            </div>
            <p className="text-sm">
              Subject:{' '}
              <Link href={`/users/${c.subjectUserId}`} className="font-semibold text-brand hover:underline">
                {c.subjectUser.profile?.displayName ?? c.subjectUserId}
              </Link>{' '}
              ({c.subjectUser.profile?.city ?? '—'})
            </p>
            {c.report && (
              <p className="mt-1 text-sm text-inkSoft">
                From report: &ldquo;{c.report.reason}&rdquo; -- filed by {c.report.reporter.profile?.displayName ?? '—'}
                {c.report.details && <> -- {c.report.details}</>}
              </p>
            )}
            {c.evidence != null && (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas p-3 text-xs text-inkSoft">{JSON.stringify(c.evidence, null, 2)}</pre>
            )}
            {c.resolution && (
              <p className="mt-3 rounded-lg bg-successSoft p-3 text-sm text-success">
                Resolution: {c.resolution}
              </p>
            )}
          </div>

          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold">Case notes</h2>
            <div className="space-y-3">
              {c.notes.length === 0 && <p className="text-sm text-inkFaint">No notes yet.</p>}
              {c.notes.map((n) => (
                <div key={n.id} className="rounded-lg bg-canvas p-3 text-sm">
                  <p>{n.body}</p>
                  <p className="mt-1 text-xs text-inkFaint">{n.author.name} · {n.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</p>
                </div>
              ))}
            </div>
            {hasPermission(admin.role, 'moderation.assign') && <ModerationNoteForm caseId={c.id} />}
          </div>

          {c.appeals.length > 0 && (
            <div className="rounded-card border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-bold">Appeals</h2>
              {c.appeals.map((a) => (
                <div key={a.id} className="mb-2 rounded-lg bg-canvas p-3 text-sm">
                  <p>{a.message}</p>
                  <p className="mt-1 text-xs text-inkFaint">{a.status} · {a.createdAt.toISOString().slice(0, 10)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <ModerationCaseActions
            caseId={c.id}
            role={admin.role}
            status={c.status}
            currentAssigneeId={c.assignee?.id ?? null}
            admins={admins}
            hasAppeal={c.appeals.some((a) => a.status === 'PENDING')}
          />
        </div>
      </div>
    </div>
  );
}
