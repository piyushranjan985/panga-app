import { NextResponse } from 'next/server';
import { getCurrentAdmin, destroyCurrentSession } from '@/lib/session';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

export async function POST() {
  const current = await getCurrentAdmin();
  await destroyCurrentSession();
  if (current) {
    await writeAudit({
      actorId: current.admin.id,
      actorEmail: current.admin.email,
      action: 'auth.logout',
      category: 'auth',
      targetType: 'AdminUser',
      targetId: current.admin.id,
      context: await getRequestContext(),
    });
  }
  return NextResponse.json({ ok: true });
}
