import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import AppConfig from 'configs/app.config';
import * as bodyParser from 'body-parser';
import { setupSwaggerRegisteration } from './utilities/swaggerRegisteration';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AuthenticatedIoAdapter } from './extensions/websocket/authenticated-io.adapter';
import { ShutdownOrchestratorService } from './extensions/shutdown/shutdown.service';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
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

  if (AppConfig().environment !== 'production') {
    setupSwaggerRegisteration(app);
  }
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
  app.use(bodyParser.json({ limit: '5000mb' }));
  app.use(bodyParser.urlencoded({ limit: '5000mb', extended: true }));
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.use(cookieParser());
  app.useWebSocketAdapter(new AuthenticatedIoAdapter(app));

  const orchestrator = app.get(ShutdownOrchestratorService);
  let requestedExitCode = 0;

  const shutdown = async (signal: string, exitCode = 0) => {
    requestedExitCode = Math.max(requestedExitCode, exitCode);
    if (isShuttingDown) return;
    isShuttingDown = true;

    const watchdog = setTimeout(() => {
      console.error('[shutdown] Global shutdown deadline hit; forcing exit');
      process.exit(1);
    }, 30_000);
    watchdog.unref();

    try {
      // Reject new requests and let admitted requests finish while all
      // infrastructure dependencies are still available.
      await Promise.allSettled([...activeRequests]);
      await orchestrator.onApplicationShutdown(signal);
      await app.close();
      (logger as any).logger?.flush?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) {
      console.error('[shutdown] Error while closing application', err);
      requestedExitCode = 1;
    } finally {
      clearTimeout(watchdog);
      process.exit(requestedExitCode);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(AppConfig().port);

  logger.log(`Application listening on port ${AppConfig().port}`);

  process.on('uncaughtException', (err) => {
    try {
      logger.error('[EMERGENCY] Uncaught exception', err);
    } finally {
      void shutdown('uncaughtException', 1);
    }
  });

  process.on('unhandledRejection', (reason) => {
    try {
      logger.error('[EMERGENCY] Unhandled rejection', reason as any);
    } finally {
      void shutdown('unhandledRejection', 1);
    }
  });
}
bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  process.exit(1);
});
