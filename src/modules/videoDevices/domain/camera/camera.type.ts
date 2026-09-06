import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import {
  LiveSignalStatus,
  LiveSignalStatuses,
} from '../../shared/valueObjects/liveSignalStatus.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { HasAudio } from './valueObjects/hasAudio';
import { HasPtz } from './valueObjects/hasPtz.vo';
import { MacAddress } from './valueObjects/macAddress.vo';
import { Password } from './valueObjects/password.vo';
import { Port } from './valueObjects/port.vo';
import { ProductModel } from './valueObjects/productModel.vo';
import { Streams, StreamsProps } from './valueObjects/streams.vo';
import { Username } from './valueObjects/username.vo';

export interface CameraValueObjects {
  readonly tenantId: BusinessId;
  name: Name;
  productModel: ProductModel;
  serialNumber: SerialNumber;
  username: Username;
  password: Password;
  macAddress: MacAddress;
  port: Port;
  streams: Streams;
  hasPtz: HasPtz;
  hasAudio: HasAudio;
  nvrId: BusinessId;
  isActive: IsActive;
  liveSignalStatus: LiveSignalStatus;
}

export interface CameraProps {
  tenantId: string;
  name: string;
  productModel: string;
  serialNumber: string;
  username: string;
  password: string;
  macAddress: string;
  port: number;
  streams: StreamsProps;
  hasPtz: boolean;
  hasAudio: boolean;
  nvrId: string;
  isActive: boolean;
  liveSignalStatus: LiveSignalStatuses;
}

export interface CreateCameraProps {
  originId?: string;
  tenantId: string;
  name: string;
  productModel: string;
  serialNumber: string;
  username: string;
  password: string;
  macAddress: string;
  port: number;
  streams: StreamsProps;
  hasPtz: boolean;
  nvrId: string;
  hasAudio: boolean;
}

export interface UpdateCameraProps {
  name?: string;
  liveSignalStatus?: LiveSignalStatuses;
}

export enum CameraWebsocketTypes {
  CONFIG = 'config',
}

export enum CameraWebSocketDataTypes {
  LIVE_SIGNAL = 'liveSignal',
}

export enum CameraConfigs {
  UPDATE_CAMERA = 'UPDATE_CAMERA',
}

export interface CameraFogPubToCloudMqttTopics {
  cameraData: string;
}

export interface CameraFogSubOnCloudMqttTopics {
  cameraData: string;
}

export enum CameraHardwareSendCommands {
  MOVE = 'move', // one-time use (without retry)
  ZOOM = 'zoom', // one-time use (without retry)
  UPDATE_FPS_send = 'updateFps_send',
  UPDATE_RESOLUTION_send = 'updateResolution_send',
  UPDATE_BITRATE_send = 'updateBitrate_send',
}

export enum CameraHardwareReceiveCommands {
  UPDATE_FPS_receive = 'updateFps_receive',
  UPDATE_RESOLUTION_receive = 'updateResolution_receive',
  UPDATE_BITRATE_receive = 'updateBitrate_receive',
}

export enum CameraSystemLogDataTypes {
  LIVE_SIGNAL = 'liveSignal',
}

export type CameraLanguageKeys = {
  camera: {
    actorLog: {
      created: string;
      deleted: string;
      activated: string;
      inactivated: string;
      nameUpdated: string;
    };
    systemLog: {
      disconnected: string;
    };
    response: {
      socket: {
        updated: string;
      };
    };
    errorResponse: {
      badRequest: {
        nameIsDuplicated: string;
      };
    };
  };
};
