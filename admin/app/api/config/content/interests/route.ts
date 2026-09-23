import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ label: z.string().trim().min(1).max(100), emoji: z.string().trim().max(8).default('') });

// Reference/tag data (Interest/Tribe/Prompt), not a sensitive-permission
// action -- plain audit-logged CRUD, no approval queue, per the schema's
// own comment distinguishing these from feature flags / templates.
export async function POST(req: Request) {
  const guard = await requirePermission('config.propose');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const interest = await db.interest.create({ data: parsed.data }).catch(() => null);
  if (!interest) return NextResponse.json({ error: 'An interest with that label already exists.' }, { status: 409 });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'config.content.interest.create',
    category: 'config',
    targetType: 'Interest',
    targetId: interest.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ interest });
}
