import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';
import { FindAllCamerasQuery } from '../../queries/camera/findAllCameras.queryHandler';
import { InActiveCameraCommand } from '../camera/inactiveCamera.command';

export class InActiveNvrCommand extends Command {
  constructor(props: CommandProps<InActiveNvrCommand>) {
    super(props);
  }
}

@CommandHandler(InActiveNvrCommand)
export class InActiveNvrCommandHandler implements ICommandHandler<InActiveNvrCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    private readonly nvrRepo: NvrRepository,
    private readonly serviceProvider: ServiceProvider,
  ) {}

  async execute(command: InActiveNvrCommand): Promise<AggregateID> {
    const nvrEntity: NvrEntity | undefined = await this.nvrRepo.findById(
      command.id,
    );
    if (!nvrEntity) throw Error('not exist nvr with id');
    await this.processPreDependencies(nvrEntity);
    nvrEntity.inactive();
    await this.nvrRepo.update(nvrEntity);
    return command.id;
  }

  private async processPreDependencies(nvrEntity: NvrEntity) {
    // inactive dependent cameras
    const dependentCameraEntities: CameraEntity[] =
      await this.serviceProvider.queryBus.execute(
        new FindAllCamerasQuery({
          filter: {
            nvrId: nvrEntity.id,
            isActive: true,
          },
        }),
      );
    for (const dependentCameraEntity of dependentCameraEntities) {
      await this.serviceProvider.commandBus.execute(
        new InActiveCameraCommand({
          id: dependentCameraEntity.id,
        }),
      );
    }
  }
}
