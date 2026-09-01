import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Command } from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';

export class RestoreCamerasToCacheCommand extends Command {
  constructor() {
    super({ id: '' });
  }
}

@CommandHandler(RestoreCamerasToCacheCommand)
export class RestoreCamerasToCacheCommandHandler implements ICommandHandler<RestoreCamerasToCacheCommand> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
  ) {}

  async execute(command: RestoreCamerasToCacheCommand): Promise<AggregateID> {
    await this.cameraRepo.restoreAndInitRecordsToCache();
    return command.id;
  }
}
