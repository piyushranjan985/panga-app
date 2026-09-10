import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

/**
 * Kicks off identity verification. In mock mode this just flips the profile
 * to PENDING then VERIFIED after a short delay, so the UI flow is real end
 * to end. Swap the mock branch for a KYC vendor webhook (Hyperverge, IDfy,
 * Signzy are common India-market choices) before launch — see .env.example.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const provider = process.env.VERIFICATION_PROVIDER ?? 'mock';

  await db.profile.update({ where: { userId: session.userId }, data: { verification: 'PENDING' } });

  if (provider === 'mock') {
    // Simulate an async KYC callback. A real integration would instead
    // return immediately here and update the record from a signed webhook.
    setTimeout(async () => {
      await db.profile
        .update({ where: { userId: session.userId }, data: { verification: 'VERIFIED' } })
        .catch(() => {});
    }, 4000);
  }

  return NextResponse.json({ ok: true, status: 'PENDING' });
}
