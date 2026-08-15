import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Length, Validate } from 'class-validator';
import { PageTypes } from '../../domain/valueObjects/pageType.vo';
import { AvoidUsingSpecialCharacters } from 'src/modules/shared/avoidUsingSpecialCharacters.validator';

export class CreatePageRequestDto {
  @ApiProperty()
  @IsString()
  @Length(1, 60)
  @Validate(AvoidUsingSpecialCharacters)
  name!: string;

  @ApiProperty()
  @IsUUID()
  nvrId!: string;

  @ApiProperty({
    enum: PageTypes,
    enumName: 'PageTypes',
  })
  @IsEnum(PageTypes)
  type!: PageTypes;
}
