import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ISSUER = process.env.ADMIN_MFA_ISSUER || 'VybeMatch Admin';

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export async function mfaQrCodeDataUrl(email: string, secret: string): Promise<string> {
  const otpauth = authenticator.keyuri(email, ISSUER, secret);
  return QRCode.toDataURL(otpauth);
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

// 10 single-use recovery codes, shown once at MFA setup, stored as bcrypt
// hashes (mfaRecoveryCodes on AdminUser) so a database read alone can't be
// used to sign in -- same reasoning as a password.
export async function generateRecoveryCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain = Array.from({ length: 10 }, () => randomBytes(5).toString('hex'));
  const hashed = await Promise.all(plain.map((code) => bcrypt.hash(code, 10)));
  return { plain, hashed };
}

export async function consumeRecoveryCode(code: string, hashedCodes: string[]): Promise<string[] | null> {
  for (const hashed of hashedCodes) {
    if (await bcrypt.compare(code, hashed)) {
      return hashedCodes.filter((h) => h !== hashed);
    }
  }
  return null;
}
