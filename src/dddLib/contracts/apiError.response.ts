import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponse {
  @ApiProperty({ example: 400 })
  readonly statusCode: number;

  @ApiProperty({ example: 'Validation Error' })
  readonly message: string;

  @ApiProperty({ example: 'Bad Request' })
  readonly error: string;

  @ApiProperty({ example: 'YevPQs' })
  readonly correlationId: string;

  @ApiProperty({ example: Date.now() })
  readonly timestamp: number;

  @ApiProperty({ example: '/foo/bar' })
  readonly path: string;

  @ApiPropertyOptional({
    example: ['incorrect email'],
    description: 'Optional list of sub-errors',
    nullable: true,
    required: false,
    isArray: true,
  })
  readonly subErrors?: string[];

  constructor(body: ApiErrorResponse) {
    this.statusCode = body.statusCode;
    this.message = body.message;
    this.error = body.error;
    this.correlationId = body.correlationId;
    this.subErrors = body.subErrors;
    this.timestamp = body.timestamp;
    this.path = body.path;
  }
}
