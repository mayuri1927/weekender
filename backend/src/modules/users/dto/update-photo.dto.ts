import { IsString, IsNotEmpty, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePhotoDto {
  @ApiProperty({ description: 'S3 public URL of the uploaded profile photo' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  photoUrl: string;
}
