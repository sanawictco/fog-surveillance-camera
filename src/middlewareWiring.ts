import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { CheckAccessToFogMiddleware } from './modules/shared/checkAccessToFog.middleware';
import { ProtectionMiddleware } from './modules/shared/protection.middleware';

const HEALTH_CHECK_ROUTE = {
  path: '/system-monitor/health',
  method: RequestMethod.GET,
} as const;

export function configureAppMiddleware(consumer: MiddlewareConsumer): void {
  for (const middleware of [CheckAccessToFogMiddleware, ProtectionMiddleware]) {
    consumer.apply(middleware).exclude(HEALTH_CHECK_ROUTE).forRoutes('*');
  }
}
