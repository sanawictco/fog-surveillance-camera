import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { CreateNvrProps } from 'src/modules/videoDevices/domain/nvr/nvr.type';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';

export class CreateNvrCommand extends Command implements CreateNvrProps {
  readonly name: string;
  readonly workstationId: string;
  readonly serialNumber: string;
  readonly accessToken: string;
  readonly password: string;
  readonly maxCameras: number;

  constructor(props: CommandProps<CreateNvrCommand>) {
    super(props);
    this.name = props.name;
    this.workstationId = props.workstationId;
    this.serialNumber = props.serialNumber;
    this.accessToken = props.accessToken;
    this.password = props.password;
    this.maxCameras = props.maxCameras;
  }
}

@CommandHandler(CreateNvrCommand)
export class CreateNvrCommandHandler implements ICommandHandler<CreateNvrCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    private readonly nvrRepo: NvrRepository,
  ) {}

  async execute(command: CreateNvrCommand): Promise<AggregateID> {
    const nvr = NvrEntity.create({
      name: command.name,
      workstationId: command.workstationId,
      serialNumber: command.serialNumber,
      accessToken: command.accessToken,
      password: command.password,
      maxCameras: command.maxCameras,
    });
    await this.nvrRepo.insert(nvr);
    return nvr.id;
  }
}
