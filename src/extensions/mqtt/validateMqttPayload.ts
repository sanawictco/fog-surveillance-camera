import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/**
 * Runtime-validate an already-JSON-parsed MQTT payload against a
 * class-validator-decorated DTO class. MQTT `@OnEvent` handlers bypass the
 * global Nest `ValidationPipe`, so without this a malformed/hostile fog
 * payload would flow straight into command/query dispatch (RC-03).
 *
 * Throws on any constraint failure; callers run inside the controller
 * try/catch that emits `GLOBAL_ERROR_EVENT`, so an invalid payload is
 * dropped before any side effect.
 */
export function validateMqttPayload<T extends object>(
  cls: new () => T,
  raw: unknown,
): T {
  const instance = plainToInstance(cls, raw);
  const errors = validateSync(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .filter(Boolean)
      .join('; ');
    throw new Error(
      `Invalid MQTT payload for ${cls.name}: ${details || 'validation failed'}`,
    );
  }
  return instance;
}
