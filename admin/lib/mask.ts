// "Mask personal data by default" (spec, User Management section) -- these
// are the only place email/phone/DOB ever get formatted for display.
// Every page passes the raw value through here unless the viewer has
// already unmasked it for this page load (see components/UnmaskButton.tsx
// + app/api/users/[userId]/pii/route.ts, which is what's actually
// permission-checked and audit-logged -- these functions are just string
// formatting, not the security boundary).
export function maskEmail(email: string | null): string {
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain || !user) return '•••';
  const visible = user.slice(0, 1);
  return `${visible}${'•'.repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

export function maskPhone(phone: string | null): string {
  if (!phone) return '—';
  const visible = phone.slice(-2);
  return `${'•'.repeat(Math.max(phone.length - 2, 4))}${visible}`;
}

export function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
