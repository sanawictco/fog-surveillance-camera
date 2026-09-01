import { Global, Logger, Module } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { CACHE_CLIENT } from './diTokens/cache.diToken';

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: CACHE_CLIENT,
      useFactory: () => {
        // NestJS Logger routes through the app's pino transport (see
        // main.ts app.useLogger). console.* is invisible under pm2 fork -
        // see CLAUDE.md. The factory has no DI, so use a plain Logger sink.
        const logger = new Logger('CacheRedis');

        const redis = new Redis({
          host: AppConfig().redis.host,
          port: AppConfig().redis.port,
          password: AppConfig().redis.password, // optional; undefined == no AUTH
          db: 2, // Dedicated cache DB, intentionally separate from the
          // BullMQ queue DB (AppConfig().redis.db, env REDIS_DB, default 1).
          // Pinned to 0 so the dev/test bootstrap flush and clearAll only ever
          // touch cache keys - never queue data. Do NOT repoint to the queue DB.
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          enableReadyCheck: true,
          connectTimeout: 10000,
          // Fail individual cache commands fast instead of hanging. With
          // maxRetriesPerRequest:null + the default offline queue, a Redis
          // outage would otherwise leave get/set pending indefinitely and the
          // "degrade gracefully" try/catch in CacheService would never fire -
          // stalling the request hot path. commandTimeout bounds that wait so
          // the caller falls back (e.g. to Mongo) quickly. Safe here because
          // the cache issues no blocking commands (unlike the BullMQ client).
          commandTimeout: 2000,
          keepAlive: 30000,
          maxRetriesPerRequest: null,
          reconnectOnError: (err: Error) => {
            const reconnectErrors = [
              'ECONNRESET',
              'ECONNREFUSED',
              'ETIMEDOUT',
              'EPIPE',
            ];
            return reconnectErrors.some((code) => err.message.includes(code));
          },
        });

        // Handle connection events
        redis.on('connect', () => {
          logger.log('Cache Redis connected');
        });

        redis.on('ready', () => {
          logger.log('Cache Redis ready');
        });

        redis.on('error', (err) => {
          logger.error(`Cache Redis error: ${err.message}`, err.stack);
        });

        redis.on('close', () => {
          logger.log('Cache Redis connection closed');
        });

        redis.on('reconnecting', () => {
          logger.log('Cache Redis reconnecting...');
        });

        return redis;
      },
    },
    CacheService,
  ],
  exports: [CacheService, CACHE_CLIENT],
})
export class CachingModule {}
