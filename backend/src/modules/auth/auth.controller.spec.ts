import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

const mockAuthService = {
  verifyAndLogin: jest.fn(),
  getByFirebaseUid: jest.fn(),
  logout: jest.fn(),
};

jest.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: jest.fn() }),
  apps: [],
}));

const mockUser = { uid: 'fb-uid-1', phone_number: '+919876543210', email: undefined };

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        Reflector,
        FirebaseAuthGuard,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('health', () => {
    it('returns status ok with a timestamp', () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('verifyOtp', () => {
    it('delegates to authService.verifyAndLogin', async () => {
      const expected = { userId: 'u1', isNewUser: true, kycStatus: 'KYC_PENDING', profileComplete: false };
      mockAuthService.verifyAndLogin.mockResolvedValue(expected);

      const result = await controller.verifyOtp({ idToken: 'tok' });

      expect(mockAuthService.verifyAndLogin).toHaveBeenCalledWith({ idToken: 'tok' });
      expect(result).toEqual(expected);
    });

    it('propagates UnauthorizedException from service', async () => {
      mockAuthService.verifyAndLogin.mockRejectedValue(new UnauthorizedException());

      await expect(controller.verifyOtp({ idToken: 'bad' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('returns success:true when user is not in DB', async () => {
      mockAuthService.getByFirebaseUid.mockResolvedValue(null);

      const result = await controller.logout(mockUser, {});
      expect(result).toEqual({ success: true });
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });

    it('calls logout with userId and no fcmToken when body is empty (all-device logout)', async () => {
      mockAuthService.getByFirebaseUid.mockResolvedValue({ id: 'user-1', isActive: true });
      mockAuthService.logout.mockResolvedValue({ success: true });

      await controller.logout(mockUser, {});

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', undefined);
    });

    it('calls logout with fcmToken for targeted single-device logout', async () => {
      mockAuthService.getByFirebaseUid.mockResolvedValue({ id: 'user-1', isActive: true });
      mockAuthService.logout.mockResolvedValue({ success: true });

      await controller.logout(mockUser, { fcmToken: 'fcm-device-a' });

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', 'fcm-device-a');
    });

    it('uses getByFirebaseUid — does not access prisma directly', async () => {
      mockAuthService.getByFirebaseUid.mockResolvedValue({ id: 'user-1', isActive: true });
      mockAuthService.logout.mockResolvedValue({ success: true });

      await controller.logout(mockUser, {});

      expect(mockAuthService.getByFirebaseUid).toHaveBeenCalledWith('fb-uid-1');
      // Confirm no bracket notation hack: authService['prisma'] would not appear in properly tested code
    });
  });
});
