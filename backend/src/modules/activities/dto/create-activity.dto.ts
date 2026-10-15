import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsISO8601,
  IsInt,
  IsPositive,
  IsOptional,
  Min,
  Max,
  MaxLength,
  MinLength,
  Matches,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityCategory, ActivityType, ActivityVisibility } from '../../../common/types/enums';

export class CreateActivityDto {
  @ApiProperty({ minLength: 5, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(120)
  title: string;

  @ApiProperty({ minLength: 20, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(2000)
  description: string;

  @ApiProperty({ enum: ActivityCategory })
  @IsEnum(ActivityCategory)
  category: ActivityCategory;

  @ApiPropertyOptional({ enum: ActivityType, default: ActivityType.OPEN })
  @IsEnum(ActivityType)
  @IsOptional()
  activityType?: ActivityType;

  @ApiProperty({ description: 'City ID (UUID)', example: 'uuid-v4' })
  @IsUUID('4')
  cityId: string;

  @ApiPropertyOptional({ description: 'Area ID (UUID)' })
  @IsUUID('4')
  @IsOptional()
  areaId?: string;

  @ApiProperty({ description: 'ISO 8601 date string', example: '2026-10-15' })
  @IsISO8601({ strict: false })
  scheduledDate: string;

  @ApiProperty({ description: '24h time HH:MM', example: '18:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM (24h)' })
  startTime: string;

  @ApiPropertyOptional({ description: '24h time HH:MM', example: '20:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM (24h)' })
  @IsOptional()
  endTime?: string;

  @ApiProperty({ minimum: 2, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  maxParticipants: number;

  @ApiPropertyOptional({ minimum: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @IsOptional()
  minParticipants?: number;

  @ApiPropertyOptional({ enum: ActivityVisibility, default: ActivityVisibility.PUBLIC })
  @IsEnum(ActivityVisibility)
  @IsOptional()
  visibility?: ActivityVisibility;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverImageUrl?: string;
}
