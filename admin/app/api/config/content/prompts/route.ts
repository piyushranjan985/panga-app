import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  text: z.string().trim().min(1).max(300),
  emoji: z.string().trim().max(8).default(''),
  optionA: z.string().trim().max(100).default(''),
  optionB: z.string().trim().max(100).default(''),
});

export async function POST(req: Request) {
  const guard = await requirePermission('config.propose');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const prompt = await db.prompt.create({ data: parsed.data }).catch(() => null);
  if (!prompt) return NextResponse.json({ error: 'That prompt text already exists.' }, { status: 409 });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'config.content.prompt.create',
    category: 'config',
    targetType: 'Prompt',
    targetId: prompt.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ prompt });
}
