import { db } from '@/lib/db';
import type { AppConfigChange } from '@prisma/client';

// The handful of settings the spec calls out as needing a second pair of
// eyes before taking effect: feature flags (including "maintenance mode",
// which is just a feature flag keyed "maintenance_mode" -- no separate
// model needed) and global notification templates. Routine content
// (Interests/Tribes/Prompts) deliberately bypasses this and goes through
// plain audit-logged CRUD instead -- see app/api/config/content/*.
//
// Design note: this build has exactly one admin (the account holder, seeded
// as SUPER_ADMIN -- see the "just me for now, build full RBAC for later"
// decision), so nothing here stops the same admin from proposing AND
// approving their own change. A real separation-of-duties check (reject if
// reviewedById === proposedById) is one `if` away once a second admin
// exists -- deliberately not added yet so the only admin isn't locked out
// of their own approval queue.
export function parseConfigKey(configKey: string): { kind: 'featureFlag' | 'notificationTemplate' | 'unknown'; key: string } {
  if (configKey.startsWith('featureFlag:')) return { kind: 'featureFlag', key: configKey.slice('featureFlag:'.length) };
  if (configKey.startsWith('notificationTemplate:')) return { kind: 'notificationTemplate', key: configKey.slice('notificationTemplate:'.length) };
  return { kind: 'unknown', key: configKey };
}

export async function readCurrentConfigValue(configKey: string): Promise<unknown> {
  const { kind, key } = parseConfigKey(configKey);
  if (kind === 'featureFlag') {
    const flag = await db.featureFlag.findUnique({ where: { key } });
    return flag ? { label: flag.label, description: flag.description, enabled: flag.enabled, rolloutPercent: flag.rolloutPercent } : null;
  }
  if (kind === 'notificationTemplate') {
    const tpl = await db.notificationTemplate.findUnique({ where: { key } });
    return tpl ? { channel: tpl.channel, subject: tpl.subject, body: tpl.body } : null;
  }
  return null;
}

// Applies an already-approved change to the real row it describes.
// Deliberately synchronous with approval (no separate "deploy" step) --
// this is a database write, not an infrastructure rollout, so there is
// nothing to hold the APPROVED state open for. NOTE: neither FeatureFlag
// nor NotificationTemplate is read by the consumer app yet -- wiring
// actual runtime checks (e.g. a maintenance-mode gate, templated
// notification sends) into that app is follow-up work outside this
// portal's own scope.
export async function applyConfigChange(change: AppConfigChange) {
  const { kind, key } = parseConfigKey(change.configKey);
  const value = change.proposedValue as Record<string, unknown>;

  if (kind === 'featureFlag') {
    await db.featureFlag.upsert({
      where: { key },
      create: {
        key,
        label: (value.label as string) || key,
        description: (value.description as string) || '',
        enabled: Boolean(value.enabled),
        rolloutPercent: typeof value.rolloutPercent === 'number' ? value.rolloutPercent : 100,
        updatedById: change.reviewedById ?? undefined,
      },
      update: {
        enabled: Boolean(value.enabled),
        rolloutPercent: typeof value.rolloutPercent === 'number' ? value.rolloutPercent : 100,
        updatedById: change.reviewedById ?? undefined,
      },
    });
  } else if (kind === 'notificationTemplate') {
    await db.notificationTemplate.upsert({
      where: { key },
      create: {
        key,
        channel: (value.channel as string) || 'in_app',
        subject: (value.subject as string) || undefined,
        body: (value.body as string) || '',
        updatedById: change.reviewedById ?? undefined,
      },
      update: {
        channel: (value.channel as string) || 'in_app',
        subject: (value.subject as string) || undefined,
        body: (value.body as string) || '',
        updatedById: change.reviewedById ?? undefined,
      },
    });
  }
}
