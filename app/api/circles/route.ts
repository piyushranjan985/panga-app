import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

// Reference data for onboarding pick-lists: all circles + interests.
// Small enough at this scale to return in one payload; paginate once
// circle count moves into the hundreds (see scaling notes in the doc).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [circles, interests, prompts] = await Promise.all([
    db.circle.findMany({ orderBy: { name: 'asc' } }),
    db.interest.findMany({ orderBy: { label: 'asc' } }),
    db.prompt.findMany({ where: { active: true }, orderBy: { text: 'asc' } }),
  ]);

  return NextResponse.json({ circles, interests, prompts });
}
