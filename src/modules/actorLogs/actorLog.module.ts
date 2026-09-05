import { forwardRef, Module, Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ActorLogApiService } from './applicationService/services/actorLogApi.service';
import { ACTOR_LOG_REPOSITORY } from './infra/actorLog.diToken';
import { ActorLogRepository } from './infra/actorLog.timeseriesRepository';
import { CreateActorLogCommandHandler } from './applicationService/commands/createActorLog.command';
import { FindAllActorLogsQueryHandler } from './applicationService/queries/findAllActorLogs.queryHandler';
import { FindAllPaginatedActorLogsQueryHandler } from './applicationService/queries/findAllPaginatedActorLogs.queryHandler';
import { CountAllActorLogsQueryHandler } from './applicationService/queries/countAllActorLogs.queryHandler';
import { AppModule } from 'src/app.module';
import { MqttModule } from 'src/extensions/mqtt/mqtt.module';
import { ClearAllActorLogsCommandHandler } from './applicationService/commands/clearAllActorLogs.command';
import { ActorLogApiForCloudConnectionService } from './applicationService/services/actorLogApiForCloudConnectionservice';

const commandHandlers: Provider[] = [
  CreateActorLogCommandHandler,
  ClearAllActorLogsCommandHandler,
];
const queryHandlers: Provider[] = [
  FindAllActorLogsQueryHandler,
  FindAllPaginatedActorLogsQueryHandler,
  CountAllActorLogsQueryHandler,
];
const apiServicesForAnotherModules: Provider[] = [
  ActorLogApiService,
  ActorLogApiForCloudConnectionService,
];
const repositories: Provider[] = [
  { provide: ACTOR_LOG_REPOSITORY, useClass: ActorLogRepository },
];
@Module({
  imports: [
    CqrsModule,
    forwardRef(() => AppModule),
    forwardRef(() => MqttModule),
  ],
  providers: [
    ...queryHandlers,
    ...repositories,
    ...commandHandlers,
    ...apiServicesForAnotherModules,
  ],
  controllers: [],
  exports: [ActorLogApiService, ActorLogApiForCloudConnectionService],
})
export class ActorLogModule {}
