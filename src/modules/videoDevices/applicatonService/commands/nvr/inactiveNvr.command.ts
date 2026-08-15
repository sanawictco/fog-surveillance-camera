import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandProps, IdType } from 'src/dddLib/applicationService';
import { AggregateID } from 'src/dddLib/core';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { NVR_REPOSITORY } from 'src/modules/videoDevices/infra/nvr/nvr.diToken';
import { NvrRepository } from 'src/modules/videoDevices/infra/nvr/nvr.repository';
import { FindAllCamerasQuery } from '../../queries/camera/findAllCameras.queryHandler';
import { InActiveCameraCommand } from '../camera/inactiveCamera.command';

export class InActiveNvrCommand extends Command {
  constructor(props: CommandProps<InActiveNvrCommand> & IdType) {
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
    const nvrEntity = await this.nvrRepo.findById(command.id);
    if (!nvrEntity) throw Error('not exist nvr with id');
    nvrEntity.inactive();
    await this.nvrRepo.update(nvrEntity);
    await this.processDependencies(nvrEntity);
    return command.id;
  }

  private async processDependencies(nvrEntity: NvrEntity) {
    const dependentCameraEntities: CameraEntity[] =
      await this.serviceProvider.queryBus.execute(
        new FindAllCamerasQuery({
          filter: { nvrId: nvrEntity.id, isActive: true },
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
