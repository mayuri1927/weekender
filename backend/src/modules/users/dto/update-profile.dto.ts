import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsObject,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../../common/types/enums';

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'ISO date string — must result in age ≥ 18', example: '1995-06-15' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiPropertyOptional({ description: 'City ID (UUID)' })
  @IsUUID('4')
  @IsOptional()
  cityId?: string;

  @ApiPropertyOptional({ description: 'Area ID (UUID)' })
  @IsUUID('4')
  @IsOptional()
  areaId?: string;

  @ApiPropertyOptional({ description: 'Notification preference overrides (partial JSONB)' })
  @IsObject()
  @IsOptional()
  notificationPreferences?: Record<string, boolean>;
}
