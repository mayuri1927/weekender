import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DevicePlatform } from '../../../common/types/enums';

export class RegisterDeviceTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fcmToken: string;

  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
