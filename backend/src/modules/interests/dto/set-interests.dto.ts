import { IsArray, IsString, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetInterestsDto {
  @ApiProperty({
    type: [String],
    description: 'Interest IDs to assign to the user (replaces all existing interests)',
    minItems: 1,
    maxItems: 20,
  })
  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  interestIds: string[];
}
