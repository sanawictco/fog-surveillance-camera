import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AggregateID } from 'src/dddLib/core';
import { Command } from 'src/dddLib/applicationService/command.base';
import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';

export class RestoreNvrsToCacheCommand extends Command {
  constructor() {
    super({ id: '' });
  }
}

@CommandHandler(RestoreNvrsToCacheCommand)
export class RestoreNvrsToCacheCommandHandler implements ICommandHandler<RestoreNvrsToCacheCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    protected readonly nvrRepo: NvrRepository,
  ) {}

  async execute(command: RestoreNvrsToCacheCommand): Promise<AggregateID> {
    await this.nvrRepo.restoreAndInitRecordsToCache();
    return command.id;
  }
}
