import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { consumeOtp, maskDestination } from '@/lib/otp';
import { sendTransactionalEmail, isBrevoConfigured } from '@/lib/notifications/email';
import { raiseOpsAlert } from '@/lib/ops/alerts';

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().length(6),
});

/**
 * Verify half of ./request-otp -- see that route's doc comment.
 *
 * Also handles the CHANGE case (an already-verified email being
 * replaced, not just a grandfathered account adding one for the first
 * time): once the swap succeeds, the OLD address gets a plain security
 * notice -- "your findmyVybe email was changed, if this wasn't you
 * contact support" -- fired via next/server's after() so a slow/failed
 * Brevo call can't delay or break the response the user is waiting on.
 * This is the one channel available for that notice (there's no
 * free-text SMS transport in this app -- lib/notifications/sms*.ts are
 * OTP-template-only, see their doc comments), which is exactly why it's
 * worth getting right: it's the one tripwire a session-hijacker
 * changing this value doesn't get to silence. A failed SEND of that
 * notice (not the routine change itself) raises a SECURITY ops alert --
 * see lib/ops/alerts.ts's doc comment for why a routine successful
 * change never does.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }
  const { email, code } = parsed.data;

  // Snapshot the pre-change value BEFORE the update below overwrites it --
  // this is the only chance to know what (if anything) to notify.
  const previous = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true, emailVerified: true },
  });

  const result = await consumeOtp(session.userId, code, 'email');
  if (!result.ok) {
    if (result.reason === 'provider_not_configured') {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable — please try again shortly.' }, { status: 503 });
    }
    if (result.reason === 'too_many_attempts') {
      return NextResponse.json({ error: 'Too many wrong guesses for that code — request a new one.' }, { status: 429 });
    }
    const detail =
      process.env.NODE_ENV === 'development'
        ? ` (dev detail: ${result.reason} -- see lib/otp.ts's consumeOtp doc comment)`
        : '';
    return NextResponse.json({ error: `That code is wrong or expired.${detail}` }, { status: 401 });
  }

  try {
    await db.user.update({ where: { id: session.userId }, data: { email, emailVerified: true } });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: 'That email is already linked to a different account.' }, { status: 409 });
    }
    throw err;
  }

  const isChange = Boolean(previous?.email && previous.emailVerified && previous.email !== email);
  if (isChange && previous?.email) {
    const oldEmail = previous.email;
    after(async () => {
      if (!isBrevoConfigured()) {
        console.warn(
          `[profile/email] email changed to ${maskDestination('email', email)} for user ${session.userId} ` +
            'but Brevo is not configured -- no security notice sent to the old address.',
        );
        return;
      }
      try {
        await sendTransactionalEmail({
          to: oldEmail,
          subject: 'Your findmyVybe email address was changed',
          text:
            `Your findmyVybe account's email was just changed to ${maskDestination('email', email)}.\n\n` +
            'If this was you, no action is needed.\n\n' +
            "If it WASN'T you, someone may have access to your account -- contact support@findmyvybe.com right away.",
          html:
            `<p>Your findmyVybe account's email was just changed to <strong>${maskDestination('email', email)}</strong>.</p>` +
            '<p>If this was you, no action is needed.</p>' +
            "<p>If it <strong>wasn't</strong> you, someone may have access to your account -- contact " +
            '<a href="mailto:support@findmyvybe.com">support@findmyvybe.com</a> right away.</p>',
        });
      } catch (err) {
        console.error('[profile/email] failed to send change-notice to old email', err);
        await raiseOpsAlert({
          category: 'SECURITY',
          severity: 'WARNING',
          title: 'Account-change security notice failed to send',
          detail: `Brevo send of an email-change notice failed for user ${session.userId}: ${err instanceof Error ? err.message : String(err)}`,
          sourceType: 'system',
          fingerprint: 'integration:profile-change-notify-email',
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
