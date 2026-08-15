import { ApiProperty } from '@nestjs/swagger';
import { IsString, Validate } from 'class-validator';
import { AvoidUsingSpecialCharacters } from 'src/modules/shared/avoidUsingSpecialCharacters.validator';

export class UpdateCameraRequestDto {
  @ApiProperty()
  @IsString()
  @Validate(AvoidUsingSpecialCharacters)
  name!: string;
}
