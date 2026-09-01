import { Injectable, Logger } from '@nestjs/common';
import { TDengineService } from './tdengine.service';

export type TDengineHealth = {
  status: 'ok' | 'error';
  message?: string;
};

@Injectable()
export class TDengineLifecycleService {
  private readonly logger = new Logger(TDengineLifecycleService.name);

  constructor(
    private readonly tdengineService: TDengineService,
  ) {
    // No boot-time connection initializers: system-log and actor-log
    // supertables are per-tenant and are ensured on each tenant's first
    // write by their repositories.
  }

  async healthCheck(): Promise<TDengineHealth> {
    if (!this.tdengineService.isAvailable) {
      return { status: 'error', message: 'TDengine client is not available' };
    }
    try {
      const wsResult = await this.tdengineService
        .getClient()
        .query('SELECT SERVER_VERSION()');
      if (!wsResult) {
        return { status: 'error', message: 'No response from TDengine (WS)' };
      }

      return { status: 'ok' };
    } catch (err) {
      this.logger.error('TDengine health check failed:', err);
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
