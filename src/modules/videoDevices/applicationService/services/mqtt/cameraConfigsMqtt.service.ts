import { Injectable } from '@nestjs/common';
import { BaseEntityProps } from 'src/dddLib/core';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { VideoDevicesCloudCommunicationService } from '../videoDevicesCloudCommunication.service.ts';
import { CameraProps } from 'src/modules/videoDevices/domain/camera/camera.type';
import { UpdateCameraCommand } from '../../commands/camera/updateCamera.command.js';

@Injectable()
export class CameraConfigsMqttService {
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly videoDevicesCloudCommunicationService: VideoDevicesCloudCommunicationService,
  ) {}

  async update(msgId: string, data: CameraProps & BaseEntityProps) {
    const command = new UpdateCameraCommand({
      id: data.id,
      name: data.name,
    });
    await this.serviceProvider.commandBus.execute(command);
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }
}
