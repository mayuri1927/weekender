import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePhotoDto } from './dto/update-photo.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByFirebaseUid(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      include: {
        profile: {
          include: {
            city: { select: { id: true, name: true } },
            area: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async updateProfile(firebaseUid: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Age validation — enforced server-side whenever DOB is submitted
    let dateOfBirthDate: Date | undefined;
    if (dto.dateOfBirth) {
      dateOfBirthDate = new Date(dto.dateOfBirth);
      AuthService.validateMinimumAge(dateOfBirthDate);
    }

    // Validate city/area relationship if either is being updated
    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: dto.cityId, isActive: true } });
      if (!city) throw new BadRequestException('Invalid city');
    }
    if (dto.areaId) {
      const area = await this.prisma.area.findUnique({ where: { id: dto.areaId, isActive: true } });
      if (!area) throw new BadRequestException('Invalid area');
      // Area must belong to the profile's city (use provided cityId or existing)
      const cityId = dto.cityId ?? user.profile?.cityId;
      if (cityId && area.cityId !== cityId) {
        throw new BadRequestException('Area does not belong to the selected city');
      }
    }

    if (user.profile) {
      const updated = await this.prisma.userProfile.update({
        where: { userId: user.id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dateOfBirthDate && { dateOfBirth: dateOfBirthDate }),
          ...(dto.gender && { gender: dto.gender }),
          ...(dto.bio !== undefined && { bio: dto.bio }),
          ...(dto.languages && { languages: dto.languages }),
          ...(dto.cityId !== undefined && { cityId: dto.cityId }),
          ...(dto.areaId !== undefined && { areaId: dto.areaId }),
          ...(dto.notificationPreferences !== undefined && {
            notificationPreferences: dto.notificationPreferences,
          }),
        },
        include: {
          user: { select: { id: true, kycStatus: true } },
          city: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
        },
      });

      // Recalculate isComplete after every update
      const isComplete = this.computeIsComplete(updated);
      if (isComplete !== updated.isComplete) {
        await this.prisma.userProfile.update({
          where: { userId: user.id },
          data: { isComplete },
        });
        updated.isComplete = isComplete;
      }

      return this.sanitizeProfile(updated);
    }

    // First profile creation — only dateOfBirth is required in Phase 1.
    // name, gender, city are collected in Phase 2 onboarding; they are nullable in DB.
    if (!dto.dateOfBirth) {
      throw new BadRequestException('dateOfBirth is required');
    }

    const newProfile = {
      userId: user.id,
      dateOfBirth: dateOfBirthDate!,
      ...(dto.name && { name: dto.name }),
      ...(dto.gender && { gender: dto.gender }),
      bio: dto.bio,
      languages: dto.languages ?? [],
      ...(dto.cityId && { cityId: dto.cityId }),
      ...(dto.areaId && { areaId: dto.areaId }),
    };

    const created = await this.prisma.userProfile.create({
      data: {
        ...newProfile,
        isComplete: this.computeIsComplete(newProfile),
      },
      include: {
        user: { select: { id: true, kycStatus: true } },
        city: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
      },
    });
    return this.sanitizeProfile(created);
  }

  async updatePhoto(firebaseUid: string, dto: UpdatePhotoDto) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.profile) throw new BadRequestException('Complete your profile before uploading a photo');

    const updated = await this.prisma.userProfile.update({
      where: { userId: user.id },
      data: { photoUrl: dto.photoUrl },
      include: {
        city: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
      },
    });
    return this.sanitizeProfile(updated);
  }

  async registerDeviceToken(
    firebaseUid: string,
    fcmToken: string,
    platform: 'IOS' | 'ANDROID',
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.deviceToken.upsert({
      where: { userId_fcmToken: { userId: user.id, fcmToken } },
      create: { userId: user.id, fcmToken, platform, isActive: true },
      update: { isActive: true, platform },
    });
    return { success: true };
  }

  // ─── Profile completion logic ─────────────────────────────────────────────

  private computeIsComplete(profile: any): boolean {
    return !!(
      profile.name &&
      profile.dateOfBirth &&
      profile.gender &&
      profile.cityId
    );
  }

  // ─── Serialization — never expose phone numbers ───────────────────────────

  private sanitize(user: any) {
    return {
      id: user.id,
      kycStatus: user.kycStatus,
      isActive: user.isActive,
      createdAt: user.createdAt,
      profile: user.profile ? this.sanitizeProfile(user.profile) : null,
    };
  }

  private sanitizeProfile(profile: any) {
    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      bio: profile.bio,
      languages: profile.languages,
      photoUrl: profile.photoUrl,
      city: profile.city ?? null,
      area: profile.area ?? null,
      isComplete: profile.isComplete,
      notificationPreferences: profile.notificationPreferences,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
