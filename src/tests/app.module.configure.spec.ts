import { RequestMethod } from '@nestjs/common';
import { configureAppMiddleware } from '../middlewareWiring';
import { CheckAccessToFogMiddleware } from '../modules/shared/checkAccessToFog.middleware';
import { ProtectionMiddleware } from '../modules/shared/protection.middleware';

describe('configureAppMiddleware', () => {
  it('applies CheckAccessToFogMiddleware and ProtectionMiddleware to every route except the health check', () => {
    const applied: Array<{
      middleware: unknown;
      excluded: unknown[];
      routes: unknown[];
    }> = [];
    const consumer: any = {
      apply(middleware: unknown) {
        const entry = { middleware, excluded: [] as unknown[], routes: [] as unknown[] };
        applied.push(entry);
        return {
          exclude: (...args: unknown[]) => {
            entry.excluded = args;
            return {
              forRoutes: (...routes: unknown[]) => {
                entry.routes = routes;
              },
            };
          },
        };
      },
    };

    configureAppMiddleware(consumer);

    expect(applied).toHaveLength(2);
    expect(applied.map((a) => a.middleware)).toEqual([
      CheckAccessToFogMiddleware,
      ProtectionMiddleware,
    ]);
    for (const entry of applied) {
      expect(entry.excluded).toEqual([
        { path: '/system-monitor/health', method: RequestMethod.GET },
      ]);
      expect(entry.routes).toEqual(['*']);
    }
  });
});
