import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Age Validation ────────────────────────────────────────────────────────────

describe('AuthService.calculateAge', () => {
  const ref = new Date('2026-09-02'); // fixed reference date for determinism

  it('returns correct age when birthday has passed this year', () => {
    const dob = new Date('1995-06-15');
    expect(AuthService.calculateAge(dob, ref)).toBe(31);
  });

  it('returns correct age when birthday has not yet occurred this year', () => {
    const dob = new Date('1995-11-20');
    expect(AuthService.calculateAge(dob, ref)).toBe(30);
  });

  it('returns correct age on exact birthday', () => {
    const dob = new Date('2000-09-02');
    expect(AuthService.calculateAge(dob, ref)).toBe(26);
  });

  it('returns 16 for someone whose 17th birthday is tomorrow', () => {
    const dob = new Date('2009-09-03'); // turns 17 on 2026-09-03; is 16 on 2026-09-02
    expect(AuthService.calculateAge(dob, ref)).toBe(16);
  });
});

describe('AuthService.validateMinimumAge', () => {
  it('passes for user exactly 18 today', () => {
    const today = new Date();
    const dob = new Date(today);
    dob.setFullYear(dob.getFullYear() - 18);
    expect(() => AuthService.validateMinimumAge(dob)).not.toThrow();
  });

  it('passes for user 25 years old', () => {
    const dob = new Date('2001-01-01');
    expect(() => AuthService.validateMinimumAge(dob)).not.toThrow();
  });

  it('throws BadRequestException for user who has not yet turned 17', () => {
    const today = new Date();
    const dob = new Date(today);
    dob.setFullYear(dob.getFullYear() - 17);
    dob.setDate(dob.getDate() + 1); // birthday is tomorrow → still 16 today
    expect(() => AuthService.validateMinimumAge(dob)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for user 15 years old', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 15);
    expect(() => AuthService.validateMinimumAge(dob)).toThrow(BadRequestException);
  });

  it('throws with a message containing the minimum age', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 10);
    try {
      AuthService.validateMinimumAge(dob);
    } catch (e) {
      expect((e as BadRequestException).message).toContain('18');
    }
  });
});

// ─── AuthService (integration-style with mocks) ────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  deviceToken: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'encryption.key') return '12345678901234567890123456789012';
    if (key === 'encryption.iv') return '1234567890123456';
    if (key === 'app.nodeEnv') return 'test';
    return undefined;
  }),
};

// Mock firebase-admin — must be defined before any import that uses it
const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  apps: [],
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
}));

describe('AuthService.verifyAndLogin', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException for invalid Firebase token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));
    await expect(service.verifyAndLogin({ idToken: 'bad-token' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException if token has no phone_number', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid1' });
    await expect(service.verifyAndLogin({ idToken: 'token' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('creates a new user on first login', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-1',
      phone_number: '+919876543210',
    });
    mockPrisma.user.findUnique.mockResolvedValue(null); // no existing user by firebaseUid
    // second findUnique for phone dedup check
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // findUnique by firebaseUid
      .mockResolvedValueOnce(null); // findUnique by phoneHash
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      firebaseUid: 'firebase-uid-1',
      kycStatus: 'KYC_PENDING',
      isActive: true,
      profile: null,
    });

    const result = await service.verifyAndLogin({ idToken: 'valid-token' });
    expect(result.isNewUser).toBe(true);
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('returns existing user on repeat login', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-1',
      phone_number: '+919876543210',
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      firebaseUid: 'firebase-uid-1',
      kycStatus: 'KYC_PENDING',
      isActive: true,
      profile: { isComplete: true },
    });

    const result = await service.verifyAndLogin({ idToken: 'valid-token' });
    expect(result.isNewUser).toBe(false);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException if user is inactive (suspended)', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-banned',
      phone_number: '+919876543211',
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-banned',
      firebaseUid: 'firebase-uid-banned',
      kycStatus: 'KYC_PENDING',
      isActive: false,
      profile: null,
    });

    await expect(service.verifyAndLogin({ idToken: 'valid-token' })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
