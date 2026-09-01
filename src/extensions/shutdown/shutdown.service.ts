import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';

export interface IShutdownHandler {
  shutdown(): Promise<void>;
}

// Define the canonical order here - single source of truth
const SHUTDOWN_PRIORITY: Record<string, number> = {
  WebSocket: 1,
  Scheduler: 2,
  // Queue[*] will be 3 - handled by prefix match
  MQTT: 4,
  Cache: 5,
  TDengine: 6,
  MongoDB: 7,
};

function getPriority(label: string): number {
  if (label.startsWith('Queue[')) return 3;
  return SHUTDOWN_PRIORITY[label] ?? 99; // unknown handlers go last
}

@Injectable()
export class ShutdownOrchestratorService
  implements OnApplicationShutdown, OnModuleInit
{
  private readonly logger = new Logger(ShutdownOrchestratorService.name);
  private _isShuttingDown = false;

  private readonly handlers: Array<{
    label: string;
    handler: IShutdownHandler;
    priority: number;
  }> = [];

  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  onModuleInit() {
    this.logger.debug('Shutdown orchestrator initialized');
  }

  registerHandler(label: string, handler: IShutdownHandler): void {
    // A handler that registers after onApplicationShutdown has already
    // snapshotted/sorted the list would be silently dropped - never run, never
    // awaited. Rule chains re-register listeners post-bootstrap behind a
    // setTimeout, so a shutdown racing a very early boot can reach here late.
    // Surface it instead of swallowing; the registrant still owns its own
    // onModuleDestroy fallback.
    if (this._isShuttingDown) {
      this.logger.warn(
        `Handler "${label}" registered after shutdown began - it will not be orchestrated`,
      );
      return;
    }
    this.handlers.push({ label, handler, priority: getPriority(label) });
    this.logger.debug(`Registered shutdown handler: ${label}`);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this._isShuttingDown) {
      this.logger.warn(
        'Shutdown already in progress, skipping duplicate trigger',
      );
      return;
    }

    this._isShuttingDown = true;
    this.logger.log(`=== Graceful Shutdown Started (signal: ${signal}) ===`);

    // Sort by priority at shutdown time - registration order no longer matters
    const ordered = [...this.handlers].sort((a, b) => a.priority - b.priority);

    this.logger.log(
      `Shutdown order: ${ordered.map((h) => h.label).join(' -> ')}`,
    );

    for (const { label, handler } of ordered) {
      await this._runHandler(label, handler);
    }

    this.logger.log('=== Graceful Shutdown Complete ===');
  }

  private async _runHandler(
    label: string,
    handler: IShutdownHandler,
  ): Promise<void> {
    this.logger.log(`[${label}] Shutting down...`);
    const start = Date.now();
    const timeoutMs = 25_000;
    // Hold the timer handle so the happy path can clear it. Without this, when
    // handler.shutdown() wins the race the 25s timer stays armed and keeps the
    // event loop alive - sequential handlers would accumulate dangling timers.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`[${label}] Shutdown timed out after ${timeoutMs}ms`),
          ),
        timeoutMs,
      );
    });
    try {
      await Promise.race([handler.shutdown(), timeout]);
      this.logger.log(`[${label}] Done (${Date.now() - start}ms)`);
    } catch (err) {
      this.logger.error(
        `[${label}] Shutdown error (${Date.now() - start}ms):`,
        err,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
