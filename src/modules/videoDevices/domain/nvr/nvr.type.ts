import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { SerialNumber } from '../../shared/valueObjects/serialNumber.vo';
import { AccessToken } from './valueObjects/accessToken.vo';
import { NvrPassword } from './valueObjects/nvrPassword.vo';
import { NvrLanguage } from './valueObjects/NvrLanguage.vo';
import {
  LiveSignalStatus,
  LiveSignalStatuses,
} from '../../shared/valueObjects/liveSignalStatus.vo';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { IsActive } from '../../shared/valueObjects/isActive.vo';
import { MaxCameras } from './valueObjects/maxCameras.vo';
import { CloudFailedAt } from './valueObjects/cloudFailedAt.vo';
import { ProductModel } from '../camera/valueObjects/productModel.vo';
import { AggregateID } from 'src/dddLib/core';

export interface NvrValueObjects {
  name: Name;
  readonly tenantId: BusinessId;
  readonly serialNumber: SerialNumber;
  readonly accessToken: AccessToken;
  readonly maxCameras: MaxCameras;
  readonly productModel: ProductModel;
  password: NvrPassword;
  lang: NvrLanguage;
  isActive: IsActive;
  liveSignalStatus: LiveSignalStatus;
  cloudFailedAt: CloudFailedAt;
}

export interface NvrProps {
  name: string;
  readonly tenantId: string;
  readonly serialNumber: string;
  readonly accessToken: string;
  readonly maxCameras: number;
  readonly productModel: string;
  password: string;
  lang: LanguageCode;
  isActive: boolean;
  liveSignalStatus: LiveSignalStatuses;
  cloudFailedAt: number;
}

export interface CreateNvrProps {
  readonly id: AggregateID;
  readonly tenantId: string;
  readonly serialNumber: string;
  readonly accessToken: string;
  readonly maxCameras: number;
  readonly productModel: string;
  name: string;
  password: string;
}

export interface UpdateNvrProps {
  name?: string;
  password?: string;
  lang?: LanguageCode;
  cloudFailedAt?: number;
}

export interface NvrFogPubToCloudMqttTopics {
  videoDeviceSoftwareConfigs: string;
  videoDeviceSystemLogs: string;
}

export interface NvrFogSubOnCloudMqttTopics {
  videoDeviceSoftwareConfigs: string;
  cloudRecoveryDataAck: string; // this topic sufficient for cloud recovery
  cloudIsAvailable: string;
}

export enum NvrConfigs {
  UPDATE_NVR = 'updateNvr',
  DELETE_NVR = 'deleteNvr',
  ACTIVE_NVR = 'activeNvr',
  IN_ACTIVE_NVR = 'inactiveNvr',
  REGISTER = 'register',
  FOG_LIVE_SIGNAL = 'fogLiveSignal',
  SEARCH = 'search',
  SOFT_DELETE_MULTI_CAMERAS = 'softDeleteMultiCameras',
  ACTIVE_MULTI_CAMERAS = 'activeMultiCameras',
  IN_ACTIVE_MULTI_CAMERAS = 'inActiveMultiCameras',
}

export enum NvrWebSocketDataTypes {
  LIVE_SIGNAL = 'liveSignal',
}

export enum NvrWebSocketConfigTypes {
  UPDATE_NVR = 'updateNvr',
}

export enum NvrSystemLogDataTypes {
  LIVE_SIGNAL = 'liveSignal',
  CLOUD_RECOVERY = 'cloudRecovery',
}

export enum NvrSystemLogConfigTypes {
  UPDATE_NVR = 'updateNvr',
}

export type NvrLanguageKeys = {
  nvr: {
    actorLog: {
      created: string;
      deleted: string;
      active: string;
      inactive: string;
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
