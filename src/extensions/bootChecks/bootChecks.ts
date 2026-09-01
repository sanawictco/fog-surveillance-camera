import type { Redis } from 'ioredis';

/**
 * Boot-time safety checks for the Fog gateway. Wire both into main.ts:
 *
 *   import { assertNotTestEnvInProd, assertRedisNoeviction } from './extensions/bootChecks/bootChecks';
 *
 *   assertNotTestEnvInProd();                       // FIRST line of bootstrap(), before NestFactory.create
 *   // ... after the app is built and the Redis client is ready, before app.listen():
 *   // const redis = app.get<Redis>(REDIS_CLIENT);  // your ioredis provider/token
 *   // await assertRedisNoeviction(redis, app.get(Logger));
 */

/**
 * Refuse to boot a real process under NODE_ENV=test.
 *
 * Why: in this platform NODE_ENV=test is a backdoor — it short-circuits auth and external calls.
 * It is legitimate ONLY inside the Jest runner (which sets JEST_WORKER_ID). If a real/production
 * process is started with NODE_ENV=test, auth is effectively disabled. Fail closed.
 */
export function assertNotTestEnvInProd(): void {
  const isTest = process.env.NODE_ENV === 'test';
  const underJest = typeof process.env.JEST_WORKER_ID !== 'undefined';
  if (isTest && !underJest) {
    throw new Error(
      'Refusing to start: NODE_ENV=test outside the Jest runner. ' +
        'Test env disables auth and external calls — it must never run a real process. ' +
        'Set NODE_ENV=development or NODE_ENV=production.',
    );
  }
}

export function assertMqttProductionSecurity(config: {
  brokerUrl: string;
  apiUrl: string;
  username: string;
  password: string;
}): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (!config.brokerUrl.startsWith('mqtts://')) {
    throw new Error(
      '[bootChecks] MQTT broker URL must use mqtts:// in production',
    );
  }
  if (!config.apiUrl.startsWith('https://')) {
    throw new Error(
      '[bootChecks] EMQX management API URL must use https:// in production',
    );
  }
  if (!config.username.trim() || !config.password.trim()) {
    throw new Error(
      '[bootChecks] MQTT client credentials are required in production',
    );
  }
}

type MinimalLogger = {
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/**
 * Require Redis maxmemory-policy = 'noeviction' in production.
 *
 * Why: the rule-engine "never duplicate" guarantee depends on Redis lock keys (chain/device
 * mutex), which live on the cache DB (db0) of the single Fog Redis instance. maxmemory-policy is
 * INSTANCE-level, so an evicting policy (e.g. allkeys-lru) could evict a live lock key while a
 * state-mutating command holds it -> a second chain step proceeds against stale state ->
 * DUPLICATE physical actuation. The dev compose sets noeviction; the prod compose currently does
 * not — this assert closes that gap at boot.
 *
 * Fail behavior: throws in production if the policy is readable and wrong. If CONFIG GET is
 * forbidden (some managed Redis), it does NOT brick the service — it logs loudly so the
 * unverifiable state is visible.
 */
export async function assertRedisNoeviction(
  redis: Redis,
  logger?: MinimalLogger,
): Promise<void> {
  const log: MinimalLogger = logger ?? console;
  const isProd = process.env.NODE_ENV === 'production';

  let policy: string | undefined;
  try {
    const res = (await redis.config('GET', 'maxmemory-policy')) as unknown as [
      string,
      string,
    ];
    policy = Array.isArray(res) ? res[1] : undefined;
  } catch (err) {
    log.warn(
      `[bootChecks] Could not read Redis maxmemory-policy (${(err as Error).message}). ` +
        "Cannot verify 'noeviction'; ensure the queue/lock Redis is configured noeviction before deploy.",
    );
    return;
  }

  if (policy && policy !== 'noeviction') {
    const msg =
      `[bootChecks] Redis maxmemory-policy='${policy}', expected 'noeviction'. ` +
      'An evicting policy can drop rule-engine lock keys -> duplicate physical actuation.';
    if (isProd) {
      throw new Error(`${msg} Refusing to start in production.`);
    }
    log.warn(`${msg} (non-production: continuing — fix before deploy.)`);
  }
}
