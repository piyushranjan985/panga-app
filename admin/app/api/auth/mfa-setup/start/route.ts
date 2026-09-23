import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateMfaSecret, mfaQrCodeDataUrl } from '@/lib/mfa';
import { readPendingMfaAdminId } from '@/lib/pendingMfa';

// First login (or any admin whose MFA got reset) is routed here instead of
// letting MFA stay optional -- "Separate admin login + MFA" isn't
// meaningful if it can be skipped indefinitely. Generates and stores a new
// secret immediately (mfaEnabled stays false until /confirm verifies a
// real code from it), so re-calling this just issues a fresh QR code.
export async function POST() {
  const adminId = await readPendingMfaAdminId();
  if (!adminId) {
    return NextResponse.json({ error: 'Your sign-in attempt expired. Start over.' }, { status: 401 });
  }
  const admin = await db.adminUser.findUnique({ where: { id: adminId } });
  if (!admin || !admin.isActive) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 401 });
  }
  if (admin.mfaEnabled) {
    return NextResponse.json({ error: 'MFA is already set up -- sign in normally.' }, { status: 400 });
  }

  const secret = generateMfaSecret();
  await db.adminUser.update({ where: { id: admin.id }, data: { mfaSecret: secret } });
  const qrCodeDataUrl = await mfaQrCodeDataUrl(admin.email, secret);

  return NextResponse.json({ qrCodeDataUrl, secret });
}
