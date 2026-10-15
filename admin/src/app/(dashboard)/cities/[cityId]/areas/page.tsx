import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';

interface Area {
  id: string;
  name: string;
  isActive: boolean;
}

interface City {
  id: string;
  name: string;
  state: string;
}

async function getCity(cityId: string): Promise<City | null> {
  try {
    const res = await apiFetch(`/cities/${cityId}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getAreas(cityId: string): Promise<Area[]> {
  try {
    const res = await apiFetch(`/cities/${cityId}/areas`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function AreasPage({
  params,
}: {
  params: Promise<{ cityId: string }>;
}) {
  const { cityId } = await params;
  const [city, areas] = await Promise.all([
    getCity(cityId),
    getAreas(cityId),
  ]);

  if (!city) notFound();

  return (
    <div>
      <div className="mb-6">
        <nav className="text-sm text-gray-500 mb-2">
          <a href="/cities" className="hover:text-gray-700">
            Cities
          </a>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{city.name}</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">
          {city.name} — Areas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {city.state} · {areas.length} area{areas.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Area name
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {areas.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-6 py-8 text-center text-gray-400"
                >
                  No areas found for {city.name}.
                </td>
              </tr>
            )}
            {areas.map((area) => (
              <tr key={area.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {area.name}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      area.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {area.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
