import { AggregateID } from 'src/dddLib/core';
import { LanguageCode } from '../translation/languageCode.enum';

export interface UserInfoDto {
  readonly id: AggregateID;
  readonly phoneNumber: string;
  readonly name: string;
  readonly lang: LanguageCode;
}
