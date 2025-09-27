export interface CacheBase<T> {
  set(key: string, value: T, ttlInSecond?: number): void;
  get(key: string): Promise<T | undefined>;
  delete(key: string): void;
}
