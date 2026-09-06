import { Inject, forwardRef } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';

import { DashboardApiForVideoDevicesService } from 'src/modules/dashboard/applicationService/apiForAnotherServices/dashboardApiForVideoDevices.service';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';
import { CameraEntity } from '../../../domain/camera/camera.entity';

export class DeleteCameraCommand extends Command {
  constructor(props: CommandProps<DeleteCameraCommand> & IdType) {
    super(props);
  }
}

@CommandHandler(DeleteCameraCommand)
export class DeleteCameraCommandHandler implements ICommandHandler<DeleteCameraCommand> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    private readonly cameraRepo: CameraRepository,
    @Inject(forwardRef(() => DashboardApiForVideoDevicesService))
    private readonly dashboardApiForVideoDevicesService: DashboardApiForVideoDevicesService,
  ) {}

  async execute(command: DeleteCameraCommand): Promise<AggregateID> {
    const cameraEntity: CameraEntity | undefined =
      await this.cameraRepo.findById(command.id);
    if (!cameraEntity) throw new Error('no camera exist with this id');
    cameraEntity.delete();
    await this.cameraRepo.delete(cameraEntity);
    await this.processDependencies(cameraEntity);
    return command.id;
  }

  private async processDependencies(cameraEntity: CameraEntity) {
    const { id } = cameraEntity.getProps();
    await this.dashboardApiForVideoDevicesService.deleteCameraEffectFromWidgets(
      id,
    );
  }
}
