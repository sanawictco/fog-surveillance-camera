import { Global, Module } from '@nestjs/common';
import { ShutdownOrchestratorService } from './shutdown.service';

/**
 * Import this FIRST in AppModule imports array so it initializes
 * before all other modules.
 */
@Global()
@Module({
  providers: [ShutdownOrchestratorService],
  exports: [ShutdownOrchestratorService],
})
export class ShutdownModule {}
