import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SendDataRequestDto {
  @ApiProperty()
  @IsUUID()
  endDeviceId!: string;

  @ApiProperty({ type: 'number', isArray: true })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayMinSize(1)
  @Max(2147483647, { each: true })
  @Min(-2147483647, { each: true })
  @IsNumber({}, { each: true })
  data!: number[];
}
