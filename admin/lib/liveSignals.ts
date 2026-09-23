import { db } from '@/lib/db';

export interface LiveSignal {
  key: string;
  category: 'SLA_BREACH' | 'PRIVACY' | 'MODERATION' | 'SECURITY';
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  detail: string;
  sourceType: string;
  sourceId: string;
  href: string;
}

// Real, queried-right-now conditions worth an admin's attention -- not
// stored rows, computed fresh on every Notifications page load from the
// same tables the rest of the portal already uses. This app has no
// background job runner, so there is no automatic monitor writing
// OpsAlert rows on its own; this is the substitute -- a live view an
// admin can turn into a tracked, acknowledgeable OpsAlert with one click
// (see components/AlertActions.tsx) when it's worth keeping a record of.
export async function getLiveSignals(): Promise<LiveSignal[]> {
  const now = new Date();
  const [overdueRequests, overdueTickets, overdueModerationCases, openIncidents] = await Promise.all([
    db.privacyRequest.findMany({
      where: { dueAt: { lt: now }, status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] } },
      select: { id: true, type: true, dueAt: true },
      take: 20,
    }),
    db.supportTicket.findMany({
      where: { slaDueAt: { lt: now }, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED'] as never } },
      select: { id: true, subject: true, slaDueAt: true },
      take: 20,
    }),
    db.moderationCase.findMany({
      where: { slaDueAt: { lt: now }, status: { in: ['OPEN', 'IN_REVIEW', 'ESCALATED'] as never } },
      select: { id: true, category: true, severity: true, slaDueAt: true },
      take: 20,
    }),
    db.privacyIncident.findMany({
      where: { status: { not: 'CLOSED' }, severity: { in: ['HIGH', 'CRITICAL'] } },
      select: { id: true, title: true, severity: true, status: true },
      take: 20,
    }),
  ]);

  const signals: LiveSignal[] = [];

  for (const r of overdueRequests) {
    signals.push({
      key: `privacy-request-${r.id}`,
      category: 'SLA_BREACH',
      severity: 'WARNING',
      title: `${r.type} request overdue`,
      detail: `Due ${r.dueAt?.toISOString().slice(0, 10)}.`,
      sourceType: 'PrivacyRequest',
      sourceId: r.id,
      href: `/privacy/requests/${r.id}`,
    });
  }
  for (const t of overdueTickets) {
    signals.push({
      key: `ticket-${t.id}`,
      category: 'SLA_BREACH',
      severity: 'WARNING',
      title: `Support ticket past SLA: ${t.subject}`,
      detail: `Due ${t.slaDueAt?.toISOString().slice(0, 10)}.`,
      sourceType: 'SupportTicket',
      sourceId: t.id,
      href: `/support/${t.id}`,
    });
  }
  for (const c of overdueModerationCases) {
    signals.push({
      key: `case-${c.id}`,
      category: 'MODERATION',
      severity: c.severity === 'CRITICAL' || c.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
      title: `Moderation case past SLA: ${c.category.replace(/_/g, ' ')}`,
      detail: `Due ${c.slaDueAt?.toISOString().slice(0, 10)}.`,
      sourceType: 'ModerationCase',
      sourceId: c.id,
      href: `/moderation/${c.id}`,
    });
  }
  for (const i of openIncidents) {
    signals.push({
      key: `incident-${i.id}`,
      category: 'PRIVACY',
      severity: i.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      title: `Open ${i.severity.toLowerCase()} incident: ${i.title}`,
      detail: `Status: ${i.status.replace(/_/g, ' ')}.`,
      sourceType: 'PrivacyIncident',
      sourceId: i.id,
      href: `/privacy/incidents/${i.id}`,
    });
  }

  return signals;
}
