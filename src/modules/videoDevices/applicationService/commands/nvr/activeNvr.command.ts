import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';

export class ActiveNvrCommand extends Command {
  constructor(props: CommandProps<ActiveNvrCommand>) {
    super(props);
  }
}

@CommandHandler(ActiveNvrCommand)
export class ActiveNvrCommandHandler implements ICommandHandler<ActiveNvrCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    private readonly nvrRepo: NvrRepository,
  ) {}

  async execute(command: ActiveNvrCommand): Promise<AggregateID> {
    const nvrEntity: NvrEntity | undefined = await this.nvrRepo.findById(
      command.id,
    );
    if (!nvrEntity) throw Error('not exist nvr with id');
    nvrEntity.active();
    await this.nvrRepo.update(nvrEntity);
    return command.id;
  }
}
