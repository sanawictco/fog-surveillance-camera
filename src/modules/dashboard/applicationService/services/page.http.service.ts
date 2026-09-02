import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { OrderStates } from 'src/dddLib/applicationService';
import { AggregateID } from 'src/dddLib/core';
import { generateRandomMsgId } from 'src/dddLib/utils/randomIdGenerator';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { LanguageKeys } from 'src/extensions/translation/languageKeys.base';
import { WebsocketService } from 'src/extensions/websocket/websocket.service';
import { PageEntity } from '../../domain/page.entity';
import { PageConfigs } from '../../domain/page.type';
import { PageMapper } from '../../infra/page.mapper';
import { PageWebSocketTypes } from '../../shares/pageWebsocketTypes.enum';
import { CreatePageCommand } from '../commands/createPage.command';
import { UpdatePageCommand } from '../commands/updatePage.command';
import { CreatePageRequestDto } from '../contracts/createPage.request.dto';
import { CreatePageWsResponseDto } from '../contracts/createPage.wsResponse.dto';
import { PageResponseDto } from '../contracts/page.response.dto';
import { UpdatePageRequestDto } from '../contracts/updatePage.request.dto';
import { UpdatePageWsResponseDto } from '../contracts/updatePage.wsResponse.dto';
import { FindAllPagesQuery } from '../queries/findAllPages.queryHandler';
import { FindPageByIdQuery } from '../queries/findPageById.queryHandler';
import { PageValidator } from './page.validator';

@Injectable()
export class PagesHttpService {
  constructor(
    private readonly mapper: PageMapper,
    private readonly serviceProvider: ServiceProvider,
    private readonly websocketService: WebsocketService,
    private readonly pageValidator: PageValidator,
  ) {}
  async find(): Promise<PageResponseDto[]> {
    const pageEntitines: PageEntity[] =
      await this.serviceProvider.queryBus.execute(
        new FindAllPagesQuery({
          orderBy: { column: 'pageIndex', status: OrderStates.ASCENDING },
        }),
      );
    return this.mapper.toResponseAll(pageEntitines);
  }

  async findOne(id: AggregateID): Promise<PageResponseDto> {
    const pageEntity: PageEntity =
      await this.pageValidator.checkExistsPageWihtId(id);
    return this.mapper.toResponse(pageEntity);
  }

  async create(body: CreatePageRequestDto) {
    await this.pageValidator.checkAvoidPageDuplicationCreate(
      body.name,
      body.nvrId,
    );
    const newPageId = await this.serviceProvider.commandBus.execute(
      new CreatePageCommand({ ...body, tenantId: AppConfig().tenantId }),
    );
    const newPageEntity: PageEntity =
      await this.serviceProvider.queryBus.execute(
        new FindPageByIdQuery(newPageId),
      );
    const msgId: string = generateRandomMsgId();
    // Fired off-request; a throw here would be an uncaught exception (the
    // callback is sync), so isolate it from the process and log via pino.
    setTimeout(() => {
      try {
        this.websocketService.sendMessage<CreatePageWsResponseDto>(
          this.websocketService.channels.PAGES_SOCKET,
          {
            type: PageWebSocketTypes.CONFIG,
            data: this.mapper.toResponse(newPageEntity),
            message: this.serviceProvider.translatorService.translateByName(
              LanguageKeys.dashboard.response.http.created,
            ),
            metadata: {
              configType: PageConfigs.CREATE_PAGE,
              msgId,
            },
          },
        );
      } catch (err) {
        this.serviceProvider.logger.error(
          `create page WS broadcast failed for msgId ${msgId}`,
          err,
        );
      }
    }, 1000);
    return msgId;
  }

  async update(id: AggregateID, body: UpdatePageRequestDto) {
    const pageEntity: PageEntity =
      await this.pageValidator.checkExistsPageWihtId(id);
    if (body.name) {
      await this.pageValidator.checkAvoidPageDuplicationUpdate(
        id,
        body.name,
        pageEntity.getProps().nvrId,
      );
    }
    await this.serviceProvider.commandBus.execute(
      new UpdatePageCommand({ id, ...body, pageIndex: body.destIndex }),
    );
    const updatedPageEntity: PageEntity =
      await this.serviceProvider.queryBus.execute(new FindPageByIdQuery(id));
    const msgId: string = generateRandomMsgId();
    // Fired off-request; a throw here would be an uncaught exception (the
    // callback is sync), so isolate it from the process and log via pino.
    setTimeout(() => {
      try {
        this.websocketService.sendMessage<UpdatePageWsResponseDto>(
          this.websocketService.channels.PAGES_SOCKET,
          {
            type: PageWebSocketTypes.CONFIG,
            data: this.mapper.toResponse(updatedPageEntity),
            message: this.serviceProvider.translatorService.translateByName(
              LanguageKeys.dashboard.response.http.updated,
            ),
            metadata: {
              configType: PageConfigs.UPDATE_PAGE,
              msgId,
            },
          },
        );
      } catch (err) {
        this.serviceProvider.logger.error(
          `update page WS broadcast failed for msgId ${msgId}`,
          err,
        );
      }
    }, 1000);
    return msgId;
  }
}
