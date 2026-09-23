import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
  requestId: string;
}

// Every mutating admin API route calls this once and threads the result
// into writeAudit() -- see lib/audit.ts. requestId isn't taken from a
// client-supplied header (that could be spoofed to correlate/mislead an
// investigation later); it's generated fresh server-side per call.
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
  const userAgent = h.get('user-agent') || undefined;
  return { ip, userAgent, requestId: randomUUID() };
}
