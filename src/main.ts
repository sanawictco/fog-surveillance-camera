import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import AppConfig from 'configs/app.config';
import { AppModule } from './app.module';
import { setupSwaggerRegisteration } from './utilities/swaggerRegisteration';
import { ShutdownOrchestratorService } from './extensions/shutdown/shutdown.service';
import {
  assertNotTestEnvInProd,
  assertRedisNoeviction,
} from './extensions/bootChecks/bootChecks';
import type { Redis } from 'ioredis';
import { CACHE_CLIENT } from './extensions/caching/diTokens/cache.diToken';
import { registerBodyParsers } from './utilities/bodyParserRegistration';
import { AuthenticatedIoAdapter } from './extensions/websocket/authenticated-io.adapter';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  assertNotTestEnvInProd();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  setupSwaggerRegisteration(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  const logger = app.get(Logger);
  app.useLogger(logger);

  const isProduction = AppConfig().environment === 'production';
  try {
    const redis = app.get<Redis>(CACHE_CLIENT);
    await assertRedisNoeviction(redis, logger);
  } catch (e) {
    if (isProduction) throw e;
    logger.warn(
      `[bootChecks] Redis noeviction check skipped: ${(e as Error).message}`,
    );
  }

  registerBodyParsers(app);
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.use(cookieParser());
  app.useWebSocketAdapter(new AuthenticatedIoAdapter(app));

  const orchestrator = app.get(ShutdownOrchestratorService);
  let isShuttingDown = false;
  const activeRequests = new Set<Promise<void>>();

  app.use((_req: Request, res: Response, next: NextFunction) => {
    if (isShuttingDown) {
      res.status(503).send('Service is shutting down');
      return;
    }

    let finishRequest!: () => void;
    const requestFinished = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    activeRequests.add(requestFinished);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      activeRequests.delete(requestFinished);
      finishRequest();
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  });

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const forceKill = setTimeout(() => {
      console.error('[SHUTDOWN] Force-kill after 30s timeout');
      process.exit(1);
    }, 30_000);
    forceKill.unref();

    let exitCode = 0;
    try {
      await Promise.allSettled([...activeRequests]);
      await orchestrator.onApplicationShutdown(signal);
      await app.close();
    } catch (err) {
      console.error('[SHUTDOWN] Error during graceful shutdown:', err);
      exitCode = 1;
    } finally {
      (logger as any).logger?.flush?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
      clearTimeout(forceKill);
      process.exit(exitCode);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen(AppConfig().port);
  logger.log(`Application listening on port ${AppConfig().port}`);

  let isEmergencyShuttingDown = false;

  const emergencyShutdown = async (reason: string, err?: unknown) => {
    if (isEmergencyShuttingDown) return;
    isEmergencyShuttingDown = true;

    if (isShuttingDown) return;
    isShuttingDown = true;

    console.error(`\n[EMERGENCY] Unhandled ${reason}:`, err);

    const forceKillTimeout = setTimeout(() => {
      console.error('[EMERGENCY] Force-kill after 30s timeout');
      process.exit(1);
    }, 30_000);
    forceKillTimeout.unref();

    try {
      await app.close();
    } catch (closeErr) {
      console.error('[EMERGENCY] Error during emergency shutdown:', closeErr);
    } finally {
      clearTimeout(forceKillTimeout);
      process.exit(1);
    }
  };

  process.on('uncaughtException', (err) =>
    emergencyShutdown('uncaughtException', err),
  );

  process.on('unhandledRejection', (reason) =>
    emergencyShutdown('unhandledRejection', reason),
  );
}

bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  process.exit(1);
});
