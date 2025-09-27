import { Module } from '@nestjs/common';
import { TranslatorService } from './translatorService';

@Module({
  imports: [],
  providers: [TranslatorService],
  exports: [TranslatorService],
  controllers: [],
})
export class TranslatorModule {}
