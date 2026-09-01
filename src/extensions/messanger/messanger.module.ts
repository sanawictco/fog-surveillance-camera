import { Module } from '@nestjs/common';
import { MessangerService } from './messanger.service';

@Module({
  imports: [],
  providers: [MessangerService],
  exports: [MessangerService],
})
export class MessangerModule {}
