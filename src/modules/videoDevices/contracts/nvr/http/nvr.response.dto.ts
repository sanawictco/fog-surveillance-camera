import { ResponseBase } from 'src/dddLib/contracts/response.base';
import { AggregateID } from 'src/dddLib/core';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';

export class NvrResponseDto extends ResponseBase {
  constructor(
    public id: AggregateID,
    public name: string,
    public tenantId: string,
    public productModel: string,
    public serialNumber: string,
    public password: string,
    public lang: LanguageCode,
    public isActive: boolean,
    public liveSignalStatus: LiveSignalStatuses,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super({ id, createdAt, updatedAt });
  }
}
