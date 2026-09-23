import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import TicketReplyForm from '@/components/TicketReplyForm';
import TicketControls from '@/components/TicketControls';

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const admin = await requirePageAccess('support.view');
  const { ticketId } = await params;

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { include: { profile: { select: { displayName: true } } } },
      assignee: { select: { id: true, name: true } },
      messages: { include: { authorAdmin: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!ticket) notFound();

  const admins = await db.adminUser.findMany({
    where: { isActive: true, role: { in: ['SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SUPPORT'] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const canRespond = hasPermission(admin.role, 'support.respond');

  return (
    <div>
      <PageHeader
        title={ticket.subject}
        description={`${ticket.category} · ${ticket.channel === 'VYBEHELP_ESCALATION' ? 'Escalated from VybeHelp 💬' : ticket.channel}`}
      />
      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-3">
            {ticket.messages.map((m) => (
              <div key={m.id} className={`rounded-lg p-3 text-sm ${m.internal ? 'border border-dashed border-warning bg-warningSoft' : m.authorType === 'user' ? 'bg-canvas' : 'bg-brand/10'}`}>
                <p>{m.body}</p>
                <p className="mt-1 text-xs text-inkFaint">
                  {m.internal ? 'Internal note' : m.authorType === 'user' ? 'User' : m.authorAdmin?.name ?? 'Support'} ·{' '}
                  {m.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </p>
              </div>
            ))}
            {ticket.vybeHelpTranscript != null && Array.isArray(ticket.vybeHelpTranscript) && ticket.vybeHelpTranscript.length > 0 && (
              <details className="rounded-lg border border-border p-3 text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-inkFaint">VybeHelp transcript before escalation</summary>
                <div className="mt-2 space-y-1">
                  {(ticket.vybeHelpTranscript as { role: string; text: string }[]).map((t, i) => (
                    <p key={i} className="text-xs text-inkSoft">
                      <span className="font-semibold">{t.role}:</span> {t.text}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>
          {canRespond && <TicketReplyForm ticketId={ticket.id} />}
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface p-5 text-sm">
            <h2 className="mb-2 text-sm font-bold">Details</h2>
            <p className="text-inkSoft">
              User:{' '}
              {ticket.user ? (
                <Link href={`/users/${ticket.userId}`} className="text-brand hover:underline">{ticket.user.profile?.displayName ?? ticket.userId}</Link>
              ) : (
                ticket.contactEmail ?? ticket.contactPhone ?? 'Guest'
              )}
            </p>
            <p className="mt-1 text-inkSoft">Status: <Badge>{ticket.status}</Badge></p>
            <p className="mt-1 text-inkSoft">Priority: <Badge tone={ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? 'critical' : 'default'}>{ticket.priority}</Badge></p>
          </div>
          {canRespond && (
            <TicketControls
              ticketId={ticket.id}
              status={ticket.status}
              priority={ticket.priority}
              currentAssigneeId={ticket.assignee?.id ?? null}
              admins={admins}
            />
          )}
        </div>
      </div>
    </div>
  );
}
