/**
 * Shared "how old is this person today" helper. Profile.dateOfBirth is the
 * only age-related field in the schema (see prisma/schema.prisma) -- there
 * is no stored/cached age anywhere, so anything that needs to filter or
 * display by age (currently just app/api/discover/search/route.ts) computes
 * it fresh from dateOfBirth rather than trusting a value that could go
 * stale a user's actual birthday.
 */
export function ageFromDateOfBirth(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}
