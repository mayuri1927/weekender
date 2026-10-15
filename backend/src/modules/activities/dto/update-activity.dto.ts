import {
  IsString,
  IsOptional,
  IsISO8601,
  IsInt,
  IsEnum,
  Min,
  Max,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityVisibility } from '../../../common/types/enums';

export class UpdateActivityDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 120 })
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ minLength: 20, maxLength: 2000 })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsISO8601({ strict: false })
  @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM (24h)' })
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM (24h)' })
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ minimum: 2, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  @IsOptional()
  maxParticipants?: number;

  @ApiPropertyOptional({ minimum: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @IsOptional()
  minParticipants?: number;

  @ApiPropertyOptional({ enum: ActivityVisibility })
  @IsEnum(ActivityVisibility)
  @IsOptional()
  visibility?: ActivityVisibility;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverImageUrl?: string;
}
