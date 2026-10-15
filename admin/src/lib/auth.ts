import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

// SECRET is resolved lazily so that a missing env var fails at request time
// (with a clear error), not at build time (which would obscure the real cause).
function getSecret(): Uint8Array {
  const jwtSecret = process.env.ADMIN_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('ADMIN_JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(jwtSecret);
}

export interface AdminTokenPayload extends JWTPayload {
  adminId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR';
}

export async function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as AdminTokenPayload;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}
