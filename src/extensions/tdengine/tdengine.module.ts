/* eslint-disable @typescript-eslint/no-require-imports */
import { Module } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { TimeseriesRepository } from 'src/modules/shared/timeseriesRepository';
import {
  TDENGINE_CLIENT,
  TDENGINE_EXECUTOR,
  TDENGINE_RESTFULL_OPTIONS,
} from './tdeinge.tokens';
import { TDengineLifecycleService } from './tdengineLifecycle.service';
import { TDengineService } from './tdengine.service';

const taos = require('@tdengine/websocket');

@Module({
  providers: [
    {
      provide: TDENGINE_CLIENT,
      useValue: taos,
    },
    {
      provide: TDENGINE_RESTFULL_OPTIONS,
      useFactory: () => ({
        restUrl: AppConfig().timeseriesDb.restUrl,
        token: AppConfig().timeseriesDb.token,
      }),
    },
    TDengineService,
    {
      provide: TDENGINE_EXECUTOR,
      useExisting: TDengineService,
    },
    TimeseriesRepository,
    TDengineLifecycleService,
  ],
  exports: [
    TDENGINE_EXECUTOR,
    TDENGINE_RESTFULL_OPTIONS,
    TDengineService,
    TimeseriesRepository,
    TDengineLifecycleService,
  ],
})
export class TDengineModule {}
