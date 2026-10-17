import { db } from '@/lib/db';

// Shared age-range filter for admin list pages -- added alongside the
// "soft ranking signal" age range on Profile (see
// prisma/schema.prisma's Profile.ageMin/ageMax doc comment and
// lib/matching.ts's file-level comment). That one nudges Discover's
// ranking and never hides anyone; this one is the opposite kind of
// thing on purpose -- an admin typing "40-60" into a list page wants a
// genuine hard filter, the same way the q search here is a hard filter
// too. There's no stored/cached age anywhere (see lib/age.ts's
// comment), so this translates the range into a dateOfBirth window and
// filters at the query level instead of computing age in JS, so every
// page using it can still paginate/count with a normal Prisma `where`.

// Same backstop as userSearch.ts's MAX_MATCHES, same reason: a wide
// range (or a sloppy min > max typed in) could otherwise resolve to most
// of the user base.
const MAX_MATCHES = 1000;

/** Parses one "min" or "max" query-string value, discarding anything outside the platform's 18-99 adult range. */
export function parseAgeBound(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 18 && n <= 99 ? n : undefined;
}

/**
 * Converts an inclusive [ageMin, ageMax] age range (in whole years, as of
 * `asOf`) into the dateOfBirth window that produces it, using the exact
 * same year/month/day comparison as lib/age.ts's ageFromDateOfBirth:
 * someone turns ageMin on dateOfBirth + ageMin years, so they're at
 * least that old from that date on (dateOfBirth <= asOf - ageMin years);
 * they stop being ageMax-or-younger the instant they turn ageMax + 1
 * (dateOfBirth > asOf - (ageMax + 1) years). Returns undefined when
 * neither bound is set, meaning "don't filter by age" -- callers should
 * treat that as "no filter", not "match nobody".
 */
export function ageRangeToDobWindow(
  ageMin: number | undefined,
  ageMax: number | undefined,
  asOf: Date = new Date(),
): { lte?: Date; gt?: Date } | undefined {
  if (ageMin == null && ageMax == null) return undefined;
  const window: { lte?: Date; gt?: Date } = {};
  if (ageMin != null) {
    const d = new Date(asOf);
    d.setFullYear(d.getFullYear() - ageMin);
    window.lte = d;
  }
  if (ageMax != null) {
    const d = new Date(asOf);
    d.setFullYear(d.getFullYear() - (ageMax + 1));
    window.gt = d;
  }
  return window;
}

/**
 * Resolves an age range to the matching User IDs -- for pages whose own
 * model only holds a foreign key to User (ModerationCase.subjectUserId,
 * Report.reporterId/aboutId, SupportTicket.userId, ...) and can't filter
 * by Profile fields directly the way admin/app/(console)/users/page.tsx
 * can (it queries the User model itself, so it uses ageRangeToDobWindow
 * on `profile.dateOfBirth` without this extra lookup). Returns undefined
 * when neither bound is set, same "no filter" convention as
 * ageRangeToDobWindow and matchingUserIds in userSearch.ts.
 */
export async function matchingUserIdsByAge(ageMin: number | undefined, ageMax: number | undefined): Promise<string[] | undefined> {
  const window = ageRangeToDobWindow(ageMin, ageMax);
  if (!window) return undefined;
  const users = await db.user.findMany({ where: { profile: { dateOfBirth: window } }, select: { id: true }, take: MAX_MATCHES });
  return users.map((u) => u.id);
}
