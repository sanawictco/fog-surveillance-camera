import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SystemLogTypes } from '../../domain/systemLog.type';

@ValidatorConstraint({ name: 'checkJsonEngineFormat', async: false })
export class CheckTypesIsValid implements ValidatorConstraintInterface {
  validate(types: string /*, args: ValidationArguments*/) {
    try {
      if (!types) return true;
      else types = JSON.parse(types.replace(/'/g, '"'));
    } catch (err) {
      return false;
    }
    if (!isArray(types)) return false;
    for (const type of types) {
      const systemLogTypes: string[] = [
        SystemLogTypes.ERROR,
        SystemLogTypes.INFORMATION,
        SystemLogTypes.WARNING,
      ];
      if (!systemLogTypes.includes(type)) return false;
      if (types.length !== [...new Set(types)].length) return false;
    }
    return true;
  }

  defaultMessage(/*args: ValidationArguments*/) {
    return `types is not valid`;
  }
}

export class GetAllSystemLogsRequestDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(10)
  @Max(30)
  @Type(() => Number)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    type: String,
  })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  @Validate(CheckTypesIsValid)
  types?: string;
}
