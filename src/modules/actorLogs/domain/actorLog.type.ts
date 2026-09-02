import { isUUID } from 'class-validator';

export interface CreateActorLogProps {
  createdAt?: number;
  tenantId: string;
  actorType: ActorLogTypes;
  actorId: string;
  messageProps: ActorLogMessageProps;
}
export interface ActorLogMessageProps {
  key: string;
  params: (number | string)[];
}
export enum ActorLogTypes {
  EMPLOYEE = 'EMPLOYEE',
  RULE_CHAIN = 'RULE_CHAIN',
  EXPOSED_REST_API = 'EXPOSED_REST_API',
}

export type ActorLogRecordFormat = [
  string,
  ActorLogTypes,
  string,
  ActorLogMessageProps,
];

export const ACTOR_LOG_TENANT_ID_COLUMN_SIZE = 36;
export const ACTOR_LOG_ACTOR_ID_COLUMN_SIZE = 36;
export const ACTOR_LOG_MESSAGE_KEY_COLUMN_SIZE = 200;
export const ACTOR_LOG_ACTOR_LOG_TYPE_COLUMN_SIZE = 20;
export const ACTOR_LOG_MESSAGE_PARAMS_COLUMN_SIZE = 500;

/**
 * `actorId` is NOT in this list: it is a TAG on the stable (see
 * ensureSuperTable), not a stored column. TDengine rejects a stable whose
 * tag name duplicates a column name ("Duplicated column names", verified
 * against the live TDengine 3.3.6.3 both fog and cloud run) — the same
 * constraint that already keeps systemLog's severity tag-only (`groupId`,
 * see systemLogSelectedColumns). Reads that need actorId must select the
 * tag explicitly; see actorLogSelectedColumns.
 */
export const actorLogColumnNames: string[] = [
  'createdAt',
  'actorLogType',
  'messageKey',
  'messageParams',
];

export const actorLogColumnTypes: string[] = [
  'TIMESTAMP',
  `VARCHAR(${ACTOR_LOG_ACTOR_LOG_TYPE_COLUMN_SIZE})`,
  `VARCHAR(${ACTOR_LOG_MESSAGE_KEY_COLUMN_SIZE})`,
  `VARCHAR(${ACTOR_LOG_MESSAGE_PARAMS_COLUMN_SIZE})`,
];

/** Actor id lives only as a tag — select it explicitly alongside columns. */
export const actorLogSelectedColumns = [...actorLogColumnNames, 'actorId'];

export function assertActorLogTenantId(tenantId: string): void {
  if (!isUUID(tenantId, '4')) throw new Error('tenantId must be a UUID v4');
}

export function assertActorLogTypes(types: ActorLogTypes[]): void {
  if (
    !Array.isArray(types) ||
    types.some((type) => !Object.values(ActorLogTypes).includes(type))
  ) {
    throw new Error('actor log type is invalid');
  }
}

/**
 * Actor-log topology (mirrors cloud-surveillance-camera, decision 2026-08-31):
 * one supertable per tenant and one child table per (tenant, actor). Tenant
 * identity is the supertable, so per-tenant backup, deletion, and provisioning
 * are single-table operations and per-user reports hit an exact child table.
 * Names are always derived server-side from validated UUIDs; clients never
 * provide table names.
 */
function tenantTableSuffix(id: string): string {
  return id.replaceAll('-', '').toLowerCase();
}

export function actorLogSuperTableName(tenantId: string): string {
  assertActorLogTenantId(tenantId);
  return `actor_log_t_${tenantTableSuffix(tenantId)}`;
}

/**
 * Actor ids are UUID-shaped SSO subjects (or the all-zero kiosk id, whose
 * version nibble is 0). The check is anchored so embedded UUIDs or SQL
 * fragments can never pass as an identity.
 */
export function assertActorLogId(actorId: string): void {
  const uuidShape =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidShape.test(actorId)) {
    throw new Error('actorId must be a UUID');
  }
}

export function actorLogSubTableName(
  tenantId: string,
  actorId: string,
): string {
  assertActorLogTenantId(tenantId);
  assertActorLogId(actorId);
  return `actor_log_t_${tenantTableSuffix(tenantId)}_${tenantTableSuffix(actorId)}`;
}

/**
 * Identity of the fog kiosk user. Fog has no other actor: every actor log is
 * written under this id, and when cloud access returns, kiosk actor logs are
 * restored to the cloud under this same actorId so they remain reportable.
 */
export const SANAW_KIOSK_USER_ID = '00000000-0000-0000-0000-000000000000';
