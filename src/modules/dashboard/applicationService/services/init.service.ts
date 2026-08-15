import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from 'src/extensions/shutdown/shutdown.service';
import { RestorePagesToCacheCommand } from '../commands/restorePagesToCache.command';

@Injectable()
export class DashboardInitService
  implements
    OnApplicationBootstrap,
    OnModuleInit,
    OnModuleDestroy,
    IShutdownHandler
{
  private restoreTimer?: ReturnType<typeof setTimeout>;
  private restorePromise?: Promise<void>;
  private isShutDown = false;

  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.shutdownOrchestrator.registerHandler(
      'Application[DashboardInit]',
      this,
    );
  }

  onApplicationBootstrap(): void {
    this.restoreTimer = setTimeout(() => {
      if (this.isShutDown) return;
      this.restorePromise = this.serviceProvider.commandBus
        .execute(new RestorePagesToCacheCommand())
        .then(() => undefined)
        .catch((err) =>
          this.serviceProvider.logger.error(
            'Failed to restore pages to cache',
            err,
          ),
        );
    }, 3000);
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    await this.restorePromise;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }
}
