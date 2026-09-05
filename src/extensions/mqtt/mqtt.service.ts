import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { connect, IClientOptions, MqttClient } from 'mqtt';
import * as MqttPattern from 'mqtt-pattern';
import { PageEntity } from 'src/modules/dashboard/domain/page.entity';
import { CloudRecoveryService } from 'src/modules/cloudConnection/applicationService/services/cloudRecovery.service';
import { CloudConnectionService } from 'src/modules/cloudConnection/applicationService/services/cloudConnection.service';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { ServiceProvider } from '../serviceProvider/serviceProvider.service';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';

const EXPECTED_OUTAGE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'ECONNRESET',
  'EPIPE',
]);

@Injectable()
export class MqttService
  implements
    OnApplicationBootstrap,
    OnModuleInit,
    OnModuleDestroy,
    IShutdownHandler
{
  private mqttClient?: MqttClient;
  private isShutDown = false;
  private connected = false;
  private hasLoggedOutage = false;
  private topicMatchers: Array<{
    pattern: string;
    matches: (topic: string) => boolean;
  }> = [];

  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.shutdownOrchestrator.registerHandler('MQTT', this);
  }

  async onApplicationBootstrap(): Promise<void> {
    const { server } = AppConfig().mqtt;
    const { protocol, host, port, ...options } = server;
    const connectUrl = `${protocol}://${host}:${port}`;
    this.mqttClient = connect(connectUrl, options as IClientOptions);

    this.topicMatchers = [
      ...new Set([
        ...Object.values(NvrEntity.getFogSubOnCloudMqttTopics()),
        ...Object.values(CameraEntity.getFogSubOnCloudMqttTopics()),
        ...Object.values(PageEntity.getFogSubOnCloudMqttTopics()),
      ]),
    ].map((pattern) => ({
      pattern,
      matches: (topic: string) => MqttPattern.matches(pattern, topic),
    }));

    this.mqttClient.on('connect', () => {
      const wasOffline = !this.connected;
      this.connected = true;
      this.hasLoggedOutage = false;
      if (wasOffline) {
        this.serviceProvider.logger.log(
          `MQTT connected to ${connectUrl} (clientId=${options.clientId})`,
        );
      }
      this.resubscribeAll();
    });

    this.mqttClient.on('reconnect', () =>
      this.serviceProvider.logger.debug('MQTT reconnect attempt'),
    );
    this.mqttClient.on('close', () => {
      if (!this.connected) return;
      this.connected = false;
      this.serviceProvider.logger.warn('MQTT connection closed');
    });
    this.mqttClient.on('error', (err: Error & { code?: string | number }) => {
      const code = typeof err.code === 'string' ? err.code : undefined;
      if (code && EXPECTED_OUTAGE_ERROR_CODES.has(code)) {
        if (!this.hasLoggedOutage) {
          this.hasLoggedOutage = true;
          this.serviceProvider.logger.warn(
            `MQTT broker unreachable (${code}); reconnect will continue`,
          );
        }
        return;
      }
      this.serviceProvider.logger.error(
        `MQTT client error: ${err.message}`,
        err,
      );
    });

    this.registerMessageHandler();
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;
    if (!this.mqttClient) return;

    const client = this.mqttClient;
    const timeoutMs = AppConfig().mqtt.shutdownTimeoutMs;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.serviceProvider.logger.warn(
          `MQTT graceful end timed out after ${timeoutMs}ms; forcing close`,
        );
        try {
          client.end(true, {}, finish);
        } catch {
          finish();
        }
      }, timeoutMs);

      try {
        client.end(false, {}, () => {
          this.serviceProvider.logger.log('MQTT disconnected gracefully');
          finish();
        });
      } catch (err) {
        this.serviceProvider.logger.error('MQTT graceful end failed', err);
        finish();
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }

  async mqttReconnect(): Promise<void> {
    if (!this.mqttClient || this.isShutDown || this.mqttClient.connected)
      return;
    try {
      this.mqttClient.reconnect();
    } catch (err) {
      this.serviceProvider.logger.error('MQTT manual reconnect failed', err);
    }
  }

  async publish(
    topic: string,
    data: string | object,
    qos: 0 | 1 | 2 = 2,
  ): Promise<void> {
    if (
      !CloudConnectionService.CLOUD_IS_AVAILABLE &&
      !CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED
    ) {
      this.serviceProvider.logger.debug(
        `MQTT publish skipped while cloud is offline: topic=${topic}`,
      );
      return;
    }
    if (!this.mqttClient || this.isShutDown) {
      throw new Error(
        `MQTT publish failed: client unavailable (topic=${topic})`,
      );
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const client = this.mqttClient;
    const timeoutMs = AppConfig().mqtt.publishTimeoutMs;
    await new Promise<void>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.serviceProvider.logger.warn(
          `MQTT publish timed out after ${timeoutMs}ms (topic=${topic})`,
        );
        resolve();
      }, timeoutMs);

      client.publish(topic, payload, { qos }, (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this.serviceProvider.logger.error(
            `MQTT publish failed: topic=${topic}`,
            err,
          );
        }
        resolve();
      });
    });
  }

  async subscribe(topic: string, qos: 0 | 1 | 2 = 2): Promise<void> {
    if (!this.mqttClient || this.isShutDown) {
      throw new Error(`MQTT subscribe failed: client unavailable (${topic})`);
    }
    const client = this.mqttClient;
    await new Promise<void>((resolve, reject) => {
      client.subscribe(topic, { qos }, (err) => {
        if (err) {
          this.serviceProvider.logger.error(
            `MQTT subscribe failed: topic=${topic}`,
            err,
          );
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private resubscribeAll(): void {
    for (const { pattern } of this.topicMatchers) {
      void this.subscribe(pattern).catch((err) =>
        this.serviceProvider.logger.error(
          `MQTT resubscribe failed: topic=${pattern}`,
          err,
        ),
      );
    }
  }

  private registerMessageHandler(): void {
    this.mqttClient?.on('message', (topic: string, payload: Buffer) => {
      const message = payload.toString();
      this.serviceProvider.logger.debug(
        `MQTT receive: topic=${topic} bytes=${payload.length}`,
      );
      for (const { pattern, matches } of this.topicMatchers) {
        if (!matches(topic)) continue;
        try {
          this.serviceProvider.eventEmitter.emit(pattern, { topic, message });
        } catch (err) {
          this.serviceProvider.logger.error(
            `MQTT listener failed: pattern=${pattern} topic=${topic}`,
            err,
          );
        }
      }
    });
  }
}
