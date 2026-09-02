import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID, BaseEntityProps } from 'src/dddLib/core';
import { CameraActorLogService } from '../../services/actorLogs/cameraActorLog.service';
import { CameraEntity } from '../../../domain/camera/camera.entity';
import {
  CameraProps,
  UpdateCameraProps,
} from 'src/modules/videoDevices/domain/camera/camera.type';
import { CAMERA_REPOSITORY } from 'src/modules/videoDevices/infra/camera/camera.diToken';
import { CameraRepository } from 'src/modules/videoDevices/infra/camera/camera.repository';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';
import { UpdateNvrProps } from 'src/modules/videoDevices/domain/nvr/nvr.type';
export class UpdateCameraCommand
  extends Command
  implements Partial<UpdateCameraProps>
{
  readonly name?: string;
  readonly liveSignalStatus?: LiveSignalStatuses;

  constructor(props: CommandProps<UpdateCameraCommand> & IdType) {
    super(props);
    this.name = props.name;
    this.liveSignalStatus = props.liveSignalStatus;
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
    };
    if (!cameraEntity) throw new Error('entity not exists');
    const previousProps = cameraEntity.getProps(); // snapshot before mutation
    cameraEntity.update(updatedObj);
    await this.cameraRepo.update(cameraEntity);
    await this.processDependencies({
      cameraEntity,
      previousProps,
      command,
    });
    return command.id;
  }

  private async processDependencies(props: {
    cameraEntity: CameraEntity;
    previousProps: CameraProps & BaseEntityProps;
    command: UpdateCameraCommand;
  }) {
    const { cameraEntity, previousProps, command } = props;
    const { name } = command;
    const changedProps: Partial<UpdateNvrProps> = {
      ...(name !== undefined && name !== previousProps.name && { name }),
    };
    const hasChanges = Object.keys(changedProps).length > 0;
    if (!hasChanges) return;
    const currentOrOldName = cameraEntity.getProps().name;
    if (command.name)
      await this.cameraActorLogService.update({
        cameraEntity,
        updateCameraProps: {
          currentOrOldName,
          updatedProps: { name: command.name },
        },
      });
  }
}
