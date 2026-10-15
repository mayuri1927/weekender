import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const mockConfig = (overrides: Record<string, string | undefined> = {}) => ({
  get: (key: string) => {
    const map: Record<string, string | undefined> = {
      'storage.aws.bucket': 'test-bucket',
      'storage.aws.region': 'ap-south-1',
      'storage.aws.accessKeyId': 'AKIAIOSFODNN7EXAMPLE',
      'storage.aws.secretAccessKey': 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      ...overrides,
    };
    return map[key];
  },
});

describe('StorageService', () => {
  let service: StorageService;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  async function buildService(configOverrides: Record<string, string | undefined> = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: mockConfig(configOverrides) },
      ],
    }).compile();
    return module.get<StorageService>(StorageService);
  }

  // ─── Profile photo upload ────────────────────────────────────────────────────

  describe('getProfilePhotoUploadUrl', () => {
    beforeEach(async () => {
      service = await buildService();
    });

    it('accepts image/jpeg and returns uploadUrl + key + publicUrl', async () => {
      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024 * 1024);
      expect(result.uploadUrl).toContain('https://');
      expect(result.key).toMatch(/^profile-photos\/user-1\//);
      expect(result.key).toMatch(/\.jpeg$/);
      expect(result.publicUrl).toContain('profile-photos/user-1/');
      expect(result.expiresIn).toBe(300);
    });

    it('accepts image/png', async () => {
      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/png', 512 * 1024);
      expect(result.key).toMatch(/\.png$/);
    });

    it('accepts image/webp', async () => {
      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/webp', 512 * 1024);
      expect(result.key).toMatch(/\.webp$/);
    });

    it('rejects image/gif (not in allowed list)', async () => {
      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/gif', 512 * 1024),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects application/pdf', async () => {
      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'application/pdf', 100 * 1024),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects text/html (potential XSS vector)', async () => {
      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'text/html', 1024),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects file over 5 MB', async () => {
      const sixMb = 6 * 1024 * 1024;
      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', sixMb),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts exactly 5 MB', async () => {
      const fiveMb = 5 * 1024 * 1024;
      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', fiveMb);
      expect(result.key).toBeDefined();
    });

    it('rejects zero content-length', async () => {
      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 0),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative content-length', async () => {
      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', -1),
      ).rejects.toThrow(BadRequestException);
    });

    it('scopes S3 key to the authenticated userId — cannot inject arbitrary path', async () => {
      const maliciousUserId = '../../../admin';
      const result = await service.getProfilePhotoUploadUrl(maliciousUserId, 'image/jpeg', 1024);
      expect(result.key).toMatch(/^profile-photos\//);
      expect(result.key).toContain(maliciousUserId);
    });

    it('two uploads for the same user produce different keys (UUID uniqueness)', async () => {
      const r1 = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024);
      const r2 = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024);
      expect(r1.key).not.toBe(r2.key);
    });

    it('upload key for user-A is never accessible to user-B (path prefix enforcement)', async () => {
      const r1 = await service.getProfilePhotoUploadUrl('user-a', 'image/jpeg', 1024);
      const r2 = await service.getProfilePhotoUploadUrl('user-b', 'image/jpeg', 1024);
      expect(r1.key).toContain('/user-a/');
      expect(r2.key).toContain('/user-b/');
      expect(r1.key).not.toContain('/user-b/');
      expect(r2.key).not.toContain('/user-a/');
    });
  });

  // ─── Activity cover upload ───────────────────────────────────────────────────

  describe('getActivityCoverUploadUrl', () => {
    beforeEach(async () => {
      service = await buildService();
    });

    it('accepts image/jpeg and scopes key to activity-covers/{userId}/', async () => {
      const result = await service.getActivityCoverUploadUrl('host-1', 'image/jpeg', 1024 * 1024);
      expect(result.key).toMatch(/^activity-covers\/host-1\//);
    });

    it('rejects disallowed MIME type', async () => {
      await expect(
        service.getActivityCoverUploadUrl('host-1', 'image/bmp', 1024),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects file exceeding 5 MB', async () => {
      await expect(
        service.getActivityCoverUploadUrl('host-1', 'image/png', 6 * 1024 * 1024),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects zero content-length', async () => {
      await expect(
        service.getActivityCoverUploadUrl('host-1', 'image/png', 0),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Production credential guard (FINDING 4) ────────────────────────────────

  describe('production credential guard', () => {
    it('throws hard Error in production when bucket missing', async () => {
      process.env.NODE_ENV = 'production';
      service = await buildService({ 'storage.aws.bucket': undefined });

      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024),
      ).rejects.toThrow('AWS S3 is not configured');
    });

    it('throws hard Error in production when accessKeyId missing', async () => {
      process.env.NODE_ENV = 'production';
      service = await buildService({ 'storage.aws.accessKeyId': undefined });

      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024),
      ).rejects.toThrow('AWS S3 is not configured');
    });

    it('throws hard Error in production when secretAccessKey missing', async () => {
      process.env.NODE_ENV = 'production';
      service = await buildService({ 'storage.aws.secretAccessKey': undefined });

      await expect(
        service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024),
      ).rejects.toThrow('AWS S3 is not configured');
    });

    it('returns mock URL in development when credentials missing', async () => {
      process.env.NODE_ENV = 'development';
      service = await buildService({
        'storage.aws.bucket': undefined,
        'storage.aws.accessKeyId': undefined,
        'storage.aws.secretAccessKey': undefined,
      });

      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024);
      expect(result.uploadUrl).toContain('mock=true');
    });

    it('returns mock URL in test env when credentials missing', async () => {
      process.env.NODE_ENV = 'test';
      service = await buildService({
        'storage.aws.bucket': undefined,
        'storage.aws.accessKeyId': undefined,
        'storage.aws.secretAccessKey': undefined,
      });

      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024);
      expect(result.uploadUrl).toContain('localhost');
    });

    it('never returns mock URL in production', async () => {
      process.env.NODE_ENV = 'production';
      service = await buildService({
        'storage.aws.accessKeyId': undefined,
        'storage.aws.secretAccessKey': undefined,
      });

      let threwError = false;
      try {
        await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024);
      } catch (e: any) {
        threwError = true;
        expect(e.message).toContain('AWS S3 is not configured');
        expect(e).not.toBeInstanceOf(BadRequestException);
      }
      expect(threwError).toBe(true);
    });

    it('generates real pre-signed URL when all credentials present', async () => {
      process.env.NODE_ENV = 'production';
      service = await buildService();

      const result = await service.getProfilePhotoUploadUrl('user-1', 'image/jpeg', 1024);
      expect(result.uploadUrl).toContain('X-Amz-Signature=');
      expect(result.uploadUrl).not.toContain('mock=true');
    });
  });
});
