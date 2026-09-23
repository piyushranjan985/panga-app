import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/session';
import Sidebar from '@/components/Sidebar';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentAdmin();
  if (!current) redirect('/login');

  return (
    <div className="flex">
      <Sidebar role={current.admin.role} name={current.admin.name} email={current.admin.email} />
      <main className="min-h-screen flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
