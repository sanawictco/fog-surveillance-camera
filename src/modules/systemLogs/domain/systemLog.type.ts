import { isUUID } from 'class-validator';

export interface SystemLogProps {
  tenantId: string;
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
  createdAt?: number;
  tenantId: string;
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
  string,
  SystemLogTypes,
  SystemLogMessageProps,
  SystemLogSections,
  string,
];
export function assertSystemLogTenantId(tenantId: string): void {
  if (!isUUID(tenantId, '4')) throw new Error('tenantId must be a UUID v4');
}

export function assertSystemLogTypes(types: SystemLogTypes[]): void {
  if (
    !Array.isArray(types) ||
    types.some((type) => !Object.values(SystemLogTypes).includes(type))
  ) {
    throw new Error('system log type is invalid');
  }
}

export const SYSTEM_LOG_EVENT_BUS_LISTENER_PREFIX = 'systemlog_';

export const SYSTEM_LOG_MESSAGE_KEYS_COLUMN_SIZE = 200;
export const SYSTEM_LOG_MESSAGE_PARAMS_COLUMN_SIZE = 500;
export const SYSTEM_LOG_SECTION_COLUMN_SIZE = 50;
export const SYSTEM_LOG_ENTITY_ID_COLUMN_SIZE = 50;
export const SYSTEM_LOG_TENANT_ID_COLUMN_SIZE = 36;

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

/**
 * Severity (`groupId`) is a tag, not a column — reads must select it
 * explicitly alongside the stored columns.
 */
export const systemLogSelectedColumns = [...systemLogColumnNames, 'groupId'];

/**
 * System-log topology (mirrors cloud-surveillance-camera, decision
 * 2026-08-31): one supertable per tenant and one child table per (tenant,
 * severity), mirroring actor logs. Names are always derived server-side from
 * validated UUIDs; clients never provide table names.
 */
function tenantTableSuffix(id: string): string {
  return id.replaceAll('-', '').toLowerCase();
}

export function systemLogSuperTableName(tenantId: string): string {
  assertSystemLogTenantId(tenantId);
  return `system_log_t_${tenantTableSuffix(tenantId)}`;
}

export function systemLogSubTableName(
  tenantId: string,
  type: SystemLogTypes,
): string {
  assertSystemLogTenantId(tenantId);
  assertSystemLogTypes([type]);
  return `system_log_t_${tenantTableSuffix(tenantId)}_${type}`;
}

export type SystemLogLanguageKeys = {
  systemLog: {};
};
