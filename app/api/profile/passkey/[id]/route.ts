import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

/** Removes one of the signed-in user's own passkeys -- never anyone else's. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { id } = await params;

  const result = await db.webAuthnCredential.deleteMany({ where: { id, userId: session.userId } });
  if (result.count === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
