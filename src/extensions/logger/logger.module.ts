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
        timestamp: () => {
          const date = new Date();
          const offset = -date.getTimezoneOffset();
          const sign = offset >= 0 ? '+' : '-';
          const absoluteOffset = Math.abs(offset);
          const hours = String(Math.floor(absoluteOffset / 60)).padStart(
            2,
            '0',
          );
          const minutes = String(absoluteOffset % 60).padStart(2, '0');
          const localIso = new Date(date.getTime() + offset * 60_000)
            .toISOString()
            .slice(0, -1);
          return `,"time":"${localIso}${sign}${hours}:${minutes}"`;
        },
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
                  messageFormat: '{context} | {msg}',
                  errorLikeObjectKeys: ['err', 'error'],
                  errorProps: 'stack,message,type',
                  ignore: 'pid,hostname,node_version',
                },
              },
        autoLogging: {
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
