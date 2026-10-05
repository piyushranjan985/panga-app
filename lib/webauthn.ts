/**
 * Passkey (WebAuthn) helpers -- see docs/PHONE_FIRST_AUTH.md. Unlike
 * Google/Apple sign-in, this needs no third-party account, API key, or
 * cost at any volume -- WebAuthn is a browser/OS standard, not a hosted
 * service. @simplewebauthn/server does the actual cryptographic
 * verification; everything here is just this app's rpID/origin config
 * and a couple of small conveniences around it.
 */

/** User-visible relying-party name, shown in the OS's passkey prompt. */
export const WEBAUTHN_RP_NAME = 'findmyVybe';

/**
 * A WebAuthn credential is scoped to an "RP ID" -- a registrable domain,
 * never a full origin. Browsers treat a credential registered for
 * "findmyvybe.com" as valid on ANY subdomain of it too (dev.findmyvybe.com
 * included), so this always strips a leading "dev." rather than returning
 * two different RP IDs for the two real hosts -- one passkey then works
 * on both findmyvybe.com and dev.findmyvybe.com. localhost can't share an
 * RP ID with a real domain at all (it isn't a subdomain of one), so local
 * dev gets its own value.
 */
export function webauthnRpID(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    host = 'localhost';
  }
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
  return host.replace(/^dev\./, '');
}

/**
 * expectedOrigin at verify time must match the exact origin the browser
 * actually made the WebAuthn call from -- protocol + host + port, no
 * wildcarding. Lists every real host this app is known to run on
 * (NEXT_PUBLIC_APP_URL, plus its "dev." counterpart if it isn't already
 * one) and localhost for local dev, rather than trying to derive the
 * "other" subdomain generically.
 */
export function webauthnExpectedOrigins(): string[] {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const origins = new Set<string>([configured, 'http://localhost:3000']);
  try {
    const url = new URL(configured);
    if (!url.hostname.startsWith('dev.') && url.hostname !== 'localhost') {
      origins.add(`${url.protocol}//dev.${url.hostname}`);
    }
  } catch {
    // configured wasn't a real URL -- localhost is already in the set above
  }
  return Array.from(origins);
}

/**
 * Crude, good-enough-for-a-label UA sniff -- same spirit (and same
 * "rough but good enough" tolerance) as lib/session.ts's platform
 * detection for LoginEvent. Only ever shown back to the credential's own
 * owner on their "Manage passkeys" list, so a slightly-wrong guess (an
 * unfamiliar browser, a UA string some extension rewrote) just means a
 * slightly-wrong label, not a security decision.
 */
export function labelFromUserAgent(userAgent: string | null | undefined): string {
  const ua = (userAgent || '').toLowerCase();
  let browser = 'a browser';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/') && !ua.includes('chromium')) browser = 'Chrome';
  else if (ua.includes('crios/')) browser = 'Chrome';
  else if (ua.includes('fxios/') || ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari';

  let os = 'your device';
  if (ua.includes('iphone')) os = 'iPhone';
  else if (ua.includes('ipad')) os = 'iPad';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('mac os')) os = 'Mac';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('linux')) os = 'Linux';

  return `${browser} on ${os}`;
}
