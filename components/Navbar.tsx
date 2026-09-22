'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import VybeHelp from '@/components/VybeHelp';

const TABS = [
  { href: '/discover', label: 'Discover', icon: '🌀' },
  { href: '/matches', label: 'Matches', icon: '💬' },
  { href: '/profile', label: 'Profile', icon: '🧑' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <>
    {/* VybeHelp renders alongside the nav (not inside <nav>) so its fixed
        bubble/panel positioning is independent of the nav's own layout,
        while still showing up on every screen that renders <Navbar />. */}
    <VybeHelp />
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur sm:sticky sm:top-0 sm:border-b sm:border-t-0">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2 sm:py-3">
        {/* Always visible (not just sm:+) -- the product name should be on
            screen, as a home link, everywhere someone can end up in the
            app, not just on wider viewports. */}
        <Link href="/discover" className="flex-none whitespace-nowrap font-display text-base font-extrabold sm:text-lg">
          Vybe<span className="text-magenta">Match</span>
        </Link>
        {/* flex-1 (not w-full) so this shares the row with the logo above
            instead of demanding the full width and overflowing it, now
            that the logo always renders (see comment above). */}
        <div className="flex min-w-0 flex-1 justify-around gap-1 sm:flex-none sm:gap-4">
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs font-semibold sm:flex-row sm:gap-1.5 ${
                  active ? 'text-magenta' : 'text-inkSoft'
                }`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="hidden text-xs font-semibold text-inkSoft sm:block"
            type="button"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
    </>
  );
}
