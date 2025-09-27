import { ApiErrorResponse } from 'src/dddLib/contracts/apiError.response';
export const GLOBAL_ERROR_EVENT = 'error';
export const errorLogPath = '../../../../error.log';

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { RequestContextService } from 'src/dddLib/utils/appRequestContext';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { LanguageKeys } from 'src/extensions/translation/languageKeys.base';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  internalServerErrorMsg;
  constructor(private readonly serviceProvider: ServiceProvider) {
    this.internalServerErrorMsg =
      this.serviceProvider.translatorService.translateByName(
        LanguageKeys.others.internalServerError,
      );
    this.serviceProvider.logger.debug('exception filter is up');
    process.on('uncaughtException', async (err) => {
      this.serviceProvider.logger.error(
        '$$uncaughtException$$',
        err.message,
        err.stack,
        err,
      );
    });
    process.on('unhandledRejection', async (err: Error) => {
      this.serviceProvider.logger.error(
        '$$unhandledRejection$$',
        err.message,
        err.stack,
        err,
      );
    });
    console.log('==========');
    this.serviceProvider.eventEmitter.on(
      GLOBAL_ERROR_EVENT,
      async (err: Error) => {
        this.serviceProvider.logger.error(
          'GLOBAL_ERROR_EVENT => ',
          err.message,
          err.stack,
          err,
        );
      },
    );
  }

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctxType = host.getType();

    if (ctxType === 'http') {
      await this.handleHttpException(exception, host);
    } else if (ctxType === 'rpc') {
      await this.handleRpcException(exception, host);
    } else if (ctxType === 'ws') {
      await this.handleWsException(exception, host);
    }
  }

  private async handleHttpException(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    this.serviceProvider.logger.error(exception);
    const httpException: HttpException | null =
      exception instanceof HttpException ? exception : null;
    const stack = httpException?.stack;
    console.log(exception);
    const status =
      httpException instanceof HttpException
        ? httpException.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorRes: any = httpException?.getResponse();
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            message: (exception as any).message || this.internalServerErrorMsg,
          };

    if (status >= 400 && status < 500) {
      this.serviceProvider.logger.debug(
        `[${RequestContextService.getRequestId()}] ${exception}`,
      );
      if (stack) this.serviceProvider.logger.error(stack);
      const isClassValidatorError = status === 400;
      // Transforming class-validator errors to a different format
      if (isClassValidatorError) {
        exception = new ApiErrorResponse({
          statusCode: status,
          error: 'Validation error',
          timestamp: Date.now(),
          path: request.url,
          message: httpException?.message || this.internalServerErrorMsg,
          subErrors: Array.isArray(errorRes.message)
            ? errorRes.message
            : [errorRes.message],
          correlationId: RequestContextService.getRequestId(),
        });
        return response.status(400).json(exception);
      }
    }

    let correlationId: string = '';
    if (!exception.correlationId) {
      correlationId = RequestContextService.getRequestId();
    }

    if (httpException?.getResponse()) {
      correlationId = exception.correlationId;
    }
    response.status(status).json(
      new ApiErrorResponse({
        statusCode: status,
        timestamp: Date.now(),
        path: request.url,
        message: httpException?.message || this.internalServerErrorMsg,
        correlationId: correlationId,
        error: JSON.stringify(message),
      }),
    );
  }

  private async handleRpcException(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToRpc();
    const response = ctx.getContext<EventEmitter>();

    response.emit(GLOBAL_ERROR_EVENT, {
      message: (exception as any).message || this.internalServerErrorMsg,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleWsException(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToWs();
    const client = ctx.getClient();
    const data = ctx.getData();

    client.emit('error', {
      message: (exception as any).message || this.internalServerErrorMsg,
      timestamp: new Date().toISOString(),
      data,
    });
  }
}
