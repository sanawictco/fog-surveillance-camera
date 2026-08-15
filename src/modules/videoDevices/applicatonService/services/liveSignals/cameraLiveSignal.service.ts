import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { WebsocketService } from 'src/extensions/websocket/websocket.service';
import { WebSocketTypes } from 'src/modules/shared/websocket.types';
import { UpdateCameraCommand } from '../../commands/camera/updateCamera.command';
import { ToConnectedCameraLiveSignalWsResponseDto } from '../../../contracts/camera/websocket/toConnectedCameraLiveSignal.wsResponse.dto';
import { CameraEntity } from '../../../domain/camera/camera.entity';
import {
  CameraSystemLogDataTypes,
  CameraWebSocketDataTypes,
} from '../../../domain/camera/camera.type';
import { ToDisconnectedCameraLiveSignalWsResponseDto } from '../../../contracts/camera/websocket/toDisconnectedCameraLiveSignal.wsResponse.dto';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';
import { FindNvrByIdQuery } from '../../queries/nvr/findNvrById.queryHandler';
import { CameraSystemLogService } from '../systemLogs/cameraSystemLog.service';

@Injectable()
export class CameraLiveSignalService {
  constructor(
    private readonly websocketService: WebsocketService,
    private readonly serviceProvider: ServiceProvider,
    private readonly cameraSystemLogService: CameraSystemLogService,
  ) {}

  async toConncted(cameraEntity: CameraEntity): Promise<void> {
    await this.serviceProvider.queryBus.execute<FindNvrByIdQuery, NvrEntity>(
      new FindNvrByIdQuery(cameraEntity.getProps().nvrId),
    );
    await this.serviceProvider.commandBus.execute(
      new UpdateCameraCommand({
        id: cameraEntity.id,
        liveSignalStatus: LiveSignalStatuses.CONNECTED,
      }),
    );
    this.websocketService.sendMessage<ToConnectedCameraLiveSignalWsResponseDto>(
      this.websocketService.channels.DEVICES_SOCKET,
      {
        type: WebSocketTypes.DATA,
        data: {
          id: cameraEntity.id,
          liveSignalStatus: LiveSignalStatuses.CONNECTED,
        },
        metadata: {
          dataType: CameraWebSocketDataTypes.LIVE_SIGNAL,
        },
      },
    );
  }

  async toDisconnected(cameraEntity: CameraEntity): Promise<void> {
    if (cameraEntity.isDisconnected()) return;
    await this.serviceProvider.commandBus.execute(
      new UpdateCameraCommand({
        id: cameraEntity.id,
        liveSignalStatus: LiveSignalStatuses.DIS_CONNECTED,
      }),
    );
    await this.cameraSystemLogService.handle(cameraEntity, {
      configType: CameraSystemLogDataTypes.LIVE_SIGNAL,
      msgId: '',
    });
    this.websocketService.sendMessage<ToDisconnectedCameraLiveSignalWsResponseDto>(
      this.websocketService.channels.DEVICES_SOCKET,
      {
        type: WebSocketTypes.DATA,
        data: {
          id: cameraEntity.id,
          liveSignalStatus: LiveSignalStatuses.DIS_CONNECTED,
        },
        metadata: {
          dataType: CameraWebSocketDataTypes.LIVE_SIGNAL,
        },
      },
    );
  }
}
