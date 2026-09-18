import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

// Reference data for onboarding pick-lists: circles, interests, prompts,
// tribes + their sub-communities, and relationship styles. Small enough
// at this scale to return in one payload; paginate once it moves into
// the hundreds (see scaling notes in the doc).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [circles, interests, prompts, tribes, subCommunities, relationshipStyles] = await Promise.all([
    db.circle.findMany({ orderBy: { name: 'asc' } }),
    db.interest.findMany({ orderBy: { label: 'asc' } }),
    db.prompt.findMany({ where: { active: true }, orderBy: { text: 'asc' } }),
    db.tribe.findMany({ orderBy: { label: 'asc' } }),
    db.subCommunity.findMany({ orderBy: { label: 'asc' } }),
    db.relationshipStyle.findMany({ orderBy: { label: 'asc' } }),
  ]);

  return NextResponse.json({ circles, interests, prompts, tribes, subCommunities, relationshipStyles });
}
