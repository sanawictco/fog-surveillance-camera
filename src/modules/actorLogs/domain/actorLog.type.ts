export interface CreateActorLogProps {
  createdAt?: number;
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
  number,
  ActorLogTypes,
  string,
  ActorLogMessageProps,
];

export const ACTOR_LOG_ACTOR_ID_COLUMN_SIZE = 36;
export const ACTOR_LOG_MESSAGE_KEY_COLUMN_SIZE = 200;
export const ACTOR_LOG_ACTOR_LOG_TYPE_COLUMN_SIZE = 20;
export const ACTOR_LOG_MESSAGE_PARAMS_COLUMN_SIZE = 500;

export const actorLogColumnNames: string[] = [
  'createdAt',
  'actorLogType',
  'actorId',
  'messageKey',
  'messageParams',
];

export const actorLogColumnTypes: string[] = [
  'TIMESTAMP',
  `VARCHAR(${ACTOR_LOG_ACTOR_LOG_TYPE_COLUMN_SIZE})`,
  `NCHAR(${ACTOR_LOG_ACTOR_ID_COLUMN_SIZE})`,
  `VARCHAR(${ACTOR_LOG_MESSAGE_KEY_COLUMN_SIZE})`,
  `VARCHAR(${ACTOR_LOG_MESSAGE_PARAMS_COLUMN_SIZE})`,
];

export function assertActorLogTypes(types: ActorLogTypes[]): void {
  if (
    !Array.isArray(types) ||
    types.some((type) => !Object.values(ActorLogTypes).includes(type))
  ) {
    throw new Error('actor log type is invalid');
  }
}

export const ACTOR_LOG_SUPER_TABLE = 'actorLogSuperTable';
