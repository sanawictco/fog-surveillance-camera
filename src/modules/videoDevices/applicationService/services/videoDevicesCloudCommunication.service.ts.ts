import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { MqttService } from 'src/extensions/mqtt/mqtt.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import {
  BaseCloudCommunicationService,
  CloudConfigType,
} from 'src/modules/shared/cloudConfig/baseCloudCommunication.service';
import { NvrEntity } from '../../domain/nvr/nvr.entity';

@Injectable()
export class VideoDevicesCloudCommunicationService extends BaseCloudCommunicationService {
  constructor(
    @Inject(forwardRef(() => MqttService)) mqttService: MqttService,
    serviceProvider: ServiceProvider,
  ) {
    super(mqttService, serviceProvider);
  }

  protected getConfigType(): CloudConfigType {
    return 'videoDevice';
  }

  protected getSoftwareConfigTopic(): string {
    return NvrEntity.getFogPubToCloudMqttTopics().videoDeviceSoftwareConfigs;
  }
}
