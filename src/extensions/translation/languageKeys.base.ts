import { PageLanguageKeys } from 'src/modules/dashboard/domain/page.type';
import { CameraLanguageKeys } from 'src/modules/videoDevices/domain/camera/camera.type';
import { NvrLanguageKeys } from 'src/modules/videoDevices/domain/nvr/nvr.type';

export type LanguageKeysBase = OtherLanguageKeys &
  PageLanguageKeys &
  NvrLanguageKeys &
  CameraLanguageKeys;

export const LanguageKeys: LanguageKeysBase = {
  nvr: {
    actorLog: {
      created: 'nvr.actorLog.created',
      deleted: 'nvr.actorLog.deleted',
      active: 'nvr.actorLog.active',
      inactive: 'nvr.actorLog.inactive',
      nameUpdated: 'nvr.actorLog.nameUpdated',
      passwordUpdated: 'nvr.actorLog.passwordUpdated',
      langUpdated: {
        toFa: 'nvr.actorLog.langUpdated.toFa',
        toEn: 'nvr.actorLog.langUpdated.toEn',
        toAr: 'nvr.actorLog.langUpdated.toAr',
        toKu: 'nvr.actorLog.langUpdated.toKu',
      },
    },
    response: {
      socket: {
        updated: 'nvr.response.socket.updated',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'nvr.errorResponse.badRequest.nameIsDuplicated',
      },
    },
  },
  camera: {
    actorLog: {
      created: 'camera.actorLog.created',
      deleted: 'camera.actorLog.deleted',
      activated: 'camera.actorLog.activated',
      inactivated: 'camera.actorLog.inactivated',
      nameUpdated: 'camera.actorLog.nameUpdated',
    },
    systemLog: {
      disconnected: 'string',
    },
    response: {
      socket: {
        updated: 'string',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'string',
      },
    },
  },
  dashboard: {
    actorLog: {
      created: 'dashboard.actorLog.created',
      deleted: 'dashboard.actorLog.deleted',
      nameUpdated: 'dashboard.actorLog.nameUpdated',
      contentUpdated: 'dashboard.actorLog.contentUpdated',
      pageIndexUpdated: 'dashboard.actorLog.pageIndexUpdated',
    },
    response: {
      http: {
        created: 'dashboard.response.http.created',
        updated: 'dashboard.response.http.updated',
      },
      socket: {
        created: 'dashboard.response.socket.created',
        updated: 'dashboard.response.socket.updated',
        deleted: 'dashboard.response.socket.deleted',
      },
    },
    errorResponse: {
      badRequest: {
        notExists: 'dashboard.errorResponse.badRequest.notExists',
        nameIsDuplicated: 'dashboard.errorResponse.badRequest.nameIsDuplicated',
      },
    },
  },
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: 'others.erroResponse.badRequest.wrongPassword',
        accessDenied: 'others.erroResponse.badRequest.accessDenied',
        invalidInput: 'others.erroResponse.badRequest.invalidInput',
        invalidRequest: 'others.erroResponse.badRequest.invalidRequest',
        invalidCmdStructures:
          'others.erroResponse.badRequest.invalidCmdStructures',
      },
    },
    geo: {
      lat: 'others.geo.lat',
      lng: 'others.geo.lng',
      alt: 'others.geo.alt',
    },
    time: 'others.time',
    true: 'others.true',
    false: 'others.false',
    internalServerError: 'others.internalServerError',
  },
};

type OtherLanguageKeys = {
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: string;
        accessDenied: string;
        invalidInput: string;
        invalidRequest: string;
        invalidCmdStructures: string;
      };
    };
    geo: {
      lat: string;
      lng: string;
      alt: string;
    };
    time: string;
    true: string;
    false: string;
    internalServerError: string;
  };
};
