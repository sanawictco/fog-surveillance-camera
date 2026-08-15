import { WebsocketMsgBaseDto } from 'src/extensions/websocket/websocket.service';
import { CameraWebSocketDataTypes } from '../../../domain/camera/camera.type';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';
import { WebSocketTypes } from 'src/modules/shared/websocket.types';

export interface ToConnectedCameraLiveSignalWsResponseDto extends WebsocketMsgBaseDto {
  type: WebSocketTypes.DATA;
  data: {
    id: string;
    liveSignalStatus: LiveSignalStatuses.CONNECTED;
  };
  metadata: { dataType: CameraWebSocketDataTypes.LIVE_SIGNAL };
}
