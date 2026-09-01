import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { AccessToken } from './valueObjects/accessToken.vo';
import { NvrPassword } from './valueObjects/nvrPassword.vo';
import { NvrLanguage } from './valueObjects/NvrLanguage.vo';
import {
  LiveSignalStatus,
  LiveSignalStatuses,
} from '../../shared/valueObjects/liveSignalStatus.vo';
import { RunningConfigs } from 'src/modules/shared/valueObjects/runningConfigs.vo';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import { MaxCameras } from './valueObjects/maxCameras.vo';
import { CloudIsRecovering } from './valueObjects/cloudIsRecovering.vo';
import { CloudFailedAt } from './valueObjects/cloudFailedAt.vo';

export interface NvrValueObjects {
  name: Name;
  workstationId: BusinessId;
  serialNumber: SerialNumber;
  accessToken: AccessToken;
  password: NvrPassword;
  maxCameras: MaxCameras;
  lang: NvrLanguage;
  isActive: IsActive;
  liveSignalStatus: LiveSignalStatus;
  cloudIsRecovering: CloudIsRecovering;
  cloudFailedAt: CloudFailedAt;
  runningConfigs: RunningConfigs;
}

export interface NvrProps {
  name: string;
  workstationId: string;
  serialNumber: string;
  accessToken: string;
  password: string;
  maxCameras: number;
  lang: LanguageCode;
  isActive: boolean;
  liveSignalStatus: LiveSignalStatuses;
  cloudIsRecovering: boolean;
  cloudFailedAt: number;
  runningConfigs: Record<string, string>;
}

export interface CreateNvrProps {
  name: string;
  workstationId: string;
  serialNumber: string;
  accessToken: string;
  password: string;
  maxCameras: number;
}

export interface UpdateNvrProps {
  name?: string;
  password?: string;
  lang?: LanguageCode;
  liveSignalStatus?: LiveSignalStatuses;
  cloudIsRecovering?: boolean;
  cloudFailedAt?: number;
  runningConfigs?: Record<string, string>;
}

export interface NvrFogPubToCloudMqttTopics {
  videoDeviceSoftwareConfigs: string;
  videoDeviceSystemLogs: string;
}

export interface NvrFogSubOnCloudMqttTopics {
  videoDeviceSoftwareConfigs: string;
  cloudRecoveryDataAck: string; // this topic sufficient for cloud recovery
  cloudIsAvailable: string;
  pageConfig: string;
}

export enum NvrConfigs {
  UPDATE_NVR = 'updateNvr',
  DELETE_NVR = 'deleteNvr',
  ACTIVE_NVR = 'activeNvr',
  IN_ACTIVE_NVR = 'inactiveNvr',
  REGISTER = 'register',
  FOG_LIVE_SIGNAL = 'fogLiveSignal',
  CLOUD_IS_RECOVERING = 'cloudIsRecovering',
  SEARCH = 'search',
  SOFT_DELETE_MULTI_CAMERAS = 'softDeleteMultiCameras',
}

export enum NvrWebSocketDataTypes {
  CLOUD_IS_RECOVERING = 'cloudIsRecovering',
  LIVE_SIGNAL = 'liveSignal',
}

export enum NvrWebSocketConfigTypes {
  UPDATE_NVR = 'updateNvr',
  CREATE_NVR = 'createNvr',
  DELETE_NVR = 'deleteNvr',
  ACTIVE_NVR = 'activeNvr',
  IN_ACTIVE_NVR = 'inactiveNvr',
  SEARCH = 'search',
  REGISTER = 'register',
}

export enum NvrSystemLogDataTypes {
  LIVE_SIGNAL = 'liveSignal',
  CLOUD_RECOVERY = 'cloudRecovery',
}

export enum NvrSystemLogConfigTypes {
  ACTIVE_NVR = 'activeNvr',
  IN_ACTIVE_NVR = 'inactiveNvr',
  UPDATE_NVR = 'updateNvr',
}

export enum NvrSystemLogConfigTypesFromFog {
  UPDATE_HARDWARE_CONFIG = 'updateHardwareConfig',
  REGISTER = 'register',
}

export type NvrLanguageKeys = {
  nvr: {
    actorLog: {
      nameUpdated: string;
      passwordUpdated: string;
      langUpdated: {
        toFa: string;
        toEn: string;
        toAr: string;
        toKu: string;
      };
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
