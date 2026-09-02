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
  readonly id: AggregateID;
  readonly name: string;
  readonly tenantId: string;
  readonly serialNumber: string;
  readonly accessToken: string;
  readonly password: string;
  readonly maxCameras: number;
  readonly productModel: string;

  constructor(props: CommandProps<CreateNvrCommand>) {
    super(props);
    this.id = props.id || ('' as unknown as AggregateID);
    this.name = props.name;
    this.tenantId = props.tenantId;
    this.serialNumber = props.serialNumber;
    this.accessToken = props.accessToken;
    this.password = props.password;
    this.maxCameras = props.maxCameras;
    this.productModel = props.productModel;
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
      id: command.id,
      name: command.name,
      tenantId: command.tenantId,
      serialNumber: command.serialNumber,
      accessToken: command.accessToken,
      password: command.password,
      maxCameras: command.maxCameras,
      productModel: command.productModel,
    });
    await this.nvrRepo.insert(nvr);
    return nvr.id;
  }
}
