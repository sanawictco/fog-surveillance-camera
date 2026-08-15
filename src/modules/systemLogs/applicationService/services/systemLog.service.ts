import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { OrderStates } from 'src/dddLib/applicationService';
import { MqttService } from 'src/extensions/mqtt/mqtt.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { arabicSystemLogSections } from 'src/extensions/translation/languages/arabicValues';
import { englishSystemLogSections } from 'src/extensions/translation/languages/englishValues';
import { farsiSystemLogSections } from 'src/extensions/translation/languages/farsiValues';
import { kurdiSystemLogSections } from 'src/extensions/translation/languages/kurdiValues';
import { DictionarySections } from 'src/extensions/translation/translator.base';
import { TranslatorService } from 'src/extensions/translation/translatorService';
import { WebsocketService } from 'src/extensions/websocket/websocket.service';
import { CloudRecoveryService } from 'src/modules/cloudConnection/applicationService/cloudRecovery.service';
import { VideoDevicesApiForSystemLogService } from 'src/modules/videoDevices/applicatonService/services/apiForAnotherServices/videoDevicesApiForSystemLog.service';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { NvrProps } from 'src/modules/videoDevices/domain/nvr/nvr.type';
import { VideoDeviceEntityTypes } from 'src/modules/videoDevices/shared/videoDeviceEntityTypes';
import { CreateAndSendSystemLogWsResponseDto } from '../../contracts/createAndSendSystemLog.wsResponse.dto';
import {
  CreateSystemLogProps,
  SystemLogTypes,
} from '../../domain/systemLog.type';
import { SystemLogWebSocketTypes } from '../../shares/systemLogWebSocketTypes.enum';
import { CreateSystemLogCommand } from '../commands/createSystemLog.command';
import { DeleteAllSystemLogCommand } from '../commands/deleteAllSystemLog.command';
import { FindAllPaginatedSystemLogsQuery } from '../queries/findAllPaginatedSystemLogs.queryHandler';
import { CloudConnectionService } from 'src/modules/cloudConnection/applicationService/services/cloudConnection.service';

@Injectable()
export class SystemLogService {
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly websocketService: WebsocketService,
    @Inject(forwardRef(() => VideoDevicesApiForSystemLogService))
    private readonly devicesApiForSystemLogService: VideoDevicesApiForSystemLogService,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
  ) {}

  async findAll(query: { types?: string; page?: number; limit?: number }) {
    let types: SystemLogTypes[] = JSON.parse(query.types ?? '[]');
    const page = query.page || 1;
    const limit = query.limit || 10;
    if (types.length === 0) {
      types = [
        SystemLogTypes.INFORMATION,
        SystemLogTypes.WARNING,
        SystemLogTypes.ERROR,
      ];
    }

    const systemLogs = await this.serviceProvider.queryBus.execute(
      new FindAllPaginatedSystemLogsQuery({
        types,
        page,
        limit,
        orderBy: { column: 'createdAt', status: OrderStates.DESCENDING },
      }),
    );
    return {
      systemLogs,
    };
  }

  async getDictionary() {
    const nvrProps: NvrProps =
      await this.devicesApiForSystemLogService.getNvrProps();
    const lang = nvrProps.lang as LanguageCode;
    TranslatorService.LANG = lang;
    const dictionary =
      this.serviceProvider.translatorService.prepareDictionaryFormatForEachSection(
        DictionarySections.SYSTEM_LOG,
      );
    let sections;
    if (lang === LanguageCode.FA) {
      sections = farsiSystemLogSections;
    } else if (lang === LanguageCode.EN) {
      sections = englishSystemLogSections;
    } else if (lang === LanguageCode.AR) {
      sections = arabicSystemLogSections;
    } else if (lang === LanguageCode.KU) {
      sections = kurdiSystemLogSections;
    } else {
      sections = farsiSystemLogSections;
      // throw new Error('unSupported Language');
    }
    return { dictionary: { ...dictionary, ...sections } };
  }

  deleteSystemLogs(id: string) {
    this.serviceProvider.commandBus.execute(
      new DeleteAllSystemLogCommand({ id }),
    );
  }

  async createAndSend(
    systemLogProps: Omit<CreateSystemLogProps, 'createdAt'>,
    systemLogWebSocketType: SystemLogWebSocketTypes,
    metadata: {
      configType?: string;
      entityType: string;
      cmdKey?: string;
      msgId: string;
    },
  ) {
    const systemLog: CreateSystemLogProps = {
      createdAt: new Date().getTime(),
      ...systemLogProps,
    };

    if (
      !CloudConnectionService.CLOUD_IS_AVAILABLE &&
      !CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED
    ) {
      await this.serviceProvider.commandBus.execute(
        new CreateSystemLogCommand(systemLog),
      );

      const { key, params } = systemLog.messageProps;
      const data = {
        ...systemLog,
        message: { msgKey: key, msgParams: params as string[] },
      };
      this.websocketService.sendMessage<CreateAndSendSystemLogWsResponseDto>(
        this.websocketService.channels.SYSTEM_LOGS_SOCKET,
        {
          type: systemLogWebSocketType,
          data,
          metadata,
        },
      );
    }
    let topic;
    const VideodeviceEntityTypes: string[] = Object.values(
      VideoDeviceEntityTypes,
    );

    if (VideodeviceEntityTypes.includes(metadata.entityType))
      topic = NvrEntity.getFogPubToCloudMqttTopics().videoDeviceSystemLogs;

    if (!topic) {
      this.serviceProvider.logger.warn(
        `System log MQTT publish skipped: unsupported entityType=${metadata.entityType}`,
      );
      return;
    }

    await this.mqttService.publish(
      topic,
      JSON.stringify({
        systemLogProps: systemLog,
        entityType: metadata.entityType,
        configType: metadata.configType,
        cmdKey: metadata.cmdKey,
        msgId: metadata.msgId,
      }),
    );
  }
}
