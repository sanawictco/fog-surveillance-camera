import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import AppConfig from 'configs/app.config';
import * as dns from 'dns';
import { MqttService } from 'src/extensions/mqtt/mqtt.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CloudRecoveryService } from '../cloudRecovery.service';
import { FindNvrByIdQuery } from 'src/modules/videoDevices/applicationService/queries/nvr/findNvrById.queryHandler';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { UpdateNvrCommand } from 'src/modules/videoDevices/applicationService/commands/nvr/updateNvr.command';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from 'src/extensions/shutdown/shutdown.service';

@Injectable()
export class CloudConnectionService
  implements
    OnApplicationBootstrap,
    OnModuleInit,
    OnModuleDestroy,
    IShutdownHandler
{
  static CLOUD_IS_AVAILABLE: boolean = false;
  static CLOUD_AVAILABILITY_QUEUE: boolean[] = []; // only include true elements as fake data
  private connectionCheckTimer?: ReturnType<typeof setInterval>;
  private isShutDown = false;
  private readonly activeOperations = new Set<Promise<void>>();
  private readonly cloudAvailabilityHandler =
    this.checkCloudIsAvailable.bind(this);

  constructor(
    private readonly serviceProvider: ServiceProvider,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
    @Inject(forwardRef(() => CloudRecoveryService))
    private readonly cloudRecoveryService: CloudRecoveryService,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.shutdownOrchestrator.registerHandler(
      'Application[CloudConnection]',
      this,
    );
  }

  async onApplicationBootstrap() {
    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(AppConfig().nvrId),
    );
    if (
      !nvrEntity ||
      !nvrEntity.getProps().isActive ||
      nvrEntity.getProps().cloudFailedAt === 0
    ) {
      CloudConnectionService.CLOUD_IS_AVAILABLE = true;
    }

    this.serviceProvider.eventEmitter.on(
      NvrEntity.getFogSubOnCloudMqttTopics().cloudIsAvailable,
      this.cloudAvailabilityHandler,
    );
    await this.checkingConnectionStatusWithCloudAtRuntime();
  }

  async checkingConnectionStatusWithCloudAtRuntime() {
    this.connectionCheckTimer = setInterval(() => {
      void this.track(this.checkConnectionStatus());
    }, 30000);
    this.connectionCheckTimer.unref?.();
  }

  checkCloudIsAvailable(): Promise<void> {
    return this.track(this.checkCloudIsAvailableNow());
  }

  private async checkConnectionStatus(): Promise<void> {
    if (this.isShutDown) return;
    if (CloudConnectionService.CLOUD_AVAILABILITY_QUEUE.length <= 1) {
      CloudConnectionService.CLOUD_AVAILABILITY_QUEUE.push(true);
      return;
    }

    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(AppConfig().nvrId),
    );
    if (
      !nvrEntity ||
      !nvrEntity.getProps().isActive ||
      nvrEntity.getProps().cloudFailedAt !== 0
    ) {
      return;
    }

    try {
      await dns.promises.lookup(new URL(AppConfig().cloudHttpUrl).hostname);
      await this.mqttService.mqttReconnect();
    } catch (err) {
      this.serviceProvider.logger.warn('Cloud connection check failed', err);
      CloudConnectionService.CLOUD_IS_AVAILABLE = false;
      await this.serviceProvider.commandBus.execute(
        new UpdateNvrCommand({
          id: AppConfig().nvrId,
          cloudFailedAt: Date.now() - 60_000,
        }),
      );
    }
  }

  private async checkCloudIsAvailableNow(): Promise<void> {
    if (this.isShutDown) return;
    console.log('cloud live signal -------------');
    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(AppConfig().nvrId),
    );

    CloudConnectionService.CLOUD_AVAILABILITY_QUEUE.shift();
    if (
      nvrEntity.getProps().isActive &&
      nvrEntity.getProps().cloudFailedAt !== 0
    ) {
      await this.cloudRecoveryService.startCloudRecoveryProcess(nvrEntity);
    } else {
      CloudConnectionService.CLOUD_IS_AVAILABLE = true;
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;
    if (this.connectionCheckTimer) clearInterval(this.connectionCheckTimer);
    this.serviceProvider.eventEmitter.off(
      NvrEntity.getFogSubOnCloudMqttTopics().cloudIsAvailable,
      this.cloudAvailabilityHandler,
    );
    await Promise.allSettled([...this.activeOperations]);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }

  private track(operation: Promise<void>): Promise<void> {
    const tracked = operation.catch((err) =>
      this.serviceProvider.logger.error(
        'Cloud connection background operation failed',
        err,
      ),
    );
    this.activeOperations.add(tracked);
    void tracked.then(() => this.activeOperations.delete(tracked));
    return tracked;
  }
}
