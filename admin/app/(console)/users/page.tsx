import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { maskEmail, maskPhone, ageFromDob } from '@/lib/mask';
import type { Prisma } from '@prisma/client';

const PAGE_SIZE = 25;

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  ACTIVE: 'success',
  WARNED: 'warning',
  SUSPENDED: 'warning',
  BANNED: 'critical',
  DELETED: 'critical',
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requirePageAccess('users.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.UserWhereInput = {};
  const and: Prisma.UserWhereInput[] = [];

  if (sp.q) {
    const q = sp.q.trim();
    and.push({
      OR: [
        { id: q },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { profile: { displayName: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (sp.status) and.push({ status: sp.status as never });
  if (sp.city) and.push({ profile: { city: sp.city } });
  if (sp.gender) and.push({ profile: { gender: sp.gender as never } });
  if (sp.intent) and.push({ profile: { intent: sp.intent as never } });
  if (sp.verification) and.push({ profile: { verification: sp.verification as never } });
  if (and.length > 0) where.AND = and;

  const [total, users, cities] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: { profile: { select: { displayName: true, city: true, gender: true, intent: true, verification: true, dateOfBirth: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.profile.findMany({ select: { city: true }, distinct: ['city'], orderBy: { city: 'asc' } }),
  ]);

  const canUnmask = admin.role !== 'READ_ONLY'; // fine-grained check happens server-side per unmask call anyway
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Users" description={`${total.toLocaleString()} accounts`} />
      <div className="p-8">
        <form className="mb-5 flex flex-wrap gap-2" method="get">
          <input
            type="text"
            name="q"
            defaultValue={sp.q}
            placeholder="Search name, email, phone, or user ID"
            className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <Select name="status" label="Any status" defaultValue={sp.status} options={['ACTIVE', 'WARNED', 'SUSPENDED', 'BANNED', 'DELETED']} />
          <Select name="city" label="Any city" defaultValue={sp.city} options={cities.map((c) => c.city)} />
          <Select name="gender" label="Any gender" defaultValue={sp.gender} options={['WOMAN', 'MAN', 'NON_BINARY', 'OTHER']} />
          <Select name="intent" label="Any intent" defaultValue={sp.intent} options={['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY']} />
          <Select name="verification" label="Any verification" defaultValue={sp.verification} options={['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']} />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
            Filter
          </button>
        </form>

        {users.length === 0 ? (
          <EmptyState title="No users match these filters" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">City</th>
                  <th className="px-4 py-2.5">Intent</th>
                  <th className="px-4 py-2.5">Age</th>
                  <th className="px-4 py-2.5">Verification</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link href={`/users/${u.id}`} className="font-semibold text-brand hover:underline">
                        {u.profile?.displayName || '(no profile)'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">
                      {canUnmask ? (u.email ? maskEmail(u.email) : maskPhone(u.phone)) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{u.profile?.city ?? '—'}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{u.profile?.intent ?? '—'}</td>
                    <td className="px-4 py-2.5 text-inkSoft tabular-nums">{u.profile ? ageFromDob(u.profile.dateOfBirth) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={u.profile?.verification === 'VERIFIED' ? 'success' : u.profile?.verification === 'REJECTED' ? 'critical' : 'default'}>
                        {u.profile?.verification ?? 'UNVERIFIED'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[u.status] ?? 'default'}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{u.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-inkSoft">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?${new URLSearchParams({ ...sp, page: String(page - 1) }).toString()}`} className="rounded-lg border border-border px-3 py-1.5">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?${new URLSearchParams({ ...sp, page: String(page + 1) }).toString()}`} className="rounded-lg border border-border px-3 py-1.5">
                Next
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue || ''}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-inkSoft outline-none focus:border-brand"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
