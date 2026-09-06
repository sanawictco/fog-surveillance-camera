import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import type { MqttEventDataDto } from 'src/extensions/mqtt/dtos/mqttEventData.dto';
import { NvrEntity } from '../domain/nvr/nvr.entity';
import { VideoDevicesCloudCommunicationService } from '../applicationService/services/videoDevicesCloudCommunication.service.ts';
import { NvrConfigs } from '../domain/nvr/nvr.type';
import { NvrConfigsMqttService } from '../applicationService/services/mqtt/nvrConfigsMqtt.service';
import { CameraConfigsMqttService } from '../applicationService/services/mqtt/cameraConfigsMqtt.service';
import { CameraConfigs } from '../domain/camera/camera.type';

@Injectable()
export class VideoDeviceConfigsMqttController implements OnApplicationBootstrap {
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly videoDevicesCloudCommunicationService: VideoDevicesCloudCommunicationService,
    private readonly nvrConfigsMqttService: NvrConfigsMqttService,
    private readonly cameraConfigsMqttService: CameraConfigsMqttService,
  ) {}

  onApplicationBootstrap(): void {
    this.serviceProvider.eventEmitter.on(
      NvrEntity.getFogSubOnCloudMqttTopics().videoDeviceSoftwareConfigs,
      this.receive.bind(this),
    );
  }

  async receive(mqttEventData: MqttEventDataDto): Promise<void> {
    try {
      // await this.autoProvisioning.process(event.message);
      const { message } = mqttEventData;
      const msgId: string = message;
      const result: any =
        await this.videoDevicesCloudCommunicationService.getSoftwareConfigFromCloud(
          msgId,
        );
      const msg = result.message;
      this.serviceProvider.logger.debug(
        'device software config received',
        message,
        result,
      );
      if (!msg) return;
      const data: any = msg.data;

      const DATA_LESS_CONFIG_TYPES: ReadonlySet<string> = new Set([
        NvrConfigs.DELETE_NVR,
        NvrConfigs.FOG_LIVE_SIGNAL,
      ]);
      if (
        !DATA_LESS_CONFIG_TYPES.has(msg.configType) &&
        (typeof data !== 'object' || data === null)
      ) {
        throw new Error(
          `invalid or missing data payload for configType ${msg.configType}`,
        );
      }

      switch (msg.configType) {
        // nvr configs
        case NvrConfigs.ACTIVE_NVR:
          await this.nvrConfigsMqttService.active(msgId, data);
          break;
        case NvrConfigs.IN_ACTIVE_NVR:
          await this.nvrConfigsMqttService.inactive(msgId, data);
          break;
        case NvrConfigs.DELETE_NVR:
          await this.nvrConfigsMqttService.delete();
          break;
        case NvrConfigs.FOG_LIVE_SIGNAL:
          await this.nvrConfigsMqttService.fogLiveSignal(msgId);
          break;
        case NvrConfigs.UPDATE_NVR:
          await this.nvrConfigsMqttService.update(msgId, data);
          break;
        case NvrConfigs.REGISTER:
          await this.nvrConfigsMqttService.autoRegister(msgId, data);
          break;
        case NvrConfigs.SEARCH:
          await this.nvrConfigsMqttService.autoSearch();
          break;
        case NvrConfigs.ACTIVE_MULTI_CAMERAS:
          await this.nvrConfigsMqttService.activateCameras(msgId, data);
          break;
        case NvrConfigs.IN_ACTIVE_MULTI_CAMERAS:
          await this.nvrConfigsMqttService.inactivateCameras(msgId, data);
          break;
        case NvrConfigs.SOFT_DELETE_MULTI_CAMERAS:
          await this.nvrConfigsMqttService.softDeleteCameras(msgId, data);
          break;
        // camera configs
        case CameraConfigs.UPDATE_CAMERA:
          await this.cameraConfigsMqttService.update(msgId, data);
          break;
        default:
          throw new Error(`unsupported configType ${msg.configType}`);
      }
    } catch (error) {
      this.serviceProvider.logger.error(
        'NVR video-device configuration failed',
        (error as Error).stack,
      );
    }
  }
}
