import { Injectable } from '@nestjs/common';
import { ActorLogApiService } from 'src/modules/actorLogs/applicationService/services/actorLogApi.service';
import { PageEntity } from '../../domain/page.entity';
import { LanguageKeys } from 'src/extensions/translation/languageKeys.base';
import { UpdatePageRequestDto } from '../contracts/updatePage.request.dto';

@Injectable()
export class PageActorLogService {
  constructor(private readonly actorLogApiService: ActorLogApiService) {}
  async create(props: { pageEntity: PageEntity }) {
    const { name } = props.pageEntity.getProps();
    await this.actorLogApiService.registerActorLog({
      messageProps: {
        key: LanguageKeys.dashboard.actorLog.created,
        params: [name],
      },
    });
  }
  async update(props: {
    pageEntity: PageEntity;
    updatePageProps: {
      currentOrOldName: string;
      updatedProps: UpdatePageRequestDto;
    };
  }) {
    const { currentOrOldName, updatedProps } = props.updatePageProps;
    const { name, destIndex, content } = updatedProps;

    if (name) {
      await this.actorLogApiService.registerActorLog({
        messageProps: {
          key: LanguageKeys.dashboard.actorLog.nameUpdated,
          params: [currentOrOldName, name],
        },
      });
    }
    if (destIndex) {
      await this.actorLogApiService.registerActorLog({
        messageProps: {
          key: LanguageKeys.dashboard.actorLog.pageIndexUpdated,
          params: [currentOrOldName],
        },
      });
    }
    if (content) {
      await this.actorLogApiService.registerActorLog({
        messageProps: {
          key: LanguageKeys.dashboard.actorLog.contentUpdated,
          params: [currentOrOldName],
        },
      });
    }
  }
}
