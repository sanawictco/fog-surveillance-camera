import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { PageEntity } from '../../domain/page.entity';
import { CreatePageProps } from '../../domain/page.type';
import { PageTypes } from '../../domain/valueObjects/pageType.vo';
import { PAGE_REPOSITORY } from '../../infra/diTokens/page.diToken';
import { PageRepository } from '../../infra/repositories/page.repository';
import { PageActorLogService } from '../services/pageActorLog.service';

export class CreatePageCommand extends Command implements CreatePageProps {
  readonly generatedIdFromCloud?: string;
  readonly name: string;
  readonly nvrId: string;
  readonly type: PageTypes;
  constructor(props: CommandProps<CreatePageCommand>) {
    super(props);
    this.generatedIdFromCloud = props.generatedIdFromCloud;
    this.name = props.name;
    this.nvrId = props.nvrId;
    this.type = props.type;
  }
}

@CommandHandler(CreatePageCommand)
export class CreatePageCommandHandler implements ICommandHandler<CreatePageCommand> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    private readonly pageRepo: PageRepository,
    private readonly pageActorLogService: PageActorLogService,
  ) {}

  async execute(command: CreatePageCommand): Promise<AggregateID> {
    const maxPageIndexQuery = await this.pageRepo.aggregate({
      pageIndex: { $max: '$pageIndex' },
    });
    const pageEntity = PageEntity.create({
      generatedIdFromCloud: command.generatedIdFromCloud,
      name: command.name,
      nvrId: command.nvrId,
      pageIndex: maxPageIndexQuery[0] ? maxPageIndexQuery[0].pageIndex + 1 : 0,
      type: command.type,
    });
    await this.pageRepo.insert(pageEntity);
    const actorId = command.actorProps?.actorId;
    await this.processDependencies(pageEntity, actorId);
    return pageEntity.id;
  }
  private async processDependencies(pageEntity: PageEntity, actorId?: string) {
    await this.pageActorLogService.create({
      pageEntity,
      actorId,
    });
  }
}
