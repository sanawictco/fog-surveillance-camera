import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AggregateID } from 'src/dddLib/core';
import { Command } from 'src/dddLib/applicationService/command.base';
import { PAGE_REPOSITORY } from '../../infra/page.diToken';
import { PageRepository } from '../../infra/page.repository';

export class RestorePagesToCacheCommand extends Command {
  constructor() {
    super({ id: '' });
  }
}

@CommandHandler(RestorePagesToCacheCommand)
export class RestorePagesToCacheCommandHandler implements ICommandHandler<RestorePagesToCacheCommand> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    protected readonly pageRepo: PageRepository,
  ) {}

  async execute(command: RestorePagesToCacheCommand): Promise<AggregateID> {
    await this.pageRepo.restoreAndInitRecordsToCache();
    return command.id;
  }
}
