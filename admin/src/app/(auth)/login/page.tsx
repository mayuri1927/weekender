import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminSession, signAdminToken } from '@/lib/auth';

// In Phase 1, credentials are environment-defined (no DB admin users yet).
// Phase 11 will migrate to DB-backed admin users.
// ADMIN_DEV_EMAIL and ADMIN_DEV_PASSWORD must be set — no fallback values.

async function loginAction(formData: FormData) {
  'use server';
  const adminEmail = process.env.ADMIN_DEV_EMAIL;
  const adminPassword = process.env.ADMIN_DEV_PASSWORD;

  if (!adminEmail || !adminPassword) {
    // Credentials not configured — reject all logins rather than using defaults.
    redirect('/login?error=1');
  }

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (email !== adminEmail || password !== adminPassword) {
    redirect('/login?error=1');
  }

  const token = await signAdminToken({
    adminId: 'dev-admin',
    role: 'SUPER_ADMIN',
  });

  const cookieStore = await cookies();
  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });

  redirect('/dashboard');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const session = await getAdminSession();
  if (session) redirect('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Weekender Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>
        <form action={loginAction} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {params.error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Wrong email or password.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            Sign in
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          Weekender Admin · Phase 1
        </p>
      </div>
    </div>
  );
}
