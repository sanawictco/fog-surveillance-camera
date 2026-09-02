import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { LanguageKeys } from 'src/extensions/translation/languageKeys.base';
import { ActorLogApiService } from 'src/modules/actorLogs/applicationService/services/actorLogApi.service';
import { ActorLogMessageProps } from 'src/modules/actorLogs/domain/actorLog.type';
import { UpdateNvrRequestDto } from '../../../contracts/nvr/http/updateNvr.request.dto';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';

@Injectable()
export class NvrActorLogService {
  constructor(
    @Inject(forwardRef(() => ActorLogApiService))
    private readonly actorLogApiService: ActorLogApiService,
  ) {}

  async update(props: {
    nvrEntity: NvrEntity;
    updatedNvrProps: {
      currentOrOldName: string;
      updatedProps: UpdateNvrRequestDto;
    };
  }) {
    const { nvrEntity, updatedNvrProps } = props;
    const { serialNumber } = nvrEntity.getProps();
    const { updatedProps, currentOrOldName } = updatedNvrProps;
    const newName = updatedProps.name;
    const newPassword = updatedProps.password;
    const newLang = updatedProps.lang;
    if (newName) {
      await this.actorLogApiService.registerActorLog({
        messageProps: {
          key: LanguageKeys.nvr.actorLog.nameUpdated,
          params: [currentOrOldName, serialNumber, newName],
        },
      });
    }
    if (newPassword) {
      await this.actorLogApiService.registerActorLog({
        messageProps: {
          key: LanguageKeys.nvr.actorLog.passwordUpdated,
          params: [currentOrOldName, serialNumber],
        },
      });
    }
    if (newLang) {
      const messageProps: ActorLogMessageProps | undefined = {
        key: '',
        params: [currentOrOldName, serialNumber],
      };
      if (newLang === LanguageCode.FA)
        messageProps.key = LanguageKeys.nvr.actorLog.langUpdated.toFa;
      else if (newLang === LanguageCode.EN)
        messageProps.key = LanguageKeys.nvr.actorLog.langUpdated.toEn;
      else if (newLang === LanguageCode.AR)
        messageProps.key = LanguageKeys.nvr.actorLog.langUpdated.toAr;
      else if (newLang === LanguageCode.KU)
        messageProps.key = LanguageKeys.nvr.actorLog.langUpdated.toKu;

      await this.actorLogApiService.registerActorLog({
        messageProps,
      });
    }
  }
}
