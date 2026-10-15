const API_BASE = process.env.BACKEND_API_URL ?? 'http://localhost:3000';

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  adminToken?: string,
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Forward the admin JWT for admin-protected backend endpoints
      ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  });
}
