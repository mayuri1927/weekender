import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { UploadUrlRequestDto } from './dto/upload-url.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('profile-photo/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a pre-signed S3 URL to upload a profile photo' })
  @ApiResponse({ status: 200, description: 'Pre-signed URL + key returned' })
  async getProfilePhotoUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadUrlRequestDto,
  ) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { firebaseUid: user.uid },
      select: { id: true },
    });
    return this.storageService.getProfilePhotoUploadUrl(dbUser.id, dto.contentType, dto.contentLength);
  }

  @Post('activity-cover/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a pre-signed S3 URL to upload an activity cover image' })
  async getActivityCoverUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadUrlRequestDto,
  ) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { firebaseUid: user.uid },
      select: { id: true },
    });
    return this.storageService.getActivityCoverUploadUrl(dbUser.id, dto.contentType, dto.contentLength);
  }
}
