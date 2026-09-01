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
import { CreateCameraProps } from '../../../domain/camera/camera.type';
import { StreamsProps } from '../../../domain/camera/valueObjects/streams.vo';
import { CameraActorLogService } from '../../services/actorLogs/cameraActorLog.service';

export class CreateCameraCommand extends Command implements CreateCameraProps {
  readonly originId?: string;
  readonly name: string;
  readonly productModel: string;
  readonly username: string;
  readonly password: string;
  readonly macAddress: string;
  readonly port: number;
  readonly streams: StreamsProps;
  readonly hasPtz: boolean;
  readonly hasAudio: boolean;
  readonly nvrId: string;
  readonly serialNumber: string;
  constructor(props: CommandProps<CreateCameraCommand>) {
    super(props);
    this.originId = props.originId;
    this.name = props.name;
    this.productModel = props.productModel;
    this.username = props.username;
    this.password = props.password;
    this.macAddress = props.macAddress;
    this.port = props.port;
    this.streams = props.streams;
    this.hasPtz = props.hasPtz;
    this.hasAudio = props.hasAudio;
    this.nvrId = props.nvrId;
    this.serialNumber = props.serialNumber;
  }
}

@CommandHandler(CreateCameraCommand)
export class CreateCameraCommandHandler implements ICommandHandler<CreateCameraCommand> {
  constructor(
    @Inject(CAMERA_REPOSITORY)
    protected readonly cameraRepo: CameraRepository,
    protected readonly cameraActorLogService: CameraActorLogService,
  ) {}

  async execute(command: CreateCameraCommand): Promise<AggregateID> {
    const camera = CameraEntity.create({
      id: command.originId,
      name: command.name,
      productModel: command.productModel,
      serialNumber: command.serialNumber,
      username: command.username,
      password: command.password,
      macAddress: command.macAddress,
      port: command.port,
      streams: command.streams,
      hasPtz: command.hasPtz,
      hasAudio: command.hasAudio,
      nvrId: command.nvrId,
    });
    await this.cameraRepo.insert(camera);
    return camera.id;
  }
}
