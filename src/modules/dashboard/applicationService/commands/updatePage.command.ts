/* eslint-disable security/detect-object-injection */
import { BadRequestException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OrderStates } from 'src/dddLib/applicationService';
import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { PageEntity } from '../../domain/page.entity';
import { UpdatePageProps } from '../../domain/page.type';
import { Widget } from '../../domain/valueObjects/pageContent.vo';
import { PAGE_REPOSITORY } from '../../infra/diTokens/page.diToken';
import { PageRepository } from '../../infra/repositories/page.repository';
import { PageActorLogService } from '../services/pageActorLog.service';

export class UpdatePageCommand
  extends Command
  implements Partial<UpdatePageProps>
{
  readonly name?: string;
  readonly pageIndex?: number;
  readonly content?: Widget[];
  readonly runningConfigs?: Record<string, string>;

  constructor(props: CommandProps<UpdatePageCommand> & IdType) {
    super(props);
    this.name = props.name;
    this.pageIndex = props.pageIndex;
    this.content = props.content;
  }
}

@CommandHandler(UpdatePageCommand)
export class UpdatePageCommandHandler implements ICommandHandler<UpdatePageCommand> {
  constructor(
    @Inject(PAGE_REPOSITORY)
    private readonly pageRepo: PageRepository,
    private readonly pageActorLogService: PageActorLogService,
  ) {}

  async execute(command: UpdatePageCommand): Promise<AggregateID> {
    if (command.pageIndex !== undefined) {
      const pageEntities: PageEntity[] = await this.pageRepo.findAll({
        orderBy: { column: 'pageIndex', status: OrderStates.ASCENDING },
      });
      const pageEntity: PageEntity | undefined = pageEntities.find(
        (page) => page.id === command.id,
      );
      if (!pageEntity) throw new BadRequestException('not exists');
      const newPageIndex = command.pageIndex;
      const currPageIndex = pageEntity.getProps().pageIndex;
      pageEntities.splice(currPageIndex, 1);
      pageEntities.splice(newPageIndex, 0, pageEntity);
      for (const [index, page] of pageEntities.entries()) {
        if (index !== page.getProps().pageIndex) {
          page.update({ pageIndex: index });
          await this.pageRepo.update(page);
        }
      }
    }
    const pageEntity: PageEntity | undefined = await this.pageRepo.findById(
      command.id,
    );
    if (!pageEntity) throw new BadRequestException('not exists');

    const updateObj = {
      name: command.name,
      content: command.content,
    };
    const currentOrOldName = pageEntity.getProps().name;
    pageEntity.update(updateObj);
    await this.pageRepo.update(pageEntity);
    await this.processDependencies({
      pageEntity,
      currentOrOldName,
      updateObj,
    });
    return command.id;
  }
  private async processDependencies(props: {
    pageEntity: PageEntity;
    currentOrOldName: string;
    updateObj: any;
  }) {
    const { currentOrOldName, pageEntity, updateObj } = props;
    await this.pageActorLogService.update({
      pageEntity: pageEntity,
      updatePageProps: {
        currentOrOldName,
        updatedProps: updateObj,
      },
    });
  }
}
