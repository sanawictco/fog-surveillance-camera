import { LanguageKeysBase } from '../languageKeys.base';

export const englishValues: LanguageKeysBase = {
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
