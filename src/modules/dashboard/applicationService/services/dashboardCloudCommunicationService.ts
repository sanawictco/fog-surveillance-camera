import { Injectable } from '@nestjs/common';
import { MqttService } from 'src/extensions/mqtt/mqtt.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { PageEntity } from '../../domain/page.entity';
import {
  BaseCloudCommunicationService,
  FogCloudConfigType,
} from 'src/modules/shared/cloudConfig/baseCloudCommunication.service';

@Injectable()
export class DashboardCloudCommunicationService extends BaseCloudCommunicationService {
  constructor(mqttService: MqttService, serviceProvider: ServiceProvider) {
    super(mqttService, serviceProvider);
  }

  protected getConfigType(): FogCloudConfigType {
    return 'page';
  }

  protected getSoftwareConfigTopic(): string {
    return PageEntity.getFogPubToCloudMqttTopics().pageConfig;
  }
}
