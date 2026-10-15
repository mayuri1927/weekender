import { apiFetch } from '@/lib/api';

interface City {
  id: string;
  name: string;
  state: string;
  isActive: boolean;
  _count?: { areas: number };
}

async function getCities(): Promise<City[]> {
  try {
    const res = await apiFetch('/cities?includeInactive=true');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function CitiesPage() {
  const cities = await getCities();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cities</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage launch cities and their active status.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                City
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                State
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cities.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-gray-400"
                >
                  No cities found.
                </td>
              </tr>
            )}
            {cities.map((city) => (
              <tr key={city.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {city.name}
                </td>
                <td className="px-6 py-4 text-gray-600">{city.state}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      city.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {city.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <a
                    href={`/cities/${city.id}/areas`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View areas
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
