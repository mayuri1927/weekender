import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHmac } from 'crypto';

function base64urlDecode(str: string): string {
  return Buffer.from(
    str.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8');
}

// Validates an HS256 JWT signed with ADMIN_JWT_SECRET.
// Uses only Node.js built-in crypto — no external JWT library needed.
function verifyAdminJwt(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (expected !== sig) return null;
    const decoded: Record<string, unknown> = JSON.parse(base64urlDecode(payload));
    const exp = decoded['exp'];
    if (typeof exp === 'number' && exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Admin endpoints use X-Admin-Token to avoid collision with Firebase Bearer tokens
    const token: string | undefined = request.headers['x-admin-token'];
    if (!token) {
      throw new UnauthorizedException('Admin token required');
    }

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      this.logger.warn('ADMIN_JWT_SECRET is not configured — rejecting admin request');
      throw new UnauthorizedException('Admin auth not configured');
    }

    const payload = verifyAdminJwt(token, secret);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired admin token');
    }

    request.adminSession = payload;
    return true;
  }
}
