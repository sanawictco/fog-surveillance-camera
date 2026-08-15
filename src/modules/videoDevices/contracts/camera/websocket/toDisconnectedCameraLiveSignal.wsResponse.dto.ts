import { WebsocketMsgBaseDto } from 'src/extensions/websocket/websocket.service';
import { CameraWebSocketDataTypes } from '../../../domain/camera/camera.type';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';
import { WebSocketTypes } from 'src/modules/shared/websocket.types';

export interface ToDisconnectedCameraLiveSignalWsResponseDto extends WebsocketMsgBaseDto {
  type: WebSocketTypes.DATA;
  data: {
    id: string;
    liveSignalStatus: LiveSignalStatuses.DIS_CONNECTED;
  };
  metadata: { dataType: CameraWebSocketDataTypes.LIVE_SIGNAL };
}
