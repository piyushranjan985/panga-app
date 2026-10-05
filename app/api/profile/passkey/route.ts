import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

/** Lists the signed-in user's own passkeys for Profile settings' "Manage passkeys" section. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const credentials = await db.webAuthnCredential.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
  });

  return NextResponse.json({ credentials });
}
