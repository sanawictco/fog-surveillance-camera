import { ResponseBase } from 'src/dddLib/contracts/response.base';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';

export class NvrResponseDto extends ResponseBase {
  name!: string;
  workstationId!: string;
  serialNumber!: string;
  accessToken!: string;
  password!: string;
  lang!: LanguageCode;
  isActive!: boolean;
  liveSignalStatus!: LiveSignalStatuses;
  cloudIsRecovering!: boolean;
}
