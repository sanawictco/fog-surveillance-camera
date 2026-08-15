export interface SystemLogProps {
  createdAt: number;
  type: SystemLogTypes;
  messageProps: SystemLogMessageProps;
  section: SystemLogSections;
  entityId: string;
}

export interface SystemLogMessageProps {
  key: string;
  params?: (number | string)[];
}

export interface CreateSystemLogProps {
  createdAt: number;
  type: SystemLogTypes;
  messageProps: SystemLogMessageProps;
  section: SystemLogSections;
  entityId: string;
}

export enum SystemLogTypes {
  ERROR = 'error',
  WARNING = 'warning',
  INFORMATION = 'information',
}

export enum SystemLogSections {
  VIDEO_DEVICES_LIVE_SIGNAL = 'SYSTEM_LOG_SECTION_VIDEO_DEVICES_LIVE_SIGNAL',
}

export interface SystemLogNotifyStatus {
  phoneNumber: string;
  delivered: boolean;
}

export type SystemLogRecordFormat = [
  SystemLogMessageProps,
  SystemLogSections,
  string,
];
export const systemlogSubTableNames = ['warning', 'error', 'information'];
export const SYSTEM_LOG_SUPER_TABLE = 'systemLogSuperTable';
export const SYSTEM_LOG_EVENT_BUS_LISTENER_PREFIX = 'systemlog_';

export const SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE = 200;
export const SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE = 500;
export const SYSTEM_LOG_SECTION_COLUMN_SIZE = 50;
export const SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE = 50;

export const systemLogColumnNames: string[] = [
  'createdAt',
  'messageKey',
  'messageParams',
  'section',
  'entityId',
];

export const systemLogColumnTypes: string[] = [
  'TIMESTAMP',
  `VARCHAR(${SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE})`,
  `VARCHAR(${SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE})`,
  `VARCHAR(${SYSTEM_LOG_SECTION_COLUMN_SIZE})`,
  `VARCHAR(${SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE})`,
];
export type SystemLogLanguageKeys = {
  systemLog: {};
};
