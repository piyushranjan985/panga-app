import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

// Reference data for onboarding pick-lists: interests, prompts, tribes +
// their sub-communities, and relationship styles. Small enough at this
// scale to return in one payload; paginate once it moves into the
// hundreds (see scaling notes in the doc).
//
// Formerly /api/circles -- renamed once the Circles feature was removed,
// since this endpoint was never really "about circles," it just happened
// to be the first thing it served.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [interests, prompts, tribes, subCommunities, relationshipStyles] = await Promise.all([
    db.interest.findMany({ orderBy: { label: 'asc' } }),
    db.prompt.findMany({ where: { active: true }, orderBy: { text: 'asc' } }),
    db.tribe.findMany({ orderBy: { label: 'asc' } }),
    db.subCommunity.findMany({ orderBy: { label: 'asc' } }),
    db.relationshipStyle.findMany({ orderBy: { label: 'asc' } }),
  ]);

  return NextResponse.json({ interests, prompts, tribes, subCommunities, relationshipStyles });
}
