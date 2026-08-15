/* eslint-disable @typescript-eslint/no-unused-vars */
import axiosRetry from 'axios-retry';
import axios from 'axios';
import AppConfig from 'configs/app.config';
import { GLOBAL_ERROR_EVENT } from 'src/utilities/exception.filter';
import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

@Injectable()
export class CloudHTTPConnection {
  constructor(private readonly serviceProvider: ServiceProvider) {}

  async getFogConfigs(
    msgId: string,
    configType: 'device' | 'ruleChain' | 'page',
  ): Promise<any> {
    console.log(AppConfig().cloudHttpUrl);
    console.log(
      `${AppConfig().cloudHttpUrl}/fog-communication-manager/configs`,
    );
    axiosRetry(axios, {
      retries: 3, // number of retries
      retryDelay: (retryCount) => retryCount * 3000, // time interval between retries
    });
    const result = new Promise((resolve) => {
      axios
        .post(`${AppConfig().cloudHttpUrl}/fog-communication-manager/configs`, {
          accessToken: process.env.GATEWAY_ACCESS_TOKEN,
          serialNumber: process.env.GATEWAY_SERIAL_NUMBER,
          msgId: Number(msgId),
          configType,
        })
        .then((response) => {
          console.log('>>>>>>>>> CloudHTTPConnection Success');
          resolve({
            statusCode: 200,
            message: response.data,
          });
        })
        .catch(
          (err) => {
            console.log('>>>>>>>>> CloudHTTPConnection Failed', err);
            this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, err);
          },
          // resolve({
          //   statusCode: err.response.status,
          //   message: err.response.data,
          // }),
        );
    });
    return result;
  }
}
