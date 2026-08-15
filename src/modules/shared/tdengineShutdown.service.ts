import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from 'src/extensions/shutdown/shutdown.service';
import { TDENGINE_CLIENT } from './timeseriesRepository';
import type { WsSql } from '@tdengine/websocket';

@Injectable()
export class TdengineShutdownService
  implements IShutdownHandler, OnModuleInit, OnModuleDestroy
{
  private isShutDown = false;

  constructor(
    @Inject(TDENGINE_CLIENT) private readonly client: WsSql,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  onModuleInit(): void {
    const driverSignalHandler = process
      .rawListeners('SIGTERM')
      .find((listener) =>
        listener.toString().includes('WebSocketConnectionPool'),
      );
    if (driverSignalHandler) {
      process.removeListener('SIGTERM', driverSignalHandler as any);
    }
    this.shutdownOrchestrator.registerHandler('TDengine', this);
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const gracefulClose = Promise.resolve()
      .then(async () => {
        if (typeof this.client?.close !== 'function') return false;
        await this.client.close();
        return true;
      })
      .catch(() => false);
    const closed = await Promise.race([
      gracefulClose,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (!closed) return;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }
}
