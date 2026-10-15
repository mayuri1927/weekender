import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

interface Participant {
  id: string;
  status: string;
  joinedAt: string;
  leftAt?: string | null;
  user: {
    id: string;
    name: string | null;
    photoUrl: string | null;
    gender: string | null;
  };
}

interface Activity {
  id: string;
  title: string;
  description: string;
  category: string;
  activityType: string;
  status: string;
  visibility: string;
  scheduledDate: string;
  startTime: string;
  endTime: string | null;
  maxParticipants: number;
  minParticipants: number | null;
  host: { id: string; profile: { name: string | null; photoUrl: string | null } | null };
  city: { id: string; name: string };
  area: { id: string; name: string } | null;
}

async function getActivity(id: string): Promise<Activity | null> {
  try {
    const res = await apiFetch(`/api/v1/activities/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Admin endpoint returns ALL statuses: JOINED, PENDING, REJECTED, LEFT, REMOVED
async function getAllParticipants(
  activityId: string,
  adminToken: string | undefined,
): Promise<Participant[]> {
  if (!adminToken) return [];
  try {
    const res = await apiFetch(
      `/api/v1/admin/activities/${activityId}/participants`,
      {},
      adminToken,
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const STATUS_STYLES: Record<string, string> = {
  OPEN:      'bg-green-50 text-green-700',
  FULL:      'bg-orange-50 text-orange-700',
  CANCELLED: 'bg-red-50 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
  DRAFT:     'bg-yellow-50 text-yellow-700',
};

const PARTICIPANT_STATUS_STYLES: Record<string, string> = {
  JOINED:   'bg-green-50 text-green-700',
  PENDING:  'bg-yellow-50 text-yellow-700',
  REJECTED: 'bg-red-50 text-red-700',
  LEFT:     'bg-gray-100 text-gray-500',
  REMOVED:  'bg-red-100 text-red-800',
};

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const adminToken = cookieStore.get('admin_token')?.value;

  const [activity, participants] = await Promise.all([
    getActivity(id),
    getAllParticipants(id, adminToken),
  ]);

  if (!activity) notFound();

  const joined   = participants.filter(p => p.status === 'JOINED');
  const pending  = participants.filter(p => p.status === 'PENDING');
  const rejected = participants.filter(p => p.status === 'REJECTED');
  const others   = participants.filter(p => p.status === 'LEFT' || p.status === 'REMOVED');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link
        href="/activities"
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← Activities
      </Link>

      {/* Activity header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{activity.title}</h1>
            <p className="text-sm text-gray-400 mt-1">{activity.id}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <span
              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                STATUS_STYLES[activity.status] ?? 'bg-gray-100 text-gray-500'
              }`}
            >
              {activity.status}
            </span>
            {activity.activityType === 'REQUEST' && (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700">
                REQUEST
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-700">Category</span>
            <p>{activity.category}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Type</span>
            <p>{activity.activityType}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Visibility</span>
            <p>{activity.visibility}</p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Date</span>
            <p>
              {activity.scheduledDate.split('T')[0]} · {activity.startTime}
              {activity.endTime ? ` – ${activity.endTime}` : ''}
            </p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Location</span>
            <p>
              {[activity.city.name, activity.area?.name]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Capacity</span>
            <p>
              {joined.length} / {activity.maxParticipants} joined
              {pending.length > 0 ? ` · ${pending.length} pending` : ''}
              {activity.minParticipants
                ? ` (min ${activity.minParticipants})`
                : ''}
            </p>
          </div>
          <div>
            <span className="font-medium text-gray-700">Host</span>
            <p>{activity.host.profile?.name ?? '—'}</p>
            <p className="text-xs text-gray-400">{activity.host.id}</p>
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-gray-700">Description</span>
          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
            {activity.description}
          </p>
        </div>
      </div>

      {/* Participants table — all statuses */}
      <ParticipantTable
        title={`Joined (${joined.length})`}
        participants={joined}
        emptyMessage="No joined participants."
      />

      {activity.activityType === 'REQUEST' && (
        <ParticipantTable
          title={`Pending Requests (${pending.length})`}
          participants={pending}
          emptyMessage="No pending requests."
          highlight="yellow"
        />
      )}

      {activity.activityType === 'REQUEST' && rejected.length > 0 && (
        <ParticipantTable
          title={`Rejected (${rejected.length})`}
          participants={rejected}
          emptyMessage=""
          highlight="red"
        />
      )}

      {others.length > 0 && (
        <ParticipantTable
          title={`Left / Removed (${others.length})`}
          participants={others}
          emptyMessage=""
        />
      )}
    </div>
  );
}

function ParticipantTable({
  title,
  participants,
  emptyMessage,
  highlight,
}: {
  title: string;
  participants: Participant[];
  emptyMessage: string;
  highlight?: 'yellow' | 'red';
}) {
  const borderColor =
    highlight === 'yellow'
      ? 'border-yellow-200'
      : highlight === 'red'
      ? 'border-red-200'
      : 'border-gray-200';

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${borderColor}`}>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>

      {participants.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400 text-sm">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined / Updated
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participants.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">
                      {p.user.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        PARTICIPANT_STATUS_STYLES[p.status] ??
                        'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    {new Date(p.joinedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs truncate max-w-xs">
                    {p.user.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
