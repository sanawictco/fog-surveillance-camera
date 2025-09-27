import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLogerModule } from 'nestjs-pino';
import pino from 'pino';
import { LoggerService } from './logger.service';

@Global()
@Module({
  imports: [
    PinoLogerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        formatters: {
          bindings: (bindings) => {
            return {
              host: bindings.hostname,
            };
          },

          level: (label) => {
            return { level: label.toUpperCase() };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                },
              }
            : undefined,
        autoLogging: false,
        serializers: {
          req: (req) => {
            return {
              method: req.method,
              url: req.url,
            };
          },
        },
      },
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
