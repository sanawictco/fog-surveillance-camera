import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class OnlyIdParamRequestDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  id!: string;
}
