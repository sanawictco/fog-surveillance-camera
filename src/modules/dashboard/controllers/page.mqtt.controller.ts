import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { PageMqttService } from '../applicationService/services/page.mqtt.service';
import { PageEntity } from '../domain/page.entity';
import { PageConfigs } from '../domain/page.type';
import { DashboardCloudCommunicationService } from '../applicationService/services/dashboardCloudCommunicationService';
import { MqttEventDataDto } from 'src/extensions/mqtt/dtos/mqttEventData.dto';

@Injectable()
export class PageMqttController implements OnApplicationBootstrap {
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly dashboardCloudCommunicationService: DashboardCloudCommunicationService,
    private readonly pageMqttService: PageMqttService,
  ) {}
  onApplicationBootstrap() {
    this.serviceProvider.eventEmitter.on(
      PageEntity.getFogSubOnCloudMqttTopics().pageConfigs,
      this.receievePageConfigs.bind(this),
    );
  }
  async receievePageConfigs(mqttEventData: MqttEventDataDto) {
    try {
      const { message } = mqttEventData;
      const msgId: string = message;
      const result: any =
        await this.dashboardCloudCommunicationService.getSoftwareConfigFromCloud(
          msgId,
        );

      const msg = result.message;
      if (msgId) {
        const data: any = msg.data;
        switch (msg.configType) {
          case PageConfigs.CREATE_PAGE:
            await this.pageMqttService.create(msgId, data);
            break;
          case PageConfigs.UPDATE_PAGE:
            await this.pageMqttService.update(msgId, data);
            break;
          case PageConfigs.DELETE_PAGE:
            await this.pageMqttService.delete(msgId, data);
            break;

          default:
            break;
        }
      }
    } catch (err) {
      console.log(err);
      // this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, err);
    }
  }
}
