// logger.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { Request, Response, NextFunction } from 'express';
import { CloudRecoveryService } from 'src/modules/cloudConnection/applicationService/services/cloudRecovery.service';
import { CloudConnectionService } from 'src/modules/cloudConnection/applicationService/services/cloudConnection.service';

@Injectable()
export class CheckAccessToFogMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    if (
      CloudConnectionService.CLOUD_IS_AVAILABLE ||
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED
    ) {
      res.status(403).json(AppConfig().cloudHttpUrl.replace('/backend', ''));
      return;
    }
    next();
  }
}
