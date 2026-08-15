import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsStrongPassword,
  Length,
  Validate,
} from 'class-validator';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { AvoidUsingSpecialCharacters } from 'src/modules/shared/avoidUsingSpecialCharacters.validator';

export class UpdateNvrRequestDto {
  @ApiPropertyOptional()
  @IsString()
  @Length(1, 60)
  @Validate(AvoidUsingSpecialCharacters)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsStrongPassword()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional()
  @IsEnum(LanguageCode)
  @IsOptional()
  lang?: LanguageCode;
}
