import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// How long an expired OtpCode row sticks around before being purged --
// not deleted the instant it expires, so a brief look at "what just
// happened" (e.g. while debugging a user's failed sign-in, or reading
// the [otp-abuse]/[otp-cost] log lines against what's still in the
// table) has a short window to work with. See docs/OTP_SECURITY.md §7.
const RETENTION_HOURS = 24;

/**
 * Deletes OtpCode rows that expired more than RETENTION_HOURS ago --
 * "clean up expired OTP records automatically," per the original ask.
 * Same CRON_SECRET bearer-auth pattern as
 * app/api/cron/mystery-match/route.ts; see vercel.json for the schedule.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured; refusing to run unauthenticated.' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
  const { count } = await db.otpCode.deleteMany({ where: { expiresAt: { lt: cutoff } } });

  return NextResponse.json({ ok: true, deleted: count });
}
