import { IsOptional, IsEnum, IsInt, IsPositive, Min, Max, IsISO8601, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityCategory } from '../../../common/types/enums';

export class ListActivitiesDto {
  @ApiPropertyOptional({ description: 'Filter by city ID' })
  @IsUUID('4')
  @IsOptional()
  cityId?: string;

  @ApiPropertyOptional({ description: 'Filter by area ID' })
  @IsUUID('4')
  @IsOptional()
  areaId?: string;

  @ApiPropertyOptional({ enum: ActivityCategory })
  @IsEnum(ActivityCategory)
  @IsOptional()
  category?: ActivityCategory;

  @ApiPropertyOptional({ description: 'Filter activities from this date (ISO 8601)' })
  @IsISO8601({ strict: false })
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Filter activities until this date (ISO 8601)' })
  @IsISO8601({ strict: false })
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;
}
