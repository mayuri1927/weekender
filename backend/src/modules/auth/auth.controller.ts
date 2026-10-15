import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { DevicePlatform } from '../../common/types/enums';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';

class LogoutDto {
  @ApiPropertyOptional({ description: 'FCM token of this device — omit to logout all devices' })
  @IsString()
  @IsOptional()
  fcmToken?: string;
}

class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'Firebase Cloud Messaging token' })
  @IsString()
  fcmToken: string;

  @ApiProperty({ enum: DevicePlatform, description: 'Device platform' })
  @IsIn(Object.values(DevicePlatform))
  platform: DevicePlatform;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify Firebase phone OTP token and log in' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid token' })
  async verifyOtp(@Body() dto: VerifyTokenDto) {
    return this.authService.verifyAndLogin(dto);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out — deactivates this device token (or all devices if fcmToken omitted)' })
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogoutDto) {
    const dbUser = await this.authService.getByFirebaseUid(user.uid);
    if (!dbUser) return { success: true };
    return this.authService.logout(dbUser.id, dto.fcmToken);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register or refresh FCM device token' })
  @ApiResponse({ status: 200, description: 'Token registered' })
  async registerDeviceToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    const dbUser = await this.authService.getByFirebaseUid(user.uid);
    if (!dbUser) return { success: true };
    return this.authService.registerDeviceToken(dbUser.id, dto.fcmToken, dto.platform);
  }
}
