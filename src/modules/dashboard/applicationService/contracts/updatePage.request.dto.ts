import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  Validate,
} from 'class-validator';
import { AvoidUsingSpecialCharacters } from 'src/modules/shared/avoidUsingSpecialCharacters.validator';

export class UpdatePageRequestDto {
  @ApiPropertyOptional()
  @IsString()
  @Length(1, 60)
  @Validate(AvoidUsingSpecialCharacters)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  destIndex?: number;

  @ApiPropertyOptional({
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(300)
  @IsOptional()
  content?: WidgetDto[];
}

class WidgetDto {
  @ApiProperty()
  @IsUUID()
  id!: string;
}
