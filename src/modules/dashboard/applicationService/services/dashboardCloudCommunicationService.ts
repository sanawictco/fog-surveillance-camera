import { Injectable } from '@nestjs/common';
import { MqttService } from 'src/extensions/mqtt/mqtt.service';
import axios from 'axios';
import AppConfig from 'configs/app.config';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { GLOBAL_ERROR_EVENT } from 'src/utilities/exception.filter';
import axiosRetry from 'axios-retry';
import { PageEntity } from '../../domain/page.entity';

@Injectable()
export class DashboardCloudCommunicationService {
  constructor(
    private readonly mqttService: MqttService,
    private readonly serviceProvider: ServiceProvider,
  ) {}
  async sendSoftwareConfigMsgId(msg: { msgId: string; mqttData?: any }) {
    const topic = PageEntity.getFogPubToCloudMqttTopics().pageConfig;
    await this.mqttService.publish(topic, JSON.stringify(msg));
  }

  async getSoftwareConfigFromCloud(msgId: string) {
    axiosRetry(axios, {
      retries: 3, // number of retries
      retryDelay: (retryCount) => retryCount * 3000, // time interval between retries
    });
    const result = new Promise((resolve, reject) => {
      axios
        .post(`${AppConfig().cloudHttpUrl}/fog-communication-manager/configs`, {
          accessToken: AppConfig().nvrAccessToken,
          serialNumber: AppConfig().nvrSerialNumber,
          msgId: Number(msgId),
          configType: 'page',
        })
        .then((response) => {
          resolve({
            statusCode: 200,
            message: response.data,
          });
        })
        .catch((err) => {
          console.log('>>>>>>>>> CloudHTTPConnection Failed', err);
          this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, err);
          reject(err);
        });
    });
    return result;
  }
}
