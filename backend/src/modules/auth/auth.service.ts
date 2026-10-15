import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { DevicePlatform } from '../../common/types/enums';

// Minimum age in years enforced at registration
const MINIMUM_AGE_YEARS = 18;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verify Firebase ID token, create user if new, return user record.
   * Age validation (≥18) is enforced during profile completion — the user
   * entity is created here, profile with DOB is created in the profiles module.
   */
  async verifyAndLogin(dto: VerifyTokenDto) {
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(dto.idToken, true);
    } catch (err) {
      this.logger.warn(`Token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }

    if (!decoded.phone_number) {
      throw new UnauthorizedException('Token does not contain a phone number');
    }

    const phoneHash = this.hashPhone(decoded.phone_number);
    const phoneEncrypted = this.encryptPhone(decoded.phone_number);

    // Upsert user — idempotent for repeat logins
    let user = await this.prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      include: { profile: true },
    });

    const isNewUser = !user;

    if (!user) {
      // Check for duplicate phone (different Firebase UID — shouldn't happen but guard it)
      const existing = await this.prisma.user.findUnique({ where: { phoneHash } });
      if (existing) {
        throw new ConflictException('This phone number is already registered');
      }

      user = await this.prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          phoneHash,
          phoneEncrypted,
        },
        include: { profile: true },
      });
      this.logger.log(`New user created: ${user.id}`);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Register device token if provided
    if (dto.fcmToken && dto.platform) {
      await this.upsertDeviceToken(user.id, dto.fcmToken, dto.platform);
    }

    return {
      userId: user.id,
      isNewUser,
      kycStatus: user.kycStatus,
      profileComplete: user.profile?.isComplete ?? false,
    };
  }

  /**
   * Returns the DB user row for a given Firebase UID, or null if not found.
   * Public so controllers can resolve a DB user without accessing private
   * PrismaService members directly.
   */
  async getByFirebaseUid(firebaseUid: string) {
    return this.prisma.user.findUnique({
      where: { firebaseUid },
      select: { id: true, isActive: true },
    });
  }

  /**
   * Deactivate device token(s) on logout.
   * With fcmToken: targeted single-device logout.
   * Without fcmToken: deactivate all tokens (logout all devices).
   */
  async logout(userId: string, fcmToken?: string) {
    if (fcmToken) {
      await this.prisma.deviceToken.updateMany({
        where: { userId, fcmToken },
        data: { isActive: false },
      });
    } else {
      await this.prisma.deviceToken.updateMany({
        where: { userId },
        data: { isActive: false },
      });
    }
    return { success: true };
  }

  async registerDeviceToken(userId: string, fcmToken: string, platform: DevicePlatform) {
    await this.upsertDeviceToken(userId, fcmToken, platform);
    return { success: true };
  }

  // ─── Age validation ────────────────────────────────────────────────────────

  /**
   * Validates that a date of birth results in an age >= 18.
   * Called by profiles module when DOB is submitted.
   * Throws BadRequestException if under 18.
   */
  static validateMinimumAge(dateOfBirth: Date): void {
    const today = new Date();
    const age = AuthService.calculateAge(dateOfBirth, today);
    if (age < MINIMUM_AGE_YEARS) {
      throw new BadRequestException(
        `You must be at least ${MINIMUM_AGE_YEARS} years old to register`,
      );
    }
  }

  static calculateAge(dateOfBirth: Date, referenceDate: Date): number {
    let age = referenceDate.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = referenceDate.getMonth() - dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dateOfBirth.getDate())) {
      age--;
    }
    return age;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private hashPhone(phone: string): string {
    return crypto.createHash('sha256').update(phone).digest('hex');
  }

  private encryptPhone(phone: string): string {
    const key = this.config.get<string>('encryption.key') || '';
    const iv = this.config.get<string>('encryption.iv') || '';

    const keyInvalid = !key || key.length < 32;
    const ivInvalid = !iv || iv.length < 16;

    if (keyInvalid || ivInvalid) {
      if (this.config.get('app.nodeEnv') === 'development') {
        return `dev_encrypted:${phone}`;
      }
      if (keyInvalid) throw new Error('ENCRYPTION_KEY must be at least 32 characters');
      throw new Error('ENCRYPTION_IV must be at least 16 characters');
    }

    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(key.substring(0, 32)),
      Buffer.from(iv.substring(0, 16)),
    );
    const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return encrypted.toString('hex');
  }

  private async upsertDeviceToken(
    userId: string,
    fcmToken: string,
    platform: DevicePlatform,
  ) {
    await this.prisma.deviceToken.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      create: { userId, fcmToken, platform, isActive: true },
      update: { isActive: true, platform, updatedAt: new Date() },
    });
  }
}
