import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandProps, IdType } from 'src/dddLib/applicationService';
import { AggregateID } from 'src/dddLib/core';
import { NVR_REPOSITORY } from 'src/modules/videoDevices/infra/nvr/nvr.diToken';
import { NvrRepository } from 'src/modules/videoDevices/infra/nvr/nvr.repository';

export class ActiveNvrCommand extends Command {
  constructor(props: CommandProps<ActiveNvrCommand> & IdType) {
    super(props);
  }
}

@CommandHandler(ActiveNvrCommand)
export class ActiveNvrCommandHandler implements ICommandHandler<ActiveNvrCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    protected readonly nvrRepo: NvrRepository,
  ) {}

  async execute(command: ActiveNvrCommand): Promise<AggregateID> {
    const nvrEntity = await this.nvrRepo.findById(command.id);
    if (!nvrEntity) throw Error('not exist nvr with id');
    nvrEntity.active();
    await this.nvrRepo.update(nvrEntity);
    return command.id;
  }
}
