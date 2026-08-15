import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

export interface IShutdownHandler {
  shutdown(): Promise<void>;
}

const SHUTDOWN_PRIORITY: Record<string, number> = {
  WebSocket: 1,
  Scheduler: 2,
  MQTT: 4,
  Cache: 5,
  TDengine: 6,
};

function getPriority(label: string): number {
  if (label.startsWith('Application[')) return 0;
  if (label.startsWith('Queue[')) return 3;
  return SHUTDOWN_PRIORITY[label] ?? 99;
}

@Injectable()
export class ShutdownOrchestratorService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownOrchestratorService.name);
  private readonly handlers: Array<{
    label: string;
    handler: IShutdownHandler;
    priority: number;
  }> = [];
  private _isShuttingDown = false;

  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  registerHandler(label: string, handler: IShutdownHandler): void {
    if (this._isShuttingDown) {
      this.logger.warn(
        `Handler "${label}" registered after shutdown began; it will not be orchestrated`,
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
    this.logger.log(`Graceful shutdown started (signal: ${signal})`);

    const ordered = [...this.handlers].sort((a, b) => a.priority - b.priority);
    this.logger.log(
      `Shutdown order: ${ordered.map(({ label }) => label).join(' -> ')}`,
    );

    for (const { label, handler } of ordered) {
      await this.runHandler(label, handler);
    }

    this.logger.log('Graceful shutdown complete');
  }

  private async runHandler(
    label: string,
    handler: IShutdownHandler,
  ): Promise<void> {
    this.logger.log(`[${label}] Shutting down...`);
    const start = Date.now();
    const timeoutMs = 25_000;
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
        `[${label}] Shutdown error (${Date.now() - start}ms)`,
        err,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
