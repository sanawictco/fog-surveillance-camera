import { AggregateID } from 'src/dddLib/core';

export interface UserInfoDto {
  readonly id: AggregateID;
  readonly name: string;
}
