import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { LanguageKeys } from 'src/extensions/translation/languageKeys.base';
import { ConfigTypeMsgIdDto } from 'src/modules/shared/dtos/configTypeMsgId.dto';
import { SystemLogService } from 'src/modules/systemLogs/applicationService/services/systemLog.service';
import {
  SystemLogSections,
  SystemLogTypes,
} from 'src/modules/systemLogs/domain/systemLog.type';
import { SystemLogWebSocketTypes } from 'src/modules/systemLogs/shares/systemLogWebSocketTypes.enum';
import { CameraEntity } from 'src/modules/videoDevices/domain/camera/camera.entity';
import { CameraSystemLogDataTypes } from 'src/modules/videoDevices/domain/camera/camera.type';
import { VideoDeviceEntityTypes } from 'src/modules/videoDevices/shared/videoDeviceEntityTypes';

@Injectable()
export class CameraSystemLogService {
  constructor(
    @Inject(forwardRef(() => SystemLogService))
    private readonly systemLogService: SystemLogService,
  ) {}
  async handle(cameraEntity: CameraEntity, metadata: ConfigTypeMsgIdDto) {
    switch (metadata.configType) {
      case CameraSystemLogDataTypes.LIVE_SIGNAL:
        return this.liveSignal(cameraEntity);
      default:
        break;
    }
  }

  private async liveSignal(cameraEntity: CameraEntity) {
    await this.systemLogService.createAndSend(
      {
        type: SystemLogTypes.ERROR,
        messageProps: {
          key: LanguageKeys.camera.systemLog.disconnected,
          params: [cameraEntity.getProps().name],
        },
        section: SystemLogSections.VIDEO_DEVICES_LIVE_SIGNAL,
        entityId: cameraEntity.id,
      },
      SystemLogWebSocketTypes.CONFIG,
      {
        configType: CameraSystemLogDataTypes.LIVE_SIGNAL,
        entityType: VideoDeviceEntityTypes.CAMERA,
        msgId: '',
      },
    );
  }
}
