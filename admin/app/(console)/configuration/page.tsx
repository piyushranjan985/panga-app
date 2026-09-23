import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import ProposeFeatureFlagForm from '@/components/ProposeFeatureFlagForm';
import ProposeNotificationTemplateForm from '@/components/ProposeNotificationTemplateForm';
import ConfigApprovalControls from '@/components/ConfigApprovalControls';
import QuickAddContentForm from '@/components/QuickAddContentForm';
import { hasPermission } from '@/lib/rbac';

export default async function ConfigurationPage() {
  const admin = await requirePageAccess('config.view');
  const canPropose = hasPermission(admin.role, 'config.propose');
  const canApprove = hasPermission(admin.role, 'config.approve');

  const [pending, flags, templates, interests, tribes, prompts] = await Promise.all([
    db.appConfigChange.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { proposedBy: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.featureFlag.findMany({ orderBy: { key: 'asc' } }),
    db.notificationTemplate.findMany({ orderBy: { key: 'asc' } }),
    db.interest.findMany({ orderBy: { label: 'asc' }, take: 60 }),
    db.tribe.findMany({ orderBy: { label: 'asc' }, take: 60 }),
    db.prompt.findMany({ orderBy: { text: 'asc' }, take: 60 }),
  ]);

  const maintenanceFlag = flags.find((f) => f.key === 'maintenance_mode');

  return (
    <div>
      <PageHeader title="Configuration & Feature Management" description="Feature flags, maintenance mode, and notification templates go through a propose-then-approve workflow; reference content (interests, tribes, prompts) is plain audit-logged CRUD." />
      <div className="space-y-8 p-8">
        {canApprove && (
          <section>
            <h2 className="mb-3 text-sm font-bold">Pending approvals</h2>
            {pending.length === 0 ? (
              <EmptyState title="Nothing waiting on review" />
            ) : (
              <div className="space-y-2">
                {pending.map((c) => (
                  <div key={c.id} className="rounded-card border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{c.configKey}</p>
                        <p className="text-xs text-inkFaint">Proposed by {c.proposedBy.name} on {c.createdAt.toISOString().slice(0, 10)}</p>
                      </div>
                      <ConfigApprovalControls changeId={c.id} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <pre className="overflow-x-auto rounded-lg bg-canvas p-2 text-inkFaint">{JSON.stringify(c.previousValue ?? {}, null, 2)}</pre>
                      <pre className="overflow-x-auto rounded-lg bg-successSoft p-2 text-success">{JSON.stringify(c.proposedValue, null, 2)}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Maintenance mode</h2>
            {canPropose && (
              <ProposeFeatureFlagForm
                existingKey="maintenance_mode"
                existingLabel={maintenanceFlag?.label ?? 'Maintenance mode'}
                existingEnabled={maintenanceFlag?.enabled ?? false}
                existingRolloutPercent={maintenanceFlag?.rolloutPercent ?? 100}
              />
            )}
          </div>
          <div className="rounded-card border border-border bg-surface p-4 text-sm">
            <Badge tone={maintenanceFlag?.enabled ? 'critical' : 'success'}>{maintenanceFlag?.enabled ? 'ON' : 'OFF'}</Badge>
            <p className="mt-2 text-xs text-inkFaint">Not yet wired into the consumer app's runtime -- this records intent and goes through approval, the same as any other feature flag.</p>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Feature flags</h2>
            {canPropose && <ProposeFeatureFlagForm />}
          </div>
          {flags.filter((f) => f.key !== 'maintenance_mode').length === 0 ? (
            <EmptyState title="No feature flags defined yet" />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                  <tr>
                    <th className="px-4 py-2.5">Key</th>
                    <th className="px-4 py-2.5">Label</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Rollout</th>
                    {canPropose && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {flags.filter((f) => f.key !== 'maintenance_mode').map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5 font-mono text-xs">{f.key}</td>
                      <td className="px-4 py-2.5">{f.label}</td>
                      <td className="px-4 py-2.5"><Badge tone={f.enabled ? 'success' : 'default'}>{f.enabled ? 'Enabled' : 'Disabled'}</Badge></td>
                      <td className="px-4 py-2.5 text-inkSoft">{f.rolloutPercent}%</td>
                      {canPropose && (
                        <td className="px-4 py-2.5">
                          <ProposeFeatureFlagForm existingKey={f.key} existingLabel={f.label} existingEnabled={f.enabled} existingRolloutPercent={f.rolloutPercent} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Notification templates</h2>
            {canPropose && <ProposeNotificationTemplateForm />}
          </div>
          {templates.length === 0 ? (
            <EmptyState title="No templates defined yet" description="e.g. account.suspended, privacy.deletion.completed" />
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-card border border-border bg-surface p-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold">{t.key} <span className="text-inkFaint">({t.channel})</span></p>
                    {t.subject && <p className="mt-1 text-sm font-semibold">{t.subject}</p>}
                    <p className="mt-1 truncate text-sm text-inkSoft">{t.body}</p>
                  </div>
                  {canPropose && <ProposeNotificationTemplateForm existingKey={t.key} existingChannel={t.channel} existingSubject={t.subject} existingBody={t.body} />}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold">Reference content</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <ContentCard title={`Interests (${interests.length})`}>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-inkSoft">
                {interests.map((i) => <li key={i.id}>{i.emoji} {i.label}</li>)}
              </ul>
              {canPropose && <QuickAddContentForm endpoint="/api/config/content/interests" label="Add interest" fields={[{ name: 'label', placeholder: 'Label', required: true }, { name: 'emoji', placeholder: 'Emoji' }]} />}
            </ContentCard>
            <ContentCard title={`Tribes (${tribes.length})`}>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-inkSoft">
                {tribes.map((t) => <li key={t.id}>{t.emoji} {t.label}</li>)}
              </ul>
              {canPropose && <QuickAddContentForm endpoint="/api/config/content/tribes" label="Add tribe" fields={[{ name: 'slug', placeholder: 'slug', required: true }, { name: 'label', placeholder: 'Label', required: true }, { name: 'emoji', placeholder: 'Emoji' }]} />}
            </ContentCard>
            <ContentCard title={`Prompts (${prompts.length})`}>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-inkSoft">
                {prompts.map((p) => <li key={p.id}>{p.emoji} {p.text}</li>)}
              </ul>
              {canPropose && <QuickAddContentForm endpoint="/api/config/content/prompts" label="Add prompt" fields={[{ name: 'text', placeholder: 'Prompt text', required: true }, { name: 'optionA', placeholder: 'Option A' }, { name: 'optionB', placeholder: 'Option B' }, { name: 'emoji', placeholder: 'Emoji' }]} />}
            </ContentCard>
          </div>
        </section>
      </div>
    </div>
  );
}

function ContentCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="mb-2 font-semibold">{title}</p>
      {children}
    </div>
  );
}
