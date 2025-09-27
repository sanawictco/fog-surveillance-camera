import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheBase } from '../../dddLib/infra/cache.base';

@Injectable()
export class CacheService<T> implements CacheBase<T>, OnApplicationBootstrap {
  constructor(@Inject('CACHE_CLIENT') private cache: Redis) {}
  async onApplicationBootstrap() {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        this.cache.flushall((err, res) => {
          if (err) {
            return reject(err);
          }
          resolve(res as string | PromiseLike<string>);
        });
      });
      console.log('All Redis cache data removed:', result);
    } catch (err) {
      console.error('Error flushing Redis cache data:', err);
    }
  }

  async set(key: string, value: T, ttlInSecond?: number): Promise<void> {
    if (ttlInSecond)
      await this.cache.set(key, JSON.stringify(value), 'EX', ttlInSecond);
    else await this.cache.set(key, JSON.stringify(value));
  }

  async get(key: string): Promise<T | undefined> {
    const value = await this.cache.get(key);
    return value ? JSON.parse(value) : undefined;
  }

  async delete(key: string): Promise<void> {
    await this.cache.del(key);
  }
}
