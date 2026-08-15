import { AggregateID } from 'src/dddLib/core';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PAGE_REPOSITORY } from '../../infra/diTokens/page.diToken';
import { PageRepository } from '../../infra/repositories/page.repository';
import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { PageEntity } from '../../domain/page.entity';
import { PageActorLogService } from '../services/pageActorLog.service';

export class DeletePageCommand extends Command {
  constructor(props: CommandProps<DeletePageCommand> & IdType) {
    super(props);
  }
}

@CommandHandler(DeletePageCommand)
export class DeletePageCommandHandler implements ICommandHandler<DeletePageCommand> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    private readonly pageRepo: PageRepository,
    private readonly pageActorLogService: PageActorLogService,
  ) {}

  async execute(command: DeletePageCommand): Promise<AggregateID> {
    const pageEntity: PageEntity | undefined = await this.pageRepo.findById(
      command.id,
    );
    if (!pageEntity) throw new Error('no page exist with this id');
    const pageEntities = await this.pageRepo.findAll({
      filter: {
        pageIndex: { $gt: pageEntity.getProps().pageIndex },
      },
    });
    for (const pageEntity of pageEntities) {
      pageEntity.update({ pageIndex: pageEntity.getProps().pageIndex - 1 });
      await this.pageRepo.update(pageEntity);
    }
    pageEntity.delete();
    await this.pageRepo.delete(pageEntity);
    const actorId = command.actorProps?.actorId;
    await this.processDependencies(pageEntity, actorId);
    return command.id;
  }
  private async processDependencies(pageEntity: PageEntity, actorId?: string) {
    await this.pageActorLogService.delete({
      pageEntity,
      actorId,
    });
  }
}
