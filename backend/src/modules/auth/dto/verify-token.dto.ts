import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '../../../common/types/enums';

export class VerifyTokenDto {
  @ApiProperty({ description: 'Firebase ID token obtained after phone OTP verification' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({ description: 'FCM device token for push notifications' })
  @IsString()
  @IsOptional()
  fcmToken?: string;

  @ApiPropertyOptional({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  @IsOptional()
  platform?: DevicePlatform;
}
