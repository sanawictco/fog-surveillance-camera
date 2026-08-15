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
import { RestoreCamerasToCacheCommand } from '../commands/camera/restoreCamerasToCache.command';
import { RestoreNvrsToCacheCommand } from '../commands/nvr/restoreNvrsToCache.command';

@Injectable()
export class VideoDevicesInitService
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
      'Application[VideoDevicesInit]',
      this,
    );
  }

  onApplicationBootstrap(): void {
    this.restoreTimer = setTimeout(() => {
      if (this.isShutDown) return;
      this.restorePromise = this.restoreRecords().catch((err) =>
        this.serviceProvider.logger.error(
          'Failed to restore video devices to cache',
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

  private async restoreRecords(): Promise<void> {
    await this.serviceProvider.commandBus.execute(
      new RestoreNvrsToCacheCommand(),
    );
    await this.serviceProvider.commandBus.execute(
      new RestoreCamerasToCacheCommand(),
    );
  }
}
