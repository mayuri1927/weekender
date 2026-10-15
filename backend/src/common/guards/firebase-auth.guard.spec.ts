import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  apps: [],
}));

function buildContext(
  authHeader: string | undefined,
  isPublic: boolean,
): ExecutionContext {
  const mockRequest = { headers: { authorization: authHeader }, user: undefined as any };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => mockRequest }),
  } as unknown as ExecutionContext;
}

describe('FirebaseAuthGuard', () => {
  let guard: FirebaseAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new FirebaseAuthGuard(reflector, new ConfigService());
    jest.clearAllMocks();
  });

  describe('public routes', () => {
    it('returns true without checking the token when route is @Public()', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const ctx = buildContext(undefined, true);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });
  });

  describe('protected routes', () => {
    beforeEach(() => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    });

    it('throws UnauthorizedException when Authorization header is absent', async () => {
      const ctx = buildContext(undefined, false);
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when Authorization header is malformed (no Bearer prefix)', async () => {
      const ctx = buildContext('Token abc123', false);
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when Firebase token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));
      const ctx = buildContext('Bearer bad-token', false);
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when Firebase token is expired', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('auth/id-token-expired'));
      const ctx = buildContext('Bearer expired-token', false);
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('sets request.user and returns true for a valid token', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'fb-uid-1',
        phone_number: '+919876543210',
        email: undefined,
      });

      const mockRequest: any = { headers: { authorization: 'Bearer valid-token' } };
      const ctx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual({
        uid: 'fb-uid-1',
        phone_number: '+919876543210',
        email: undefined,
      });
    });

    it('calls verifyIdToken with checkRevoked=true', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'u1', phone_number: '+91x' });
      const mockRequest: any = { headers: { authorization: 'Bearer tok' } };
      const ctx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);

      expect(mockVerifyIdToken).toHaveBeenCalledWith('tok', true);
    });
  });
});
