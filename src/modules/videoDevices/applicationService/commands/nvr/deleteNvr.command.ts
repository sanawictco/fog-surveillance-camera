import { Inject, forwardRef } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandProps, IdType } from 'src/dddLib/applicationService';
import { AggregateID } from 'src/dddLib/core';

import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { DashboardApiForVideoDevicesService } from 'src/modules/dashboard/applicationService/apiForAnotherServices/dashboardApiForVideoDevices.service';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { NVR_REPOSITORY } from 'src/modules/videoDevices/infra/nvr/nvr.diToken';
import { NvrRepository } from 'src/modules/videoDevices/infra/nvr/nvr.repository';
import { FindAllCamerasQuery } from '../../queries/camera/findAllCameras.queryHandler';
import { DeleteCameraCommand } from '../camera/deleteCamera.command';
export class DeleteNvrCommand extends Command {
  constructor(props: CommandProps<DeleteNvrCommand> & IdType) {
    super(props);
  }
}

@CommandHandler(DeleteNvrCommand)
export class DeleteNvrCommandHandler implements ICommandHandler<DeleteNvrCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    private readonly nvrRepo: NvrRepository,
    @Inject(forwardRef(() => DashboardApiForVideoDevicesService))
    private readonly dashboardApiForVideoDevicesService: DashboardApiForVideoDevicesService,
    private readonly serviceProvider: ServiceProvider,
  ) {}

  async execute(command: DeleteNvrCommand): Promise<AggregateID> {
    const nvrEntity = await this.nvrRepo.findById(command.id);
    if (!nvrEntity) throw Error('not exist nvr with id');
    await this.processDependencies();
    nvrEntity.delete();
    await this.nvrRepo.delete(nvrEntity);
    return command.id;
  }

  private async processDependencies(): Promise<void> {
    const cameraEntities: CameraEntity[] =
      await this.serviceProvider.queryBus.execute(new FindAllCamerasQuery());
    for (const cameraEntity of cameraEntities) {
      await this.serviceProvider.commandBus.execute(
        new DeleteCameraCommand({ id: cameraEntity.id }),
      );
    }
    await this.dashboardApiForVideoDevicesService.deleteDependentPages();
    // drop tdengie db
    // await this.timeSeriesDbService.dropDB();
    // drop mongo db
    // await connection.dropDatabase();//TODO is bugy
  }
}
