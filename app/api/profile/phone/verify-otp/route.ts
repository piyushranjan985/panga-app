import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { consumeOtp, maskDestination } from '@/lib/otp';
import { sendTransactionalEmail, isBrevoConfigured } from '@/lib/notifications/email';
import { raiseOpsAlert } from '@/lib/ops/alerts';

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210'),
  code: z.string().trim().length(6),
});

/**
 * Verify half of ./request-otp -- see that route's doc comment.
 *
 * Also handles the CHANGE case (an already-verified phone being
 * replaced, not just a grandfathered account adding one for the first
 * time). Unlike the email route's twin of this comment, there's no
 * free-text SMS transport in this app to notify the OLD number with
 * (lib/notifications/sms*.ts are OTP-template-only -- see their doc
 * comments) -- so the one channel available for a "your number
 * changed, wasn't you? contact support" notice is the account's
 * verified EMAIL, when it has one. A grandfathered phone-only account
 * with no verified email on file gets no notice at all on a phone
 * change; that gap is only console-logged, not ops-alerted, since it
 * isn't a failure of anything -- see lib/ops/alerts.ts's doc comment
 * for why a routine event (as opposed to a failed SEND of a notice)
 * never raises one.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 });
  }
  const { phone, code } = parsed.data;

  // Snapshot the pre-change value BEFORE the update below overwrites it --
  // this is the only chance to know what (if anything) to notify.
  const previous = await db.user.findUnique({
    where: { id: session.userId },
    select: { phone: true, phoneVerified: true, email: true, emailVerified: true },
  });

  const result = await consumeOtp(session.userId, code, 'phone');
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
    await db.user.update({ where: { id: session.userId }, data: { phone, phoneVerified: true } });
  } catch (err: unknown) {
    // A race: someone else attached this exact number between the
    // request-otp uniqueness check and this write finishing.
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: "That number's already linked to a different account." }, { status: 409 });
    }
    throw err;
  }

  const isChange = Boolean(previous?.phone && previous.phoneVerified && previous.phone !== phone);
  if (isChange) {
    const alertEmail = previous?.email && previous.emailVerified ? previous.email : null;
    after(async () => {
      if (!alertEmail) {
        console.warn(
          `[profile/phone] phone changed to ${maskDestination('phone', phone)} for user ${session.userId} ` +
            '-- no verified email on file to send a security notice to.',
        );
        return;
      }
      if (!isBrevoConfigured()) {
        console.warn(
          `[profile/phone] phone changed to ${maskDestination('phone', phone)} for user ${session.userId} ` +
            'but Brevo is not configured -- no security notice sent.',
        );
        return;
      }
      try {
        await sendTransactionalEmail({
          to: alertEmail,
          subject: 'Your findmyVybe phone number was changed',
          text:
            `Your findmyVybe account's phone number was just changed to ${maskDestination('phone', phone)}.\n\n` +
            'If this was you, no action is needed.\n\n' +
            "If it WASN'T you, someone may have access to your account -- contact support@findmyvybe.com right away.",
          html:
            `<p>Your findmyVybe account's phone number was just changed to <strong>${maskDestination('phone', phone)}</strong>.</p>` +
            '<p>If this was you, no action is needed.</p>' +
            "<p>If it <strong>wasn't</strong> you, someone may have access to your account -- contact " +
            '<a href="mailto:support@findmyvybe.com">support@findmyvybe.com</a> right away.</p>',
        });
      } catch (err) {
        console.error('[profile/phone] failed to send change-notice email', err);
        await raiseOpsAlert({
          category: 'SECURITY',
          severity: 'WARNING',
          title: 'Account-change security notice failed to send',
          detail: `Brevo send of a phone-change notice failed for user ${session.userId}: ${err instanceof Error ? err.message : String(err)}`,
          sourceType: 'system',
          fingerprint: 'integration:profile-change-notify-email',
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
