import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// Cap on how many User IDs a single search resolves to before being
// turned into an `in: [...]` filter elsewhere. High enough that a normal
// admin search (a specific phone number, email, or full name -- the
// things an admin actually has on hand when a user reports an issue)
// never gets truncated; just a backstop against a one-character query
// pulling in an unbounded fraction of the user base.
const MAX_MATCHES = 1000;

/**
 * The same free-text "name, email, phone, or user ID" OR clause the Users
 * page (admin/app/(console)/users/page.tsx) search box already uses,
 * factored out so every other admin page that lists records tied to a
 * specific app user -- moderation cases, reports, support tickets,
 * privacy requests, legal holds, consent records -- can filter by the
 * same three things an admin actually has on hand (a user's phone
 * number, their email, or their display name) instead of making them
 * detour through the Users page first to look up an internal ID.
 */
export function userSearchWhere(q: string): Prisma.UserWhereInput {
  const query = q.trim();
  return {
    OR: [
      { id: query },
      { phone: { contains: query } },
      { email: { contains: query, mode: 'insensitive' } },
      { profile: { displayName: { contains: query, mode: 'insensitive' } } },
    ],
  };
}

/**
 * Resolves a free-text query to the matching User IDs -- for a page whose
 * own model (ModerationCase.subjectUserId, Report.reporterId/aboutId,
 * SupportTicket.userId, ...) only holds a foreign key to User and can't
 * fold User/Profile fields into its own Prisma...WhereInput the way
 * userSearchWhere's OR clause can directly on the User model itself.
 * An empty/whitespace-only query resolves to no IDs (callers should treat
 * that as "no filter", not "match nothing" -- see each page's use of
 * this).
 */
export async function matchingUserIds(q: string): Promise<string[]> {
  const query = q.trim();
  if (!query) return [];
  const users = await db.user.findMany({ where: userSearchWhere(query), select: { id: true }, take: MAX_MATCHES });
  return users.map((u) => u.id);
}
