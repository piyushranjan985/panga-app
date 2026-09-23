import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import PrivacyRequestControls from '@/components/PrivacyRequestControls';

export default async function PrivacyRequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  await requirePageAccess('privacy.view');
  const { requestId } = await params;

  const request = await db.privacyRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { include: { profile: { select: { displayName: true, city: true } } } },
      handledBy: { select: { name: true } },
      legalHold: true,
    },
  });
  if (!request) notFound();

  const activeLegalHold = request.userId
    ? await db.legalHold.findFirst({ where: { userId: request.userId, active: true } })
    : null;

  return (
    <div>
      <PageHeader title={`${request.type} request`} description={`Received ${request.createdAt.toISOString().slice(0, 10)}`} />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-card border border-border bg-surface p-5 text-sm">
            <p>
              Data Principal:{' '}
              {request.user ? (
                <Link href={`/users/${request.userId}`} className="font-semibold text-brand hover:underline">
                  {request.user.profile?.displayName ?? request.userId}
                </Link>
              ) : (
                request.contactEmail ?? 'Unknown -- unmatched account'
              )}
            </p>
            <p className="mt-1">Status: <Badge>{request.status}</Badge></p>
            {request.dueAt && <p className="mt-1 text-inkSoft">Due: {request.dueAt.toISOString().slice(0, 10)}</p>}
            {request.description && <p className="mt-2 text-inkSoft">{request.description}</p>}
            {activeLegalHold && (
              <p className="mt-3 rounded-lg bg-criticalSoft p-3 text-critical">
                Blocked by an active legal hold: &ldquo;{activeLegalHold.reason}&rdquo;. Release the hold on the
                Legal Holds page before this can be completed.
              </p>
            )}
            {request.resolutionNote && (
              <p className="mt-3 rounded-lg bg-successSoft p-3 text-success">Resolution: {request.resolutionNote}</p>
            )}
          </div>
        </div>

        <div>
          <PrivacyRequestControls
            requestId={request.id}
            status={request.status}
            type={request.type}
            hasActiveLegalHold={Boolean(activeLegalHold)}
            canExport={Boolean(request.userId) && (request.type === 'ACCESS' || request.type === 'PORTABILITY')}
          />
        </div>
      </div>
    </div>
  );
}
