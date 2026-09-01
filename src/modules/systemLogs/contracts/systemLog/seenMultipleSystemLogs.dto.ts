import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SeenMultipleSystemLogsRequestDto {
  @ApiProperty({ isArray: true })
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
