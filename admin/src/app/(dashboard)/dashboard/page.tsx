import { getAdminSession } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await getAdminSession();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back. Analytics and metrics will appear here.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total users', value: '—', note: 'Available in Phase 11' },
          { label: 'Active activities', value: '—', note: 'Available in Phase 11' },
          { label: 'KYC pending', value: '—', note: 'Available in Phase 11' },
          { label: 'Reports', value: '—', note: 'Available in Phase 11' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-sm text-gray-500">{stat.label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</div>
            <div className="text-xs text-gray-400 mt-1">{stat.note}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm font-medium text-gray-700 mb-1">Phase 1 Status</div>
        <p className="text-sm text-gray-500">
          Backend, mobile, and admin foundation are set up. Full admin functionality (user management,
          KYC queue, activity moderation, payments, analytics) ships in Phase 11.
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          {['Backend API ✓', 'Database schema ✓', 'Firebase auth ✓', 'Admin login ✓'].map((tag) => (
            <span
              key={tag}
              className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-1"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
