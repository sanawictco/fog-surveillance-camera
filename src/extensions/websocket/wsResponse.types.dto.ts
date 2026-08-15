import { CreatePageWsResponseDto } from 'src/modules/dashboard/applicationService/contracts/createPage.wsResponse.dto';
import { UpdatePageWsResponseDto } from 'src/modules/dashboard/applicationService/contracts/updatePage.wsResponse.dto';
import { CreateAndSendSystemLogWsResponseDto } from 'src/modules/systemLogs/contracts/createAndSendSystemLog.wsResponse.dto';
import { ToConnectedCameraLiveSignalWsResponseDto } from 'src/modules/videoDevices/contracts/camera/websocket/toConnectedCameraLiveSignal.wsResponse.dto';
import { ToDisconnectedCameraLiveSignalWsResponseDto } from 'src/modules/videoDevices/contracts/camera/websocket/toDisconnectedCameraLiveSignal.wsResponse.dto';

export type Exact<MAIN_TYPE, GENERIC_TYPE> = MAIN_TYPE extends GENERIC_TYPE
  ? GENERIC_TYPE extends MAIN_TYPE
    ? MAIN_TYPE
    : never
  : never;

export type WsRespnoseTypes =
  | CreatePageWsResponseDto
  | UpdatePageWsResponseDto
  | CreateAndSendSystemLogWsResponseDto
  | ToConnectedCameraLiveSignalWsResponseDto
  | ToDisconnectedCameraLiveSignalWsResponseDto;
