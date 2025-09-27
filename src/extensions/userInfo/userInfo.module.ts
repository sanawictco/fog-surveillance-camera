import { Global, Module } from '@nestjs/common';
import { CachingModule } from '../caching/cacheing.module';
import { UserInfoService } from './userInfo.service';
@Global()
@Module({
  imports: [CachingModule],
  providers: [UserInfoService],
  exports: [UserInfoService],
})
export class UserInfoModule {}
