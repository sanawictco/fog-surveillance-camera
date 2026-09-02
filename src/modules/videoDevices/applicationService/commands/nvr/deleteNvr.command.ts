import { Inject, forwardRef } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandProps, IdType } from 'src/dddLib/applicationService';
import { AggregateID } from 'src/dddLib/core';

import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { DashboardApiForVideoDevicesService } from 'src/modules/dashboard/applicationService/apiForAnotherServices/dashboardApiForVideoDevices.service';
import { TimeseriesRepository } from 'src/modules/shared/timeseriesRepository';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { NVR_REPOSITORY } from 'src/modules/videoDevices/infra/nvr/nvr.diToken';
import { NvrRepository } from 'src/modules/videoDevices/infra/nvr/nvr.repository';
import { FindAllCamerasQuery } from '../../queries/camera/findAllCameras.queryHandler';
import { DeleteCameraCommand } from '../camera/deleteCamera.command';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
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
    private readonly timeSeriesRepository: TimeseriesRepository,
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  async execute(command: DeleteNvrCommand): Promise<AggregateID> {
    const nvrEntity: NvrEntity | undefined = await this.nvrRepo.findById(
      command.id,
    );
    if (!nvrEntity) throw Error('nvr does not exist');
    await this.processPreDependencies(nvrEntity);
    nvrEntity.delete();
    await this.nvrRepo.delete(nvrEntity);
    return command.id;
  }

  private async processPreDependencies(nvrEntity: NvrEntity): Promise<void> {
    // delete dependent cameras
    const dependentCameraEntities: CameraEntity[] =
      await this.serviceProvider.queryBus.execute(
        new FindAllCamerasQuery({
          filter: {
            nvrId: nvrEntity.id,
          },
        }),
      );
    for (const dependentCameraEntity of dependentCameraEntities) {
      await this.serviceProvider.commandBus.execute(
        new DeleteCameraCommand({ id: dependentCameraEntity.id }),
      );
    }
    await this.dashboardApiForVideoDevicesService.deleteDependentPages();
    // clear tdengie db
    await this.timeSeriesRepository.clearDatabase();
    // drop mongo db
    if (!this.mongoConnection.db) {
      throw new Error('MongoDB connection not established');
    }
    await this.mongoConnection.db.dropDatabase();
    process.exit(0);
    // remove all volumes and poweroff the computer by bash script in outside current node process
  }
}
