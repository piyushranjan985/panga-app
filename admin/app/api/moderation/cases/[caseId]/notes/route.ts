import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const guard = await requirePermission('moderation.assign');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { caseId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a note.' }, { status: 400 });

  const note = await db.moderationNote.create({ data: { caseId, authorId: admin.id, body: parsed.data.body } });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'moderation.case.note_added',
    category: 'moderation',
    targetType: 'ModerationCase',
    targetId: caseId,
    newValue: { noteId: note.id },
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
