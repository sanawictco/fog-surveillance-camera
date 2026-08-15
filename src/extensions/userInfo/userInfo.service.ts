import { UserInfoDto } from './userInfo.dto';
import { Injectable } from '@nestjs/common';
import { RequestContextService } from 'src/dddLib/utils/appRequestContext';

@Injectable()
export class UserInfoService {
  static getProps(): UserInfoDto {
    const ctx: any = RequestContextService.getContext();
    return ctx?.user;
  }
  getProps(): UserInfoDto {
    const ctx: any = RequestContextService.getContext();
    return ctx?.user;
  }
  getNvrAsActorProps(): UserInfoDto {
    return structuredClone({
      id: '00000000-0000-0000-0000-000000000000',
      name: 'sanaw-gateway-user',
    });
  }
}
