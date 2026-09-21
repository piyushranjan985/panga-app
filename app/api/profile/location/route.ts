import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

// Opt-in location sharing, set from the Profile screen's "Location"
// section (browser Geolocation API). Separate from PUT /api/profile so
// sharing/clearing location never has to round-trip the whole profile
// form. Only ever exposed to other people as a rounded distance -- see
// lib/geo.ts -- never as these raw coordinates.
const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid location' }, { status: 400 });

  const profile = await db.profile.update({
    where: { userId: session.userId },
    data: { latitude: parsed.data.latitude, longitude: parsed.data.longitude, locationUpdatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, locationUpdatedAt: profile.locationUpdatedAt });
}

// Clears a previously shared location -- an explicit "stop sharing"
// action, not just letting it go stale.
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  await db.profile.update({
    where: { userId: session.userId },
    data: { latitude: null, longitude: null, locationUpdatedAt: null },
  });

  return NextResponse.json({ ok: true });
}
