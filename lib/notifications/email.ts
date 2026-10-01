/**
 * Transactional email via Brevo (formerly Sendinblue) -- picked for
 * lib/otp.ts's email-OTP channel specifically because its free tier (300
 * emails/day, no card required, no expiry -- as of researching this in
 * 2026) is the most generous ongoing-free option of the usual choices
 * (Resend: 3,000/month; Postmark: 100/month; Amazon SES: no longer has a
 * meaningful perpetual free tier for new accounts), and a dating app's
 * email-OTP volume realistically fits inside it well past an early
 * launch. REST API, not SMTP -- no new npm dependency needed, same
 * "~4 fetches" shape as lib/auth/googleOAuth.ts and
 * lib/safety/identityVerification.ts's DigiLocker calls elsewhere in
 * this codebase.
 *
 * SETUP (the one part that can't happen from this codebase): create a
 * free account at app.brevo.com, verify a sender email/domain under
 * Senders & IP > Senders (an unverified sender will have its mail
 * rejected or spam-foldered), then grab an API key under Settings > SMTP
 * & API > API Keys. Set BREVO_API_KEY and BREVO_SENDER_EMAIL (the
 * verified address) -- BREVO_SENDER_NAME is optional, defaults below.
 */

export function isBrevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export class EmailSendError extends Error {}

/**
 * Sends one transactional email via Brevo's REST API
 * (https://api.brevo.com/v3/smtp/email). Throws EmailSendError on any
 * non-2xx response or network failure -- callers decide what that means
 * for them (lib/otp.ts treats it as a failed OTP issuance, not a silent
 * success).
 */
export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new EmailSendError('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL missing).');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || 'findmyVybe' },
      to: [{ email: params.to }],
      subject: params.subject,
      textContent: params.text,
      htmlContent: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EmailSendError(`Brevo send failed (${res.status}): ${body}`);
  }
}
