// logger.service.ts
import { Injectable } from '@nestjs/common';
import { LoggerBase } from 'src/dddLib/utils';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggerService implements LoggerBase {
  constructor(private readonly logger: PinoLogger) {}

  log(message: string, ...meta: unknown[]): void {
    if (meta.length > 0) {
      this.logger.info(this.buildContext(meta), message);
    } else {
      this.logger.info(message);
    }
  }

  error(message: string, trace?: unknown, ...meta: unknown[]): void {
    const context = this.buildContext(meta);

    if (trace === undefined || trace === null) {
      this.logger.error(context, message);
    } else if (trace instanceof Error) {
      this.logger.error({ ...context, err: trace }, message);
    } else {
      const err = new Error(
        typeof trace === 'string' ? trace : 'Non-Error value thrown',
        { cause: trace },
      );
      this.logger.error({ ...context, err }, message);
    }
  }

  warn(message: string, ...meta: unknown[]): void {
    if (meta.length > 0) {
      this.logger.warn(this.buildContext(meta), message);
    } else {
      this.logger.warn(message);
    }
  }

  debug(message: string, ...meta: unknown[]): void {
    if (meta.length > 0) {
      this.logger.debug(this.buildContext(meta), message);
    } else {
      this.logger.debug(message);
    }
  }

  private buildContext(meta: unknown[]): Record<string, unknown> {
    if (meta.length === 0) return {};

    if (meta.length === 1 && typeof meta[0] === 'object' && meta[0] !== null) {
      return meta[0] as Record<string, unknown>;
    }
    return { details: meta };
  }
}
