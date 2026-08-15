import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { CacheBase } from '../../dddLib/infra/cache.base';
import { LoggerService } from '../logger/logger.service';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';
import { CACHE_CLIENT } from './diTokens/cache.diToken';

@Injectable()
export class CacheService<T>
  implements
    CacheBase<T>,
    OnApplicationBootstrap,
    OnModuleInit,
    OnModuleDestroy,
    IShutdownHandler
{
  private readonly keyPrefix = 'cache:';
  private isShutDown = false;

  constructor(
    @Inject(CACHE_CLIENT) private readonly cache: Redis,
    private readonly logger: LoggerService,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.shutdownOrchestrator.registerHandler('Cache', this);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test'
      ) {
        await this.cleanStaleCache();
      }
      await this.cache.ping();
      this.logger.log('Cache service initialized successfully');
    } catch (err) {
      this.logger.error('Error initializing cache service', err);
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;

    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const gracefulClose = this.cache
        .quit()
        .then(() => true)
        .catch(() => false);
      const closed = await Promise.race([
        gracefulClose,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 2_000);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (closed) {
        this.logger.log('Cache Redis connection closed gracefully');
      } else {
        this.logger.warn('Cache Redis close timed out; forcing disconnect');
        this.cache.disconnect();
      }
    } catch (err) {
      this.logger.error('Error during cache shutdown', err);
      this.cache.disconnect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }

  async set(key: string, value: T, ttlInSecond?: number): Promise<void> {
    if (this.isShutDown) {
      this.logger.warn(`Cannot set cache during shutdown: ${key}`);
      return;
    }
    if (value === undefined) {
      this.logger.warn(`Refusing to cache undefined value: ${key}`);
      return;
    }

    try {
      const prefixedKey = this.prefix(key);
      if (ttlInSecond !== undefined && ttlInSecond > 0) {
        await this.cache.set(
          prefixedKey,
          JSON.stringify(value),
          'EX',
          ttlInSecond,
        );
      } else {
        await this.cache.set(prefixedKey, JSON.stringify(value));
      }
    } catch (err) {
      this.logger.error('Cache set error', err);
    }
  }

  async get(key: string): Promise<T | undefined> {
    if (this.isShutDown) return undefined;

    let value: string | null;
    try {
      value = await this.cache.get(this.prefix(key));
    } catch (err) {
      this.logger.error('Cache get error', err);
      return undefined;
    }

    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      this.logger.error(`Invalid cache value for ${key}; evicting`, err);
      void this.delete(key);
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    if (this.isShutDown) return;
    try {
      await this.cache.del(this.prefix(key));
    } catch (err) {
      this.logger.error('Cache delete error', err);
    }
  }

  async acquireLock(key: string, ttlInSecond: number): Promise<string | null> {
    if (this.isShutDown) return null;
    const token = randomUUID();
    try {
      const result = await this.cache.set(
        this.prefix(`lock:${key}`),
        token,
        'EX',
        Math.max(1, Math.ceil(ttlInSecond)),
        'NX',
      );
      return result === 'OK' ? token : null;
    } catch (err) {
      this.logger.error('Cache acquireLock error', err);
      return null;
    }
  }

  async releaseLock(key: string, token: string): Promise<void> {
    if (this.isShutDown) return;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
      return 0
    `;
    try {
      await this.cache.eval(script, 1, this.prefix(`lock:${key}`), token);
    } catch (err) {
      this.logger.error('Cache releaseLock error', err);
    }
  }

  async setMany(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    if (this.isShutDown) return;
    try {
      const pipeline = this.cache.pipeline();
      for (const { key, value, ttl } of entries) {
        if (value === undefined) continue;
        if (ttl !== undefined && ttl > 0) {
          pipeline.set(this.prefix(key), JSON.stringify(value), 'EX', ttl);
        } else {
          pipeline.set(this.prefix(key), JSON.stringify(value));
        }
      }
      const results = await pipeline.exec();
      for (const [err] of results ?? []) {
        if (err) this.logger.error('Cache setMany entry error', err);
      }
    } catch (err) {
      this.logger.error('Cache setMany error', err);
    }
  }

  async getMany(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (this.isShutDown || keys.length === 0) return result;

    let values: Array<string | null>;
    try {
      values = await this.cache.mget(...keys.map((key) => this.prefix(key)));
    } catch (err) {
      this.logger.error('Cache getMany error', err);
      return result;
    }

    for (const [index, key] of keys.entries()) {
      const value = values[index];
      if (!value) continue;
      try {
        result.set(key, JSON.parse(value) as T);
      } catch (err) {
        this.logger.error(`Invalid cache value for ${key}; evicting`, err);
        void this.delete(key);
      }
    }
    return result;
  }

  async clearAll(): Promise<number> {
    if (this.isShutDown) return 0;
    const keys = await this.scanKeys(`${this.keyPrefix}*`);
    for (let index = 0; index < keys.length; index += 1000) {
      await this.cache.del(...keys.slice(index, index + 1000));
    }
    this.logger.log(`Cleared ${keys.length} cache keys`);
    return keys.length;
  }

  async getStats(): Promise<{ totalKeys: number; memoryUsed: string }> {
    if (this.isShutDown) return { totalKeys: 0, memoryUsed: 'unknown' };
    const [keys, info] = await Promise.all([
      this.scanKeys(`${this.keyPrefix}*`),
      this.cache.info('memory'),
    ]);
    const memoryMatch = /used_memory_human:(.+)/.exec(info);
    return {
      totalKeys: keys.length,
      memoryUsed: memoryMatch?.[1]?.trim() ?? 'unknown',
    };
  }

  async getKeysByPrefix(prefix: string): Promise<string[]> {
    if (this.isShutDown) return [];
    const keys = await this.scanKeys(`${this.keyPrefix}${prefix}:*`);
    return keys.map((key) => key.slice(this.keyPrefix.length));
  }

  async healthCheck(): Promise<boolean> {
    if (this.isShutDown) return false;
    try {
      return (await this.cache.ping()) === 'PONG';
    } catch (err) {
      this.logger.error('Cache health check failed', err);
      return false;
    }
  }

  private prefix(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async cleanStaleCache(): Promise<void> {
    const deleted = await this.clearAll();
    this.logger.log(`Cleared ${deleted} stale cache keys on startup`);
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.cache.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
