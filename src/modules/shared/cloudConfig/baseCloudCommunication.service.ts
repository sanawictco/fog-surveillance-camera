import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { MqttService } from 'src/extensions/mqtt/mqtt.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { GLOBAL_ERROR_EVENT } from 'src/utilities/exception.filter';

export type CloudConfigType = 'videoDevice' | 'page';

export interface CloudConfigPayload {
  serialNumber: string;
  accessToken: string;
  msgId: string;
  configType: CloudConfigType;
}

export interface CloudConfigResponse {
  statusCode: number;
  message: unknown;
}

@Injectable()
export abstract class BaseCloudCommunicationService {
  constructor(
    protected readonly mqttService: MqttService,
    protected readonly serviceProvider: ServiceProvider,
  ) {}

  protected abstract getConfigType(): CloudConfigType;
  protected abstract getSoftwareConfigTopic(): string;

  protected async publishToMqtt(topic: string, msg: unknown): Promise<void> {
    await this.mqttService.publish(topic, JSON.stringify(msg));
  }

  async sendSoftwareConfigMsgId(msg: {
    msgId: string;
    mqttData?: {
      macAddresses?: string[];
      disconnectedMacAddresses?: string[];
      failedRegisteredCameraSerialNumbers?: string[];
      failedDeletedCameraSerialNumbers?: string[];
      failedActivatedCameraIds?: string[];
      failedInactivatedCameraIds?: string[];
      failedDeletedCameraIds?: string[];
    };
  }): Promise<void> {
    const topic = this.getSoftwareConfigTopic();
    await this.publishToMqtt(topic, { msgId: msg.msgId, ...msg.mqttData });
  }

  async getSoftwareConfigFromCloud(
    msgId: string,
  ): Promise<CloudConfigResponse> {
    try {
      const payload = this.buildCloudConfigPayload(msgId);
      const response = await this.serviceProvider.httpService.post(
        `${AppConfig().cloudHttpUrl}/fog-communication-manager/configs`,
        payload,
      );
      return {
        statusCode: 200,
        message: response.data,
      };
    } catch (err) {
      return this.handleCloudError(err, msgId);
    }
  }

  private buildCloudConfigPayload(msgId: string): CloudConfigPayload {
    return {
      serialNumber: AppConfig().nvrSerialNumber,
      accessToken: AppConfig().nvrAccessToken,
      msgId,
      configType: this.getConfigType(),
    };
  }

  private async handleCloudError(err: unknown, msgId: string): Promise<never> {
    const error = err instanceof Error ? err : new Error(String(err));
    this.logCloudError(msgId, error);
    this.serviceProvider.eventEmitter.emit(
      GLOBAL_ERROR_EVENT,
      new Error(error.message),
    );
    throw error;
  }

  protected logCloudError(msgId: string, error: Error): void {
    // Log only the message. `error` may still carry HttpService's enrichment
    // (`.response`/`.config`/`.request`, etc.) - and `.response.config.data`
    // is the JSON-serialized outgoing request body, which contains the
    // plaintext cloud access token (see buildCloudConfigPayload). Pino's
    // `err` serializer copies ALL own enumerable properties of an Error, so
    // passing the enriched object here would leak the token into logs. A
    // fresh, message-only Error keeps the log useful without that risk.
    this.serviceProvider.logger.error(
      'Cloud HTTP connection failed',
      new Error(error.message),
      {
        msgId,
        configType: this.getConfigType(),
      },
    );
  }
}
