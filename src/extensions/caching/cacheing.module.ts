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
        const logger = new Logger('CacheRedis');
        const redis = new Redis({
          host: AppConfig().redis.host,
          port: AppConfig().redis.port,
          password: AppConfig().redis.password || undefined,
          db: 2,
          retryStrategy: (times: number) => Math.min(times * 50, 2000),
          enableReadyCheck: true,
          connectTimeout: 10_000,
          commandTimeout: 2_000,
          keepAlive: 30_000,
          maxRetriesPerRequest: null,
          reconnectOnError: (err: Error) =>
            ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].some((code) =>
              err.message.includes(code),
            ),
        });

        redis.on('connect', () => logger.log('Cache Redis connected'));
        redis.on('ready', () => logger.log('Cache Redis ready'));
        redis.on('error', (err) =>
          logger.error(`Cache Redis error: ${err.message}`, err.stack),
        );
        redis.on('close', () => logger.log('Cache Redis connection closed'));
        redis.on('reconnecting', () =>
          logger.log('Cache Redis reconnecting...'),
        );

        return redis;
      },
    },
    CacheService,
  ],
  exports: [CacheService, CACHE_CLIENT],
})
export class CachingModule {}
