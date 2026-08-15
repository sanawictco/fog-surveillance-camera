import { SystemLogProps } from '../domain/systemLog.type';

export interface SystemLogDataEventDto {
  systemLogProps: SystemLogProps;
  entityId: string;
  entityType: string;
  configType: string;
}
