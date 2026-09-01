import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLogerModule } from 'nestjs-pino';
import pino from 'pino';
import { LoggerService } from './logger.service';

@Global()
@Module({
  imports: [
    PinoLogerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        formatters: {
          bindings: (bindings) => {
            return {
              pid: bindings.pid,
              host: bindings.hostname,
              node_version: process.version,
            };
          },

          level: (label) => {
            return { level: label.toUpperCase() };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss',
                  customColors: 'info:cyan,warn:yellow,error:red,debug:magenta',
                  levelFirst: true,
                  hideObject: false,
                  messageFormat: '{context} | {msg}',
                  errorLikeObjectKeys: ['err', 'error'],
                  errorProps: 'stack,message,type',
                  ignore: 'pid,hostname,node_version',
                },
              },
        autoLogging: {
          // The health probe lives at /system-monitor/health (verified route),
          // not /health - match the real path (ignoring any query string) so
          // poll traffic doesn't flood the access log.
          ignore: (req) =>
            (req.url ?? '').split('?')[0] === '/system-monitor/health',
        },
        customProps: (req) => ({
          correlationId:
            req.headers['x-correlation-id'] || req.headers['x-request-id'],
        }),
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            path: req.path,
            parameters: req.params,
            query: req.query,
            headers: {
              host: req.headers.host,
              'user-agent': req.headers['user-agent'],
              'content-type': req.headers['content-type'],
            },
            remoteAddress: req.ip,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
            headers: res.getHeaders ? res.getHeaders() : {},
          }),
          err: pino.stdSerializers.err,
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-auth-token"]',
            'req.headers["x-nvr-access-token"]',
            '*.password',
            '*.token',
            '*.apiKey',
          ],
          remove: true,
        },
      },
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
