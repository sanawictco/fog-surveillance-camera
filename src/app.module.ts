import {
  forwardRef,
  Module,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { RequestContextModule } from 'nestjs-request-context';
import { MqttModule } from './extensions/mqtt/mqtt.module';
import { SchedulerModule } from './extensions/scheduler/scheduler.module';
import { SerializerModule } from './extensions/serialization/serializer.module';
import { ServiceProviderModule } from './extensions/serviceProvider/serviceProvider.module';
import { TranslatorModule } from './extensions/translation/translator.module';
import { UserInfoModule } from './extensions/userInfo/userInfo.module';
import { WsModule } from './extensions/websocket/ws.module';
import { configureAppMiddleware } from './middlewareWiring';
import { ContextInterceptor } from './utilities/context.interceptor';
import { GlobalExceptionFilter } from './utilities/exception.filter';
import { LoggerModule } from './extensions/logger/logger.module';
import { CachingModule } from './extensions/caching/cacheing.module';
import { ShutdownModule } from './extensions/shutdown/shutdown.module';
import { AppController } from './app.controller';
import { CloudConnectionModule } from './modules/cloudConnection/cloudConnection.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ActorLogModule } from './modules/actorLogs/actorLog.module';
import { VideoDevicesModule } from './modules/videoDevices/videoDevices.module';
import { SystemMonitorModule } from './modules/systemMonitor/systemMonitor.module';
import AppConfig from 'configs/app.config';
import {
  TDENGINE_CLIENT,
  TDENGINE_RESTFULL_OPTIONS,
  TimeseriesRepository,
} from './modules/shared/timeseriesRepository';
import { TdengineShutdownService } from './modules/shared/tdengineShutdown.service';
import { sqlConnect, WSConfig, type WsSql } from '@tdengine/websocket';
@Module({
  imports: [
    ShutdownModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV}`,
      load: [AppConfig],
    }),
    LoggerModule,
    TranslatorModule,
    ServiceProviderModule,
    SerializerModule,
    UserInfoModule,
    EventEmitterModule.forRoot(),
    RequestContextModule,
    CqrsModule,
    WsModule,
    SchedulerModule,
    MqttModule,
    MongooseModule.forRoot(AppConfig().mongodb.url),
    CachingModule,
    CloudConnectionModule,
    DashboardModule,
    forwardRef(() => ActorLogModule),
    forwardRef(() => VideoDevicesModule),
    SystemMonitorModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ContextInterceptor,
    },
    {
      provide: TDENGINE_CLIENT,
      useFactory: async (): Promise<WsSql> => {
        const { wsUrl, user, password, dbName } = AppConfig().timeseriesDb;
        const conf = new WSConfig(wsUrl);
        conf.setUser(user);
        conf.setPwd(password);
        conf.setTimeOut(5_000);
        const tdengineClient = await sqlConnect(conf);
        const dbIdentifier = `\`${dbName.replaceAll('`', '``')}\``;
        await tdengineClient.exec(
          `CREATE DATABASE IF NOT EXISTS ${dbIdentifier}`,
        );
        await tdengineClient.exec(`USE ${dbIdentifier}`);
        return tdengineClient;
      },
    },
    {
      provide: TDENGINE_RESTFULL_OPTIONS,
      useFactory: async () => {
        return {
          restUrl: AppConfig().timeseriesDb.restUrl,
          token: AppConfig().timeseriesDb.token,
        };
      },
    },
    TimeseriesRepository,
    TdengineShutdownService,
  ],
  exports: [TDENGINE_CLIENT, TDENGINE_RESTFULL_OPTIONS],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    configureAppMiddleware(consumer);
  }
}
