import { ResponseBase } from 'src/dddLib/contracts/response.base';
import {
  SystemLogNotifyStatus,
  SystemLogSections,
  SystemLogTypes,
} from '../domain/systemLog.type';

export class SystemLogResponseDto extends ResponseBase {
  type!: SystemLogTypes;
  message!: string;
  section!: SystemLogSections;
  details!: object;
  systemLogNofityReport!: SystemLogNotifyStatus[];
}
