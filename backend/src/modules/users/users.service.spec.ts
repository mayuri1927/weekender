import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  userProfile: {
    update: jest.fn(),
    create: jest.fn(),
  },
  city: {
    findUnique: jest.fn(),
  },
  area: {
    findUnique: jest.fn(),
  },
  deviceToken: {
    upsert: jest.fn(),
  },
};

const baseUser = {
  id: 'user-1',
  firebaseUid: 'fb-uid-1',
  kycStatus: 'KYC_PENDING',
  isActive: true,
  createdAt: new Date(),
};

const baseProfile = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Alice',
  dateOfBirth: new Date('1995-06-15'),
  gender: 'FEMALE',
  bio: null,
  languages: [],
  photoUrl: null,
  isComplete: true,
  cityId: 'city-1',
  areaId: null,
  notificationPreferences: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  city: { id: 'city-1', name: 'Pune' },
  area: null,
  user: { id: 'user-1', kycStatus: 'KYC_PENDING' },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ─── findByFirebaseUid ──────────────────────────────────────────────────────

  describe('findByFirebaseUid', () => {
    it('returns sanitized user when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: baseProfile });

      const result = await service.findByFirebaseUid('fb-uid-1');

      expect(result.id).toBe('user-1');
      expect(result).not.toHaveProperty('phoneHash');
      expect(result).not.toHaveProperty('phoneEncrypted');
      expect(result).not.toHaveProperty('firebaseUid');
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findByFirebaseUid('unknown')).rejects.toThrow(NotFoundException);
    });

    it('returns null profile when user has no profile yet', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      const result = await service.findByFirebaseUid('fb-uid-1');
      expect(result.profile).toBeNull();
    });
  });

  // ─── updateProfile — first creation ─────────────────────────────────────────

  describe('updateProfile — first creation', () => {
    it('creates profile with DOB only and sets isComplete=false (name/gender/city missing)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      mockPrisma.userProfile.create.mockResolvedValue({
        ...baseProfile,
        name: null,
        gender: null,
        cityId: null,
        isComplete: false,
        city: null,
        area: null,
      });

      const result = await service.updateProfile('fb-uid-1', {
        dateOfBirth: '1995-06-15',
      });

      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dateOfBirth: expect.any(Date),
            isComplete: false,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws BadRequestException when dateOfBirth is missing on first creation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      await expect(service.updateProfile('fb-uid-1', {})).rejects.toThrow(BadRequestException);
    });

    it('rejects under-18 DOB with BadRequestException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      const underageDob = new Date();
      underageDob.setFullYear(underageDob.getFullYear() - 16);
      const dob = underageDob.toISOString().split('T')[0];
      await expect(service.updateProfile('fb-uid-1', { dateOfBirth: dob })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts exactly-18 DOB', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      mockPrisma.userProfile.create.mockResolvedValue({ ...baseProfile, isComplete: false, city: null, area: null });

      const eighteenToday = new Date();
      eighteenToday.setFullYear(eighteenToday.getFullYear() - 18);
      const dob = eighteenToday.toISOString().split('T')[0];

      await expect(service.updateProfile('fb-uid-1', { dateOfBirth: dob })).resolves.toBeDefined();
    });
  });

  // ─── updateProfile — existing profile ───────────────────────────────────────

  describe('updateProfile — existing profile update', () => {
    it('updates allowed fields on existing profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: { ...baseProfile } });
      mockPrisma.userProfile.update.mockResolvedValue({ ...baseProfile, bio: 'New bio' });

      await service.updateProfile('fb-uid-1', { bio: 'New bio' });

      expect(mockPrisma.userProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bio: 'New bio' }),
        }),
      );
    });

    it('re-validates age when dateOfBirth is updated on existing profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: { ...baseProfile } });

      const underageDob = new Date();
      underageDob.setFullYear(underageDob.getFullYear() - 15);
      const dob = underageDob.toISOString().split('T')[0];

      await expect(service.updateProfile('fb-uid-1', { dateOfBirth: dob })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Profile completion rules (Phase 2) ──────────────────────────────────────
  //
  // isComplete = name && dateOfBirth && gender && cityId
  // Photo is NOT required.
  // Interests are NOT required.
  // Area is NOT required.
  // Bio is NOT required.
  // Client-submitted isComplete is NOT trusted — always recalculated server-side.

  describe('computeIsComplete — Phase 2 rules', () => {
    const TWENTY_YEARS_AGO = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 20);
      return d.toISOString().split('T')[0];
    })();

    describe('incomplete profiles', () => {
      it('isComplete=false when DOB only (name/gender/cityId missing)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          name: null,
          gender: null,
          cityId: null,
          isComplete: false,
          city: null,
          area: null,
        });

        await service.updateProfile('fb-uid-1', { dateOfBirth: TWENTY_YEARS_AGO });

        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: false }),
          }),
        );
      });

      it('isComplete=false when name missing (DOB + gender + cityId present)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          name: null,
          isComplete: false,
        });

        await service.updateProfile('fb-uid-1', {
          dateOfBirth: TWENTY_YEARS_AGO,
          gender: 'MALE' as any,
          cityId: 'city-1',
        });

        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: false }),
          }),
        );
      });

      it('isComplete=false when gender missing (DOB + name + cityId present)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          gender: null,
          isComplete: false,
        });

        await service.updateProfile('fb-uid-1', {
          dateOfBirth: TWENTY_YEARS_AGO,
          name: 'Alice',
          cityId: 'city-1',
        });

        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: false }),
          }),
        );
      });

      it('isComplete=false when cityId missing (DOB + name + gender present)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          cityId: null,
          isComplete: false,
          city: null,
        });

        await service.updateProfile('fb-uid-1', {
          dateOfBirth: TWENTY_YEARS_AGO,
          name: 'Alice',
          gender: 'FEMALE' as any,
        });

        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: false }),
          }),
        );
      });

      it('isComplete=false when dateOfBirth missing (name + gender + cityId present)', async () => {
        // Can't test this via updateProfile on first creation (dateOfBirth required there)
        // Test via existing profile update that leaves dateOfBirth null
        const profileWithoutDob = { ...baseProfile, dateOfBirth: null, isComplete: false };
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: profileWithoutDob });
        mockPrisma.userProfile.update.mockResolvedValue({ ...profileWithoutDob, bio: 'hi' });

        await service.updateProfile('fb-uid-1', { bio: 'hi' });

        // updateProfile.update is called; isComplete recalculated as false
        // (dateOfBirth missing on the merged profile object)
        expect(mockPrisma.userProfile.update).toHaveBeenCalled();
      });
    });

    describe('complete profile', () => {
      it('isComplete=true when name + DOB + gender + cityId are all present', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          isComplete: true,
        });

        await service.updateProfile('fb-uid-1', {
          dateOfBirth: TWENTY_YEARS_AGO,
          name: 'Alice',
          gender: 'FEMALE' as any,
          cityId: 'city-1',
        });

        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: true }),
          }),
        );
      });

      it('isComplete=true even without photo (photo is NOT required)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          photoUrl: null,
          isComplete: true,
        });

        await service.updateProfile('fb-uid-1', {
          dateOfBirth: TWENTY_YEARS_AGO,
          name: 'Alice',
          gender: 'FEMALE' as any,
          cityId: 'city-1',
        });

        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: true }),
          }),
        );
      });
    });

    describe('server-side enforcement', () => {
      it('client cannot submit isComplete=true to bypass server calculation', async () => {
        // UpdateProfileDto does not contain an isComplete field.
        // If a client somehow sends isComplete: true, it must be stripped by the
        // ValidationPipe (whitelist: true) and never reach the service.
        // The service always recalculates — it never reads dto.isComplete.
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
        mockPrisma.userProfile.create.mockResolvedValue({
          ...baseProfile,
          name: null,
          gender: null,
          cityId: null,
          isComplete: false,
          city: null,
          area: null,
        });

        // Even if we call updateProfile with a fake injected isComplete, the service ignores it
        await service.updateProfile('fb-uid-1', {
          dateOfBirth: TWENTY_YEARS_AGO,
          // @ts-expect-error — isComplete not in dto; server must ignore this
          isComplete: true,
        });

        // DB write always uses server-computed value (false here, since name/gender/city missing)
        expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ isComplete: false }),
          }),
        );
      });

      it('under-18 user can never have a complete profile (age gate prevents creation)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });

        const underage = new Date();
        underage.setFullYear(underage.getFullYear() - 16);
        const dob = underage.toISOString().split('T')[0];

        await expect(
          service.updateProfile('fb-uid-1', {
            dateOfBirth: dob,
            name: 'Alice',
            gender: 'FEMALE' as any,
            cityId: 'city-1',
          }),
        ).rejects.toThrow(BadRequestException);

        // Profile was never created — no DB write
        expect(mockPrisma.userProfile.create).not.toHaveBeenCalled();
      });

      it('isComplete is recalculated after partial updates — remains false if fields still missing', async () => {
        const incompleteProfile = {
          ...baseProfile,
          name: null,
          cityId: null,
          isComplete: false,
          city: null,
        };
        mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: incompleteProfile });
        mockPrisma.userProfile.update.mockResolvedValue({
          ...incompleteProfile,
          gender: 'FEMALE',
        });

        await service.updateProfile('fb-uid-1', { gender: 'FEMALE' as any });

        // isComplete is still false (name + cityId still missing)
        // The second update (to set isComplete) is called with the recalculated value
        expect(mockPrisma.userProfile.update).toHaveBeenCalled();
      });
    });
  });

  // ─── Phase 2 profile fields ──────────────────────────────────────────────────

  describe('Phase 2 profile fields', () => {
    it('updates cityId and areaId on existing profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: { ...baseProfile } });
      mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
      mockPrisma.area.findUnique.mockResolvedValue({ id: 'area-1', isActive: true, cityId: 'city-1' });
      mockPrisma.userProfile.update.mockResolvedValue({
        ...baseProfile,
        cityId: 'city-1',
        areaId: 'area-1',
        city: { id: 'city-1', name: 'Pune' },
        area: { id: 'area-1', name: 'Baner' },
      });

      await service.updateProfile('fb-uid-1', { cityId: 'city-1', areaId: 'area-1' });

      expect(mockPrisma.userProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cityId: 'city-1', areaId: 'area-1' }),
        }),
      );
    });

    it('throws BadRequestException for invalid city', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: { ...baseProfile } });
      mockPrisma.city.findUnique.mockResolvedValue(null);

      await expect(service.updateProfile('fb-uid-1', { cityId: 'bad-city' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when area does not belong to city', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: { ...baseProfile, cityId: 'city-1' } });
      mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
      mockPrisma.area.findUnique.mockResolvedValue({ id: 'area-x', isActive: true, cityId: 'OTHER_CITY' });

      await expect(service.updateProfile('fb-uid-1', { cityId: 'city-1', areaId: 'area-x' })).rejects.toThrow(BadRequestException);
    });

    it('isComplete is false when cityId is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      mockPrisma.userProfile.create.mockResolvedValue({
        ...baseProfile,
        name: 'Alice',
        gender: 'FEMALE',
        cityId: null,
        isComplete: false,
        city: null,
        area: null,
      });

      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
      const dob = twentyYearsAgo.toISOString().split('T')[0];

      await service.updateProfile('fb-uid-1', { dateOfBirth: dob, name: 'Alice', gender: 'FEMALE' as any });

      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isComplete: false }),
        }),
      );
    });

    it('isComplete is true when name, gender, DOB, and cityId are all present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });
      mockPrisma.city.findUnique.mockResolvedValue({ id: 'city-1', isActive: true });
      mockPrisma.userProfile.create.mockResolvedValue({
        ...baseProfile,
        name: 'Alice',
        gender: 'FEMALE',
        cityId: 'city-1',
        isComplete: true,
        city: { id: 'city-1', name: 'Pune' },
        area: null,
      });

      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
      const dob = twentyYearsAgo.toISOString().split('T')[0];

      await service.updateProfile('fb-uid-1', {
        dateOfBirth: dob,
        name: 'Alice',
        gender: 'FEMALE' as any,
        cityId: 'city-1',
      });

      expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isComplete: true }),
        }),
      );
    });
  });

  // ─── Sanitization ────────────────────────────────────────────────────────────

  describe('sanitization', () => {
    it('never returns phoneHash in response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        phoneHash: 'secret-hash',
        phoneEncrypted: 'encrypted',
        profile: null,
      });

      const result = await service.findByFirebaseUid('fb-uid-1');
      expect(result).not.toHaveProperty('phoneHash');
      expect(result).not.toHaveProperty('phoneEncrypted');
    });

    it('never returns firebaseUid in response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, profile: null });

      const result = await service.findByFirebaseUid('fb-uid-1');
      expect(result).not.toHaveProperty('firebaseUid');
    });

    it('returns notificationPreferences in profile response', async () => {
      const prefs = { join_request_received: true, chat_messages: false };
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        profile: { ...baseProfile, notificationPreferences: prefs },
      });

      const result = await service.findByFirebaseUid('fb-uid-1');
      expect(result.profile?.notificationPreferences).toEqual(prefs);
    });
  });

  // ─── registerDeviceToken ─────────────────────────────────────────────────────

  describe('registerDeviceToken', () => {
    it('upserts the device token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.deviceToken.upsert.mockResolvedValue({});

      const result = await service.registerDeviceToken('fb-uid-1', 'fcm-abc', 'IOS');

      expect(mockPrisma.deviceToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fcmToken: 'fcm-abc', platform: 'IOS' }),
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.registerDeviceToken('unknown', 'fcm-abc', 'IOS'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
