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
    IShutdownHandler,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly KEY_PREFIX = 'cache:';
  private _isShutDown = false;

  constructor(
    @Inject(CACHE_CLIENT) private readonly cache: Redis,
    private readonly loggerService: LoggerService,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}
  async onModuleInit(): Promise<void> {
    this.shutdownOrchestrator.registerHandler('Cache', this);
  }
  async onModuleDestroy(): Promise<void> {
    if (this._isShutDown) return;
    if (this.shutdownOrchestrator.isShuttingDown) return; // stand down for orchestrator
    await this.shutdown();
  }
  async onApplicationBootstrap() {
    try {
      // IMPORTANT: Never flush on bootstrap in production!
      // Only clean YOUR cache keys, never touch queue data
      const env = process.env.NODE_ENV;

      if (env === 'development' || env === 'test') {
        this.loggerService.log('Cleaning stale cache keys...');
        await this._cleanStaleCache();
      }

      // Verify connection
      await this.cache.ping();
      this.loggerService.log('Cache service initialized successfully');
    } catch (err) {
      this.loggerService.error('Error initializing cache service:', err);
      throw err;
    }
  }

  async shutdown(signal?: string) {
    if (this._isShutDown) return;
    this._isShutDown = true;

    this.loggerService.log(
      `Cache service shutting down (signal: ${signal})...`,
    );

    try {
      // quit() waits for pending commands to finish, then closes gracefully
      await this.cache.quit();
      this.loggerService.log('Cache Redis connection closed gracefully');
    } catch (err) {
      this.loggerService.error('Error during cache shutdown:', err);
      // Force disconnect if graceful shutdown fails
      this.cache.disconnect();
    }
  }

  private async _cleanStaleCache() {
    // ONLY delete keys with OUR prefix - never touch queue data!
    const keys = await this._scanKeys(`${this.KEY_PREFIX}*`);

    if (keys.length > 0) {
      // Delete in batches to avoid blocking Redis
      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await this.cache.del(...batch);
      }
      this.loggerService.log(
        `Cleared ${keys.length} stale cache keys on startup`,
      );
    } else {
      this.loggerService.log('No stale cache keys found');
    }
  }

  async set(key: string, value: T, ttlInSecond?: number): Promise<void> {
    if (this._isShutDown) {
      this.loggerService.warn(`Cannot set cache during shutdown: ${key}`);
      return;
    }

    // undefined does not survive a JSON round-trip (JSON.stringify(undefined)
    // is the JS value undefined, not a string) - storing it yields a garbage
    // entry. null is fine (round-trips as null), so only guard undefined.
    if (value === undefined) {
      this.loggerService.warn(`Refusing to cache undefined value: ${key}`);
      return;
    }

    const prefixedKey = `${this.KEY_PREFIX}${key}`;

    try {
      // Only attach an expiry for a positive TTL. A 0/negative TTL is treated
      // as "no expiry" (matching setMany) rather than sent to Redis as an
      // invalid EX argument that would throw.
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
      this.loggerService.error('Cache set error:', err);
      // Don't throw - degrade gracefully
    }
  }

  async get(key: string): Promise<T | undefined> {
    if (this._isShutDown) {
      this.loggerService.warn(`Cannot get cache during shutdown: ${key}`);
      return undefined;
    }

    const prefixedKey = `${this.KEY_PREFIX}${key}`;

    let value: string | null;
    try {
      value = await this.cache.get(prefixedKey);
    } catch (err) {
      this.loggerService.error('Cache get error:', err);
      return undefined; // Degrade gracefully on transient Redis errors
    }

    if (!value) return undefined;

    try {
      return JSON.parse(value);
    } catch (err) {
      // Corrupt (non-JSON) entry: it can never be read successfully and, with
      // no TTL, would poison every future read. Evict it best-effort so the
      // cache self-heals; delete() already swallows its own errors.
      this.loggerService.error(
        `Failed to parse cache value for key ${key}, evicting:`,
        err,
      );
      void this.delete(key);
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    if (this._isShutDown) {
      this.loggerService.warn(`Cannot delete cache during shutdown: ${key}`);
      return;
    }

    const prefixedKey = `${this.KEY_PREFIX}${key}`;

    try {
      await this.cache.del(prefixedKey);
    } catch (err) {
      this.loggerService.error('Cache delete error:', err);
    }
  }

  /**
   * Best-effort distributed mutex over the cache Redis connection. Single,
   * non-blocking attempt: returns a unique ownership token on success, or
   * null if the key is already locked (or Redis is unreachable). Pair every
   * non-null return with releaseLock(key, token) in a finally. Used to
   * serialize read-modify-write critical sections (e.g. device runningConfigs)
   * that would otherwise race across concurrent callers and duplicate the
   * underlying physical command.
   */
  async acquireLock(key: string, ttlInSecond: number): Promise<string | null> {
    if (this._isShutDown) return null;

    const lockKey = `${this.KEY_PREFIX}lock:${key}`;
    const token = randomUUID();

    try {
      const result = await this.cache.set(
        lockKey,
        token,
        'EX',
        Math.max(1, Math.ceil(ttlInSecond)),
        'NX',
      );
      return result === 'OK' ? token : null;
    } catch (err) {
      this.loggerService.error('Cache acquireLock error:', err);
      return null; // Degrade gracefully - caller decides how to proceed
    }
  }

  /**
   * Release a lock taken with acquireLock. Atomic compare-and-delete (Lua) so
   * a caller can only delete its own token - never a lock that already expired
   * and was re-taken by someone else. Best-effort: swallows transient errors.
   */
  async releaseLock(key: string, token: string): Promise<void> {
    if (this._isShutDown) return;

    const lockKey = `${this.KEY_PREFIX}lock:${key}`;
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      await this.cache.eval(luaScript, 1, lockKey, token);
    } catch (err) {
      this.loggerService.error('Cache releaseLock error:', err);
    }
  }

  // Batch operations for better performance
  async setMany(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    if (this._isShutDown) return;

    try {
      const pipeline = this.cache.pipeline();

      for (const entry of entries) {
        const prefixedKey = `${this.KEY_PREFIX}${entry.key}`;
        const ttl = entry.ttl;
        // Only attach an expiry for a positive TTL (matches set()); a
        // 0/negative ttl means "no expiry" instead of an invalid EX arg.
        if (ttl === undefined || ttl <= 0)
          pipeline.set(prefixedKey, JSON.stringify(entry.value));
        else pipeline.set(prefixedKey, JSON.stringify(entry.value), 'EX', ttl);
      }

      // pipeline.exec() resolves even when individual commands fail - their
      // errors arrive as the first element of each [err, result] tuple and
      // would otherwise be lost silently. Surface them without throwing.
      const results = await pipeline.exec();
      if (results) {
        for (const [err] of results) {
          if (err) this.loggerService.error('Cache setMany entry error:', err);
        }
      }
    } catch (err) {
      // Don't throw - degrade gracefully (matches set()).
      this.loggerService.error('Cache setMany error:', err);
    }
  }

  async getMany(keys: string[]): Promise<Map<string, T>> {
    if (this._isShutDown) return new Map();

    const result = new Map<string, T>();
    if (keys.length === 0) return result;

    const prefixedKeys = keys.map((k) => `${this.KEY_PREFIX}${k}`);

    let values: (string | null)[];
    try {
      values = await this.cache.mget(...prefixedKeys);
    } catch (err) {
      // Don't throw - degrade gracefully (matches get()); callers treat a
      // missing entry as a cache miss and fall back.
      this.loggerService.error('Cache getMany error:', err);
      return result;
    }

    // Even cleaner with entries()
    for (const [index, key] of keys.entries()) {
      const value = values[index];

      if (value) {
        try {
          result.set(key, JSON.parse(value));
        } catch (err) {
          // Corrupt entry - evict best-effort so it stops poisoning reads.
          this.loggerService.error(
            `Failed to parse cache value for key ${key}, evicting:`,
            err,
          );
          void this.delete(key);
        }
      }
    }

    return result;
  }
  private async _scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.cache.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200, // sweet spot: not too chatty, not too heavy per call
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
  // Clear all cache (use carefully!)
  async clearAll(): Promise<number> {
    if (this._isShutDown) return 0;

    const keys = await this._scanKeys(`${this.KEY_PREFIX}*`);
    if (keys.length === 0) return 0;

    const batchSize = 1000;
    for (let i = 0; i < keys.length; i += batchSize) {
      await this.cache.del(...keys.slice(i, i + batchSize));
    }

    this.loggerService.log(`Cleared ${keys.length} cache keys`);
    return keys.length;
  }

  // Get cache statistics
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsed: string;
  }> {
    if (this._isShutDown) return { totalKeys: 0, memoryUsed: 'unknown' };

    const keys = await this._scanKeys(`${this.KEY_PREFIX}*`);
    const info = await this.cache.info('memory');
    const regex = /used_memory_human:(.+)/;
    const memoryMatch = regex.exec(info);
    const memoryUsed = memoryMatch ? memoryMatch[1]!.trim() : 'unknown';

    return {
      totalKeys: keys.length,
      memoryUsed,
    };
  }

  async getKeysByPrefix(prefix: string): Promise<string[]> {
    if (this._isShutDown) return [];

    // Strip the internal KEY_PREFIX so callers get back the same key space
    // they pass to set/get/delete (which all add the prefix themselves).
    const prefixed = await this._scanKeys(`${this.KEY_PREFIX}${prefix}:*`);
    return prefixed.map((k) => k.slice(this.KEY_PREFIX.length));
  }

  // Check if cache is healthy
  async healthCheck(): Promise<boolean> {
    if (this._isShutDown) return false;

    try {
      const result = await this.cache.ping();
      return result === 'PONG';
    } catch (err) {
      this.loggerService.error('Cache health check failed:', err);
      return false;
    }
  }
}
