import { Injectable, NestMiddleware } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { LanguageKeys } from 'src/extensions/translation/languageKeys.base';

@Injectable()
export class ProtectionMiddleware implements NestMiddleware {
  constructor(private readonly serviceProvider: ServiceProvider) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const token = req.header('x-auth-token');

    if (!token) {
      res
        .status(401)
        .send(
          this.serviceProvider.translatorService.translateByName(
            LanguageKeys.others.erroResponse.badRequest.accessDenied,
          ),
        );
      return;
    }

    try {
      const decoded = jwt.verify(token, AppConfig().jwtSecretKey);
      req.user = decoded;
      next();
    } catch {
      res
        .status(401)
        .send(
          this.serviceProvider.translatorService.translateByName(
            LanguageKeys.others.erroResponse.badRequest.accessDenied,
          ),
        );
      return;
    }
  }
}
