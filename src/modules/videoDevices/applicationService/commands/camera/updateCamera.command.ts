import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { CameraActorLogService } from '../../services/actorLogs/cameraActorLog.service';
import { CameraEntity } from '../../../domain/camera/camera.entity';
import { UpdateCameraProps } from 'src/modules/videoDevices/domain/camera/camera.type';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';
export class UpdateCameraCommand
  extends Command
  implements Partial<UpdateCameraProps>
{
  readonly name?: string;
  readonly liveSignalStatus?: LiveSignalStatuses;
  readonly runningConfigs?: Record<string, string>;

  constructor(props: CommandProps<UpdateCameraCommand> & IdType) {
    super(props);
    this.name = props.name;
    this.runningConfigs = props.runningConfigs;
  }
}

@CommandHandler(UpdateCameraCommand)
export class UpdateCameraCommandHandler implements ICommandHandler<UpdateCameraCommand> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
    protected readonly cameraActorLogService: CameraActorLogService,
  ) {}

  async execute(command: UpdateCameraCommand): Promise<AggregateID> {
    const cameraEntity: CameraEntity | undefined =
      await this.cameraRepo.findById(command.id);
    const updatedObj = {
      name: command.name,
      liveSignalStatus: command.liveSignalStatus,
      runningConfigs: command.runningConfigs,
    };
    if (!cameraEntity) throw new Error('entity not exists');
    cameraEntity.update(updatedObj);
    await this.cameraRepo.update(cameraEntity);
    const actorId = command.actorProps?.actorId;
    await this.processDependencies({
      cameraEntity,
      updatedObj,
      actorId,
    });
    return command.id;
  }

  private async processDependencies(props: {
    cameraEntity: CameraEntity;
    actorId?: string;
    updatedObj: any;
  }) {
    const { cameraEntity, actorId, updatedObj } = props;
    const currentOrOldName = cameraEntity.getProps().name;
    if (updatedObj.name)
      await this.cameraActorLogService.update({
        actorId,
        cameraEntity,
        updateCameraProps: {
          currentOrOldName,
          updatedProps: updatedObj,
        },
      });
  }
}
