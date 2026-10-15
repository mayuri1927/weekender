import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { cookies } from 'next/headers';

async function logoutAction() {
  'use server';
  const cookieStore = await cookies();
  cookieStore.delete('admin_token');
  redirect('/login');
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-base font-bold text-gray-900">Weekender</div>
          <div className="text-xs text-gray-400">Admin Console</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { label: 'Dashboard', href: '/dashboard', icon: '◻' },
            { label: 'Users', href: '/users', icon: '◻' },
            { label: 'KYC', href: '/kyc', icon: '◻' },
            { label: 'Activities', href: '/activities', icon: '◻' },
            { label: 'Reports', href: '/reports', icon: '◻' },
            { label: 'Events', href: '/events', icon: '◻' },
            { label: 'Banners', href: '/banners', icon: '◻' },
            { label: 'Cities & Areas', href: '/cities', icon: '◻' },
            { label: 'Payments', href: '/payments', icon: '◻' },
            { label: 'Audit Logs', href: '/audit', icon: '◻' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <span className="text-gray-400">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="px-3 pb-4 border-t border-gray-100 pt-3">
          <div className="px-3 py-1 text-xs text-gray-400 truncate">{session.role}</div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
