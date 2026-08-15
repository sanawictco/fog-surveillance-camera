import { LanguageKeysBase } from '../languageKeys.base';

export const englishValues: LanguageKeysBase = {
  nvr: {
    actorLog: {
      nameUpdated: 'NVR name changed from {0} to {2} (serial {1})',
      passwordUpdated: 'Password changed for NVR {0} (serial {1})',
      langUpdated: {
        toFa: 'Language changed to Farsi for NVR {0} (serial {1})',
        toEn: 'Language changed to English for NVR {0} (serial {1})',
        toAr: 'Language changed to Arabic for NVR {0} (serial {1})',
        toKu: 'Language changed to Kurdish for NVR {0} (serial {1})',
      },
    },
    response: {
      socket: {
        updated: 'NVR updated',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'NVR name is duplicated',
      },
    },
  },
  camera: {
    actorLog: {
      nameUpdated: 'Camera name changed from {0} to {1}',
      activated: 'Camera {0} was activated',
      inactivated: 'Camera {0} was deactivated',
    },
    systemLog: {
      disconnected: 'Camera {0} became unavailable',
    },
    response: {
      socket: {
        updated: 'Camera updated',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'Camera name is duplicated',
      },
    },
  },
  dashboard: {
    actorLog: {
      created: 'A page named {0} was created',
      deleted: 'A page named {0} was deleted',
      nameUpdated: 'Page name changed from {0} to {1}',
      contentUpdated: 'Content of page named {1} was updated',
      pageIndexUpdated: 'Page order for page named {0} was updated',
    },
    response: {
      http: {
        created: 'Page created',
        updated: 'Page updated',
      },
      socket: {
        created: 'Page created',
        updated: 'Page updated',
        deleted: 'Page deleted',
      },
    },
    errorResponse: {
      badRequest: {
        notExists: 'No page exists with this ID',
        nameIsDuplicated: 'Page name is duplicated',
      },
    },
  },
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: 'Invalid password',
        accessDenied: 'Unauthorized access',
        invalidInput: 'Invalid input',
        invalidRequest: 'Invalid request',
        invalidCmdStructures: 'Invalid data format',
      },
    },
    geo: {
      lat: 'Longitude',
      lng: 'Latitude',
      alt: 'Altitude',
    },
    time: 'Time',
    true: 'True',
    false: 'False',
    internalServerError: 'Internal server error occurred',
  },
};

export const englishSystemLogSections = {
  SYSTEM_LOG_SECTION_DEVICE_LIVE_SIGNAL: 'Device Live Signal',
  SYSTEM_LOG_SECTION_DEVICE_CONFIG: 'Device Settings',
  SYSTEM_LOG_SECTION_DEVICE_DATA: 'Device Data',
  SYSTEM_LOG_SECTION_RULE_CHAIN: 'Rulechain',
  SYSTEM_LOG_SECTION_RULE_CHAIN_CATEGORY: 'Rulechain Category',
  SYSTEM_LOG_SECTION_RULE_CHAIN_STORAGE_NODE: 'Rulechain Storage Node',
  SYSTEM_LOG_SECTION_RULE_CHAIN_NODE: 'Rulechain Node',
};

export const englishReportFields = {
  EMPLOYEE: 'Employee',
  RULE_CHAIN: 'Rulechain',
  EXPOSED_REST_API: 'API',
  createdAt: 'Date',
  actorLogType: 'Actor',
  actorId: 'Actor ID',
  messageKey: 'Description',
};
