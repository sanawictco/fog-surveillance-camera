import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { AggregateID, BaseEntityProps } from 'src/dddLib/core';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import {
  FogRegisterConfigDataDto,
  OperatoinOnMultiCamerasMqttRequestDto,
} from 'src/modules/videoDevices/contracts/mqtt/videoDeviceConfig.Mqttdto';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import {
  NvrConfigs,
  NvrProps,
} from 'src/modules/videoDevices/domain/nvr/nvr.type';
import { ActiveCameraCommand } from '../../commands/camera/activeCamera.command';
import { CreateCameraCommand } from '../../commands/camera/createCamera.command';
import { DeleteCameraCommand } from '../../commands/camera/deleteCamera.command';
import { CreateNvrCommand } from '../../commands/nvr/createNvr.command';
import { DeleteNvrCommand } from '../../commands/nvr/deleteNvr.command';
import { InActiveNvrCommand } from '../../commands/nvr/inactiveNvr.command';
import { UpdateNvrCommand } from '../../commands/nvr/updateNvr.command';
import { FindNvrByIdQuery } from '../../queries/nvr/findNvrById.queryHandler';
import { VideoDevicesCloudCommunicationService } from '../videoDevicesCloudCommunication.service.ts';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { FindCameraByIdQuery } from '../../queries/camera/findCameraById.queryHandler';
import { InActiveCameraCommand } from '../../commands/camera/inactiveCamera.command';
import { CameraDiscoveryService } from '../discovery/cameraDiscovery.service';
import { DiscoveredCamera } from 'src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.types';

@Injectable()
export class NvrConfigsMqttService {
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly videoDevicesCloudCommunicationService: VideoDevicesCloudCommunicationService,
    private readonly cameraDiscoveryService: CameraDiscoveryService,
  ) {}

  async update(msgId: string, data: NvrProps & BaseEntityProps) {
    const command = new UpdateNvrCommand({
      id: data.id,
      name: data.name,
      password: data.password,
      lang: data.lang,
    });
    await this.serviceProvider.commandBus.execute(command);
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }

  async active(msgId: string, data: NvrProps & BaseEntityProps) {
    let nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(data.id),
    );
    if (!nvrEntity) {
      await this.serviceProvider.commandBus.execute(new CreateNvrCommand(data));
      nvrEntity = await this.serviceProvider.queryBus.execute(
        new FindNvrByIdQuery(data.id),
      );
    }
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }

  async inactive(msgId: string, data: { id: AggregateID }) {
    const query = new FindNvrByIdQuery(data.id);
    const nvrEntity: NvrEntity =
      await this.serviceProvider.queryBus.execute(query);
    if (!nvrEntity) {
      this.serviceProvider.logger.error(
        'nvr software-config (inactive) for unknown id — cloud/local desync; not acking',
        { nvrId: data.id, msgId },
      );
      return;
    }
    if (!nvrEntity.getProps().isActive) {
      return await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId(
        { msgId },
      );
    }

    await this.serviceProvider.commandBus.execute(
      new InActiveNvrCommand({ id: data.id }),
    );
    return await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId(
      {
        msgId,
      },
    );
  }

  async delete() {
    const nvrId: AggregateID = AppConfig().nvrId as unknown as AggregateID;
    await this.serviceProvider.commandBus.execute(
      new DeleteNvrCommand({ id: nvrId }),
    );
  }

  async autoSearch() {
    const cameras = await this.cameraDiscoveryService.discover();
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId: NvrConfigs.SEARCH,
      mqttData: { discoveredCameras: cameras.map(toDiscoveredCameraDto) },
    });
  }

  async autoRegister(
    msgId: string,
    data: { autoRegisterRecord: FogRegisterConfigDataDto },
  ) {
    const { addedCameras, deletedCameras } = data.autoRegisterRecord;

    // handle only deletedCameras)
    const failedDeletedCameraSerialNumbers: string[] = [];
    if (addedCameras.length === 0) {
      for (const deletedCamera of deletedCameras) {
        try {
          await this.serviceProvider.commandBus.execute(
            new DeleteCameraCommand({ id: deletedCamera.id }),
          );
        } catch (err) {
          failedDeletedCameraSerialNumbers.push(deletedCamera.id);
          this.serviceProvider.logger.error(
            'auto register cameras: failed to delete camera; continuing with remaining cameras',
            { cameraId: deletedCamera.id, msgId, error: err },
          );
        }
      }
      return await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId(
        {
          msgId,
        },
      );
    }
    const failedRegisteredCameraSerialNumbers: string[] = [];
    for (const addedCamera of addedCameras) {
      try {
        await this.serviceProvider.commandBus.execute(
          new CreateCameraCommand({
            originId: addedCamera.id,
            ...addedCamera,
          }),
        );
        await this.serviceProvider.commandBus.execute(
          new ActiveCameraCommand({ id: addedCamera.id as AggregateID }),
        );
      } catch (err) {
        failedRegisteredCameraSerialNumbers.push(addedCamera.id);
        this.serviceProvider.logger.error(
          'auto register cameras: failed to register camera; continuing with remaining cameras',
          { cameraId: addedCamera.id, msgId, error: err },
        );
      }
    }
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
      mqttData: {
        failedRegisteredCameraSerialNumbers,
        failedDeletedCameraSerialNumbers,
      },
    });
  }

  async fogLiveSignal(msgId: string) {
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
    });
  }

  async activateCameras(
    msgId: string,
    data: OperatoinOnMultiCamerasMqttRequestDto,
  ) {
    const cameraIds = data.cameraIds;
    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(AppConfig().nvrId as unknown as AggregateID),
    );
    if (!nvrEntity) {
      this.serviceProvider.logger.error(
        'activate cameras: unknown nvr id — cloud/local desync; not acking',
        { nvrId: AppConfig().nvrId, msgId },
      );
      return;
    }
    const failedCameras: string[] = [];
    for (const cameraId of cameraIds) {
      try {
        const cameraEntity: CameraEntity =
          await this.serviceProvider.queryBus.execute(
            new FindCameraByIdQuery(cameraId),
          );
        if (!cameraEntity) {
          this.serviceProvider.logger.error(
            'activate cameras: unknown camera id — cloud/local desync; aborting batch, not acking',
            { cameraId, msgId },
          );
          return;
        }
        await this.serviceProvider.commandBus.execute(
          new ActiveCameraCommand({ id: cameraId }),
        );
      } catch (err) {
        failedCameras.push(cameraId);
        this.serviceProvider.logger.error(
          'activate cameras: failed to activate camera; continuing with remaining cameras',
          { cameraId, msgId, error: err },
        );
      }
    }
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
      mqttData: {
        failedActivatedCameraIds: failedCameras,
      },
    });
  }

  async inactivateCameras(
    msgId: string,
    data: OperatoinOnMultiCamerasMqttRequestDto,
  ) {
    const cameraIds = data.cameraIds;
    const nvrEntity: NvrEntity = await this.serviceProvider.queryBus.execute(
      new FindNvrByIdQuery(AppConfig().nvrId as unknown as AggregateID),
    );
    if (!nvrEntity) {
      this.serviceProvider.logger.error(
        'inactivate cameras: unknown nvr id — cloud/local desync; not acking',
        { nvrId: AppConfig().nvrId, msgId },
      );
      return;
    }
    const failedCameras: string[] = [];
    for (const cameraId of cameraIds) {
      try {
        const cameraEntity: CameraEntity =
          await this.serviceProvider.queryBus.execute(
            new FindCameraByIdQuery(cameraId),
          );
        if (!cameraEntity) {
          this.serviceProvider.logger.error(
            'inactive cameras: unknown camera id — cloud/local desync; aborting batch, not acking',
            { cameraId, msgId },
          );
          return;
        }
        await this.serviceProvider.commandBus.execute(
          new InActiveCameraCommand({ id: cameraId }),
        );
      } catch (err) {
        failedCameras.push(cameraId);
        this.serviceProvider.logger.error(
          'inactive cameras: failed to inactive camera; continuing with remaining cameras',
          { cameraId, msgId, error: err },
        );
      }
    }
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
      mqttData: {
        failedInactivatedCameraIds: failedCameras,
      },
    });
  }

  async softDeleteCameras(
    msgId: string,
    data: OperatoinOnMultiCamerasMqttRequestDto,
  ) {
    const cameraIds = data.cameraIds;
    const failedCameras: string[] = [];
    for (const cameraId of cameraIds) {
      try {
        const cameraEntity: CameraEntity =
          await this.serviceProvider.queryBus.execute(
            new FindCameraByIdQuery(cameraId),
          );
        if (!cameraEntity) continue;
        await this.serviceProvider.commandBus.execute(
          new DeleteCameraCommand({ id: cameraId }),
        );
      } catch (err) {
        failedCameras.push(cameraId);
        this.serviceProvider.logger.error(
          'soft delete cameras: failed to soft delete camera; continuing with remaining cameras',
          { cameraId, msgId, error: err },
        );
      }
    }
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId,
      mqttData: {
        failedDeletedCameraIds: failedCameras,
      },
    });
  }
}

// interfaceName is deliberately not published: it is a fog-local detail and
// means nothing to cloud.
function toDiscoveredCameraDto(camera: DiscoveredCamera): Record<string, unknown> {
  const { interfaceName, ...rest } = camera;
  return Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
}
