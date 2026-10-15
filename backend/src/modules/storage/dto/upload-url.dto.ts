import { IsString, IsNotEmpty, IsNumber, IsPositive, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UploadUrlRequestDto {
  @ApiProperty({ description: 'MIME type of the file', example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({ description: 'File size in bytes (max 5 MB)', example: 204800 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(5 * 1024 * 1024)
  contentLength: number;
}
