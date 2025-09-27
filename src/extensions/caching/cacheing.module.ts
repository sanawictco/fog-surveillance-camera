import { Global, Module } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: 'CACHE_CLIENT',
      useFactory: () => {
        return new Redis({
          host: AppConfig().redis.host,
          port: AppConfig().redis.port,
        });
      },
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CachingModule {}
