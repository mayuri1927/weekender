import { apiFetch } from '@/lib/api';

interface Interest {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  interests: Interest[];
}

async function getCategories(): Promise<Category[]> {
  try {
    const res = await apiFetch('/interests');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function InterestsPage() {
  const categories = await getCategories();
  const totalInterests = categories.reduce(
    (sum, c) => sum + c.interests.length,
    0,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Interests</h1>
        <p className="text-sm text-gray-500 mt-1">
          {categories.length} categories · {totalInterests} interests
        </p>
      </div>

      <div className="space-y-6">
        {categories.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            No interest categories found. Run the seed script to populate them.
          </div>
        )}
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <span className="font-semibold text-gray-900">{cat.name}</span>
                <span className="ml-2 text-xs text-gray-400">
                  order {cat.displayOrder}
                </span>
              </div>
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  cat.isActive
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {cat.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="px-6 py-4">
              {cat.interests.length === 0 ? (
                <p className="text-sm text-gray-400">No interests in this category.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {cat.interests.map((interest) => (
                    <span
                      key={interest.id}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700 border border-blue-100"
                    >
                      {interest.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
