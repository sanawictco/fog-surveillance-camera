import { Global, Module } from '@nestjs/common';
import { ShutdownOrchestratorService } from './shutdown.service';

@Global()
@Module({
  providers: [ShutdownOrchestratorService],
  exports: [ShutdownOrchestratorService],
})
export class ShutdownModule {}
