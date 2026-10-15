import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePhotoDto } from './dto/update-photo.dto';
import { RegisterDeviceTokenDto } from '../auth/dto/register-device-token.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user and profile (includes city and area)' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findByFirebaseUid(user.uid);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile (name, DOB, gender, bio, languages, city, area, notification preferences)' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.uid, dto);
  }

  @Post('me/photo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set profile photo URL after successful S3 upload' })
  updatePhoto(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePhotoDto) {
    return this.usersService.updatePhoto(user.uid, dto);
  }

  @Post('me/device-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or refresh FCM device token' })
  registerDeviceToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.usersService.registerDeviceToken(user.uid, dto.fcmToken, dto.platform);
  }
}
