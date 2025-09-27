import { Injectable } from '@nestjs/common';
import { LoggerBase } from 'src/dddLib/utils';
import { Logger } from 'nestjs-pino';
@Injectable()
export class LoggerService implements LoggerBase {
  constructor(private readonly logger: Logger) {}
  log(message: string, ...meta: unknown[]): void {
    this.logger.log(message, meta);
  }
  error(message: string, /*trace?: unknown, */ ...meta: unknown[]): void {
    this.logger.error(message, meta);
  }
  warn(message: string, ...meta: unknown[]): void {
    this.logger.warn(message, meta);
  }
  debug(message: string, ...meta: unknown[]): void {
    this.logger.debug(message, meta);
  }
}
