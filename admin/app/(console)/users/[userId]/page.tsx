import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { ageFromDob } from '@/lib/mask';
import UserPiiPanel from '@/components/UserPiiPanel';
import UserActionsPanel from '@/components/UserActionsPanel';
import ConfirmActionButton from '@/components/ConfirmActionButton';
import { hasPermission as hasPerm } from '@/lib/rbac';

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const admin = await requirePageAccess('users.view');
  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: {
        include: {
          interests: true,
          tribes: true,
          subCommunities: true,
          relationshipStyles: true,
          photos: { orderBy: { position: 'asc' } },
          answers: { include: { prompt: true } },
        },
      },
    },
  });
  if (!user) notFound();
  const p = user.profile;

  const [
    matchesA,
    matchesB,
    swipesSent,
    reportsFiled,
    reportsReceived,
    blocksMade,
    blocksReceived,
    loginEvents,
    supportTickets,
    consentRecords,
    privacyRequests,
    moderationCases,
    auditEntries,
  ] = await Promise.all([
    db.match.findMany({ where: { userAId: userId }, include: { userB: { include: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 25 }),
    db.match.findMany({ where: { userBId: userId }, include: { userA: { include: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 25 }),
    db.swipe.groupBy({ by: ['action'], where: { fromUserId: userId }, _count: { _all: true } }),
    db.report.findMany({ where: { reporterId: userId }, include: { about: { include: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' } }),
    db.report.findMany({ where: { aboutId: userId }, include: { reporter: { include: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' } }),
    db.block.count({ where: { blockerId: userId } }),
    db.block.count({ where: { blockedId: userId } }),
    db.loginEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    db.consentRecord.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    db.privacyRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    db.moderationCase.findMany({ where: { subjectUserId: userId }, orderBy: { createdAt: 'desc' }, include: { assignee: { select: { name: true } } } }),
    db.auditLogEntry.findMany({ where: { targetType: 'User', targetId: userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);

  const matches = [
    ...matchesA.map((m) => ({ id: m.id, other: m.userB.profile?.displayName ?? '—', createdAt: m.createdAt, unmatchedAt: m.unmatchedAt })),
    ...matchesB.map((m) => ({ id: m.id, other: m.userA.profile?.displayName ?? '—', createdAt: m.createdAt, unmatchedAt: m.unmatchedAt })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const likesSent = swipesSent.find((s) => s.action === 'VYBE')?._count._all ?? 0;
  const passesSent = swipesSent.find((s) => s.action === 'PASS')?._count._all ?? 0;

  const canViewPii = hasPermission(admin.role, 'users.viewSensitivePII');

  return (
    <div>
      <PageHeader
        title={p?.displayName ?? '(no profile)'}
        description={`User ID ${user.id}`}
        actions={<UserActionsPanel userId={user.id} role={admin.role} status={user.status} messagingRestricted={user.messagingRestricted} discoveryRestricted={user.discoveryRestricted} profileHidden={user.profileHidden} />}
      />

      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Contact & identity">
            <UserPiiPanel userId={user.id} canViewPii={canViewPii} hasEmail={Boolean(user.email)} hasPhone={Boolean(user.phone)} />
            <Row label="Account status"><Badge tone={user.status === 'ACTIVE' ? 'success' : user.status === 'BANNED' ? 'critical' : 'warning'}>{user.status}</Badge></Row>
            {user.statusReason && <Row label="Status reason">{user.statusReason}</Row>}
            <Row label="Joined">{user.createdAt.toISOString().slice(0, 10)}</Row>
            <Row label="Last active">{user.lastActiveAt.toISOString().slice(0, 16).replace('T', ' ')}</Row>
          </Section>

          {p && (
            <Section title="Profile">
              <Row label="City">{p.city}</Row>
              <Row label="Gender">{p.gender}</Row>
              <Row label="Looking for">{p.lookingFor.join(', ')}</Row>
              <Row label="Age">{ageFromDob(p.dateOfBirth)}</Row>
              <Row label="Intent"><Badge tone="brand">{p.intent}</Badge></Row>
              <Row label="Verification"><Badge tone={p.verification === 'VERIFIED' ? 'success' : p.verification === 'REJECTED' ? 'critical' : 'default'}>{p.verification}</Badge></Row>
              <Row label="Bio">{p.bio || '—'}</Row>
              <Row label="Interests">{p.interests.map((i) => i.label).join(', ') || '—'}</Row>
              <Row label="Tribe">{p.tribes.map((t) => t.label).join(', ') || '—'}</Row>
              <Row label="Sub-communities">{p.subCommunities.map((s) => s.label).join(', ') || '—'}</Row>
              <Row label="Relationship values">{p.relationshipStyles.map((r) => r.label).join(', ') || '—'}</Row>
              <div className="mt-3 flex flex-wrap gap-3">
                {p.photos.map((photo) => (
                  <div key={photo.id} className="w-20">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className={`h-20 w-20 rounded-lg border border-border object-cover ${photo.removedAt ? 'opacity-30 grayscale' : ''}`} />
                      {photo.removedAt && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-critical">REMOVED</span>}
                    </div>
                    {!photo.removedAt && hasPerm(admin.role, 'users.action.removePhoto') && (
                      <ConfirmActionButton
                        label="Remove"
                        confirmTitle="Remove this photo"
                        endpoint={`/api/users/${user.id}/actions`}
                        extraBody={{ action: 'removePhoto', photoId: photo.id }}
                        tone="critical"
                      />
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {p && p.answers.length > 0 && (
            <Section title="Vybe Check answers">
              {p.answers.map((a) => (
                <Row key={a.id} label={a.prompt.text}>{a.answer}</Row>
              ))}
            </Section>
          )}

          <Section title={`Matches (${matches.length})`}>
            {matches.length === 0 ? (
              <p className="text-sm text-inkFaint">No matches.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="py-1.5">{m.other}</td>
                      <td className="py-1.5 text-inkSoft">{m.createdAt.toISOString().slice(0, 10)}</td>
                      <td className="py-1.5">{m.unmatchedAt ? <Badge tone="warning">Unmatched</Badge> : <Badge tone="success">Active</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Reports & blocks">
            <Row label="Likes sent">{likesSent}</Row>
            <Row label="Passes sent">{passesSent}</Row>
            <Row label="Blocks made">{blocksMade}</Row>
            <Row label="Blocked by others">{blocksReceived}</Row>
            <p className="mt-3 text-xs font-semibold text-inkFaint uppercase tracking-wide">Reports filed by this user ({reportsFiled.length})</p>
            {reportsFiled.map((r) => (
              <Row key={r.id} label={r.createdAt.toISOString().slice(0, 10)}>{r.reason} -- about {r.about.profile?.displayName ?? '—'}</Row>
            ))}
            <p className="mt-3 text-xs font-semibold text-inkFaint uppercase tracking-wide">Reports about this user ({reportsReceived.length})</p>
            {reportsReceived.map((r) => (
              <Row key={r.id} label={r.createdAt.toISOString().slice(0, 10)}>{r.reason} -- from {r.reporter.profile?.displayName ?? '—'}</Row>
            ))}
            {reportsFiled.length === 0 && reportsReceived.length === 0 && <p className="text-sm text-inkFaint">No reports.</p>}
          </Section>

          {moderationCases.length > 0 && (
            <Section title={`Moderation cases (${moderationCases.length})`}>
              {moderationCases.map((c) => (
                <Row key={c.id} label={c.category}>
                  <Link href={`/moderation/${c.id}`} className="text-brand hover:underline">
                    {c.status} · {c.severity} {c.assignee ? `· assigned to ${c.assignee.name}` : ''}
                  </Link>
                </Row>
              ))}
            </Section>
          )}

          <Section title="Support history">
            {supportTickets.length === 0 ? (
              <p className="text-sm text-inkFaint">No support tickets.</p>
            ) : (
              supportTickets.map((t) => (
                <Row key={t.id} label={t.createdAt.toISOString().slice(0, 10)}>
                  <Link href={`/support/${t.id}`} className="text-brand hover:underline">
                    {t.subject} · {t.status}
                  </Link>
                </Row>
              ))
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Login & session history">
            {loginEvents.length === 0 ? (
              <p className="text-sm text-inkFaint">No recorded logins yet.</p>
            ) : (
              loginEvents.map((e) => (
                <Row key={e.id} label={e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}>
                  {e.method} · {e.platform ?? 'web'}
                </Row>
              ))
            )}
          </Section>

          <Section title="Consent & privacy status">
            {consentRecords.length === 0 ? (
              <p className="text-sm text-inkFaint">No consent records yet.</p>
            ) : (
              consentRecords.slice(0, 8).map((c) => (
                <Row key={c.id} label={c.purpose}>
                  <Badge tone={c.status === 'GRANTED' ? 'success' : 'warning'}>{c.status}</Badge>
                </Row>
              ))
            )}
            {privacyRequests.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold text-inkFaint uppercase tracking-wide">Data-principal requests</p>
                {privacyRequests.map((r) => (
                  <Row key={r.id} label={r.type}>
                    <Link href={`/privacy/requests/${r.id}`} className="text-brand hover:underline">
                      {r.status}
                    </Link>
                  </Row>
                ))}
              </>
            )}
          </Section>

          <Section title="Audit history">
            {auditEntries.length === 0 ? (
              <p className="text-sm text-inkFaint">No admin actions recorded yet.</p>
            ) : (
              auditEntries.map((a) => (
                <Row key={a.id} label={a.createdAt.toISOString().slice(0, 16).replace('T', ' ')}>
                  {a.action} · {a.actorEmail}
                </Row>
              ))
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="text-inkFaint">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}
