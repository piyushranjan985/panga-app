import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { parseConfigKey, readCurrentConfigValue } from '@/lib/configApproval';

const bodySchema = z.object({
  configKey: z.string().trim().min(1).max(200),
  proposedValue: z.record(z.string(), z.unknown()),
});

// Proposes a feature-flag or notification-template change into the
// PENDING_APPROVAL queue -- it does not take effect until a
// config.approve holder reviews it (see .../[changeId]/review/route.ts).
export async function POST(req: Request) {
  const guard = await requirePermission('config.propose');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const { kind } = parseConfigKey(parsed.data.configKey);
  if (kind === 'unknown') {
    return NextResponse.json({ error: 'configKey must be prefixed featureFlag: or notificationTemplate:' }, { status: 400 });
  }

  const previousValue = await readCurrentConfigValue(parsed.data.configKey);

  const change = await db.appConfigChange.create({
    data: {
      configKey: parsed.data.configKey,
      previousValue: previousValue === null ? undefined : (previousValue as object),
      proposedValue: parsed.data.proposedValue as object,
      proposedById: admin.id,
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'config.change.propose',
    category: 'config',
    targetType: 'AppConfigChange',
    targetId: change.id,
    previousValue: previousValue ?? undefined,
    newValue: parsed.data.proposedValue,
    context: await getRequestContext(),
  });

  return NextResponse.json({ change });
}
