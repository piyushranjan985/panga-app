'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav';
import { ROLE_PERMISSIONS, type Permission } from '@/lib/rbac';
import type { AdminRole } from '@prisma/client';
import ThemeToggle from '@/components/ThemeToggle';

export default function Sidebar({ role, name, email }: { role: AdminRole; name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = new Set<Permission>(ROLE_PERMISSIONS[role]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 flex-none flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-5 py-5">
        <p className="text-sm font-extrabold">
          Vybe<span className="text-brand">Match</span> Admin
        </p>
        <ThemeToggle />
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {NAV_ITEMS.filter((item) => allowed.has(item.permission)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? 'bg-brand/10 text-brand' : 'text-inkSoft hover:bg-canvas'
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <Link href="/account" className="block rounded-lg -mx-1 px-1 py-0.5 hover:bg-canvas">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-inkFaint">{email}</p>
          <p className="mt-0.5 text-xs text-inkFaint">{ROLE_LABEL[role]}</p>
        </Link>
        <div className="mt-3 flex gap-2">
          <Link
            href="/account"
            className="flex-1 rounded-lg border border-border py-1.5 text-center text-xs font-semibold text-inkSoft hover:bg-canvas"
          >
            Account
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas"
          >
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  OPERATIONS: 'Operations',
  TRUST_AND_SAFETY: 'Trust & Safety',
  MODERATOR: 'Moderator',
  CUSTOMER_SUPPORT: 'Customer Support',
  PRIVACY_OFFICER: 'Privacy Officer',
  COMPLIANCE_OFFICER: 'Compliance Officer',
  FINANCE: 'Finance',
  ANALYTICS: 'Analytics',
  READ_ONLY: 'Read Only',
};
