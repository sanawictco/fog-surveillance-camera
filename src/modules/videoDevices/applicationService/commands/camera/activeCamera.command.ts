import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';
import { CameraEntity } from '../../../domain/camera/camera.entity';

export class ActiveCameraCommand extends Command {
  constructor(props: CommandProps<ActiveCameraCommand>) {
    super(props);
  }
}

@CommandHandler(ActiveCameraCommand)
export class ActiveCameraCommandHandler implements ICommandHandler<ActiveCameraCommand> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    private readonly cameraRepo: CameraRepository,
  ) {}

  async execute(command: ActiveCameraCommand): Promise<AggregateID> {
    const cameraEntity: CameraEntity | undefined =
      await this.cameraRepo.findById(command.id);
    if (!cameraEntity) throw new Error('no camera exist with this id');
    cameraEntity.active();
    await this.cameraRepo.update(cameraEntity);
    return command.id;
  }
}
