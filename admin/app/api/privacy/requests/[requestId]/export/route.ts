import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { compileUserDataExport } from '@/lib/privacyExport';

// On-demand JSON export for an ACCESS / PORTABILITY request -- generated
// fresh on each download rather than pre-built and stored (no blob
// storage wired up for this), streamed straight to the admin handling the
// request. Every download is its own audit entry, same bar as unmasking a
// user's PII.
export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const guard = await requirePermission('privacy.requests.handle');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { requestId } = await params;

  const request = await db.privacyRequest.findUnique({ where: { id: requestId } });
  if (!request) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!request.userId) return NextResponse.json({ error: 'This request has no matched account to export.' }, { status: 400 });
  if (request.type !== 'ACCESS' && request.type !== 'PORTABILITY') {
    return NextResponse.json({ error: 'Only ACCESS and PORTABILITY requests support a data export.' }, { status: 400 });
  }

  const data = await compileUserDataExport(request.userId);
  if (!data) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.request.export',
    category: 'privacy',
    targetType: 'PrivacyRequest',
    targetId: requestId,
    newValue: { userId: request.userId, requestType: request.type },
    context: await getRequestContext(),
  });

  const body = JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="findmyvybe-data-export-${request.userId}.json"`,
    },
  });
}
