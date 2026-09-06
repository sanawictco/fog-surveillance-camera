import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { TDengineLifecycleService } from 'src/extensions/tdengine/tdengineLifecycle.service';
import { CacheService } from 'src/extensions/caching/cache.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { HealthResponseDto } from './dtos/health.response.dto';

@Injectable()
export class SystemMonitorService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    protected readonly tdengineLifecycle: TDengineLifecycleService,
    private readonly cacheService: CacheService<any>,
    private readonly serviceProvider: ServiceProvider,
  ) {}

  async getHealthStatus(): Promise<HealthResponseDto> {
    if (
      (await this._checkMongoDBConnection()) &&
      (await this._checkTDengineConnection()) &&
      (await this.cacheService.healthCheck())
    )
      return {
        status: 'healthy',
        timestamp: new Date().toLocaleString(),
      };
    throw new ServiceUnavailableException({
      status: 'unhealthy',
      timestamp: new Date().toLocaleString(),
    });
  }

  private async _checkMongoDBConnection(): Promise<boolean> {
    try {
      const state = this.connection.readyState;
      return state === 1; // 1 = connected
    } catch (error) {
      this.serviceProvider.logger.error('MongoDB connection error:', error);
      return false;
    }
  }

  private async _checkTDengineConnection(): Promise<boolean> {
    try {
      const result = await this.tdengineLifecycle.healthCheck();
      return result.status === 'ok';
    } catch (error) {
      this.serviceProvider.logger.error('TDengine connection error:', error);
      return false;
    }
  }
}
