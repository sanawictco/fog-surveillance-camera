import { Global, Module } from '@nestjs/common';
import { UserInfoService } from './userInfo.service';
@Global()
@Module({
  imports: [],
  providers: [UserInfoService],
  exports: [UserInfoService],
})
export class UserInfoModule {}
