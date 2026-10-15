import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Activity {
  id: string;
  title: string;
  category: string;
  status: string;
  visibility: string;
  scheduledDate: string;
  maxParticipants: number;
  host: {
    id: string;
    profile: { name: string | null } | null;
  };
  city: { name: string };
  area: { name: string } | null;
}

interface ActivitiesResponse {
  items: Activity[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async function getActivities(
  page: number,
  category?: string,
): Promise<ActivitiesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(category ? { category } : {}),
  });
  try {
    const res = await apiFetch(`/activities?${params}`);
    if (!res.ok) return { items: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    return res.json();
  } catch {
    return { items: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
  }
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-green-50 text-green-700',
  FULL: 'bg-orange-50 text-orange-700',
  CANCELLED: 'bg-red-50 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
  DRAFT: 'bg-yellow-50 text-yellow-700',
};

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string }>;
}) {
  const { page: pageParam, category } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10));
  const { items, pagination } = await getActivities(page, category);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pagination.total} total activities
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'SPORTS', 'SOCIAL', 'ADVENTURE', 'FUN', 'CREATIVE', 'ENTERTAINMENT'].map(
          (cat) => (
            <a
              key={cat || 'all'}
              href={`/activities${cat ? `?category=${cat}` : ''}`}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                (category ?? '') === cat
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat || 'All'}
            </a>
          ),
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Host
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-gray-400"
                >
                  No activities found.
                </td>
              </tr>
            )}
            {items.map((activity) => (
              <tr key={activity.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Link
                    href={`/activities/${activity.id}`}
                    className="font-medium text-gray-900 truncate max-w-xs hover:text-blue-600"
                  >
                    {activity.title}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Max {activity.maxParticipants} · {activity.visibility}
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600">{activity.category}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      STATUS_STYLES[activity.status] ?? 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {activity.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                  {activity.scheduledDate.split('T')[0]}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {[activity.city.name, activity.area?.name]
                    .filter(Boolean)
                    .join(', ')}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {activity.host.profile?.name ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              {pagination.page > 1 && (
                <a
                  href={`/activities?page=${pagination.page - 1}${category ? `&category=${category}` : ''}`}
                  className="px-3 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50"
                >
                  Previous
                </a>
              )}
              {pagination.page < pagination.totalPages && (
                <a
                  href={`/activities?page=${pagination.page + 1}${category ? `&category=${category}` : ''}`}
                  className="px-3 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50"
                >
                  Next
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
