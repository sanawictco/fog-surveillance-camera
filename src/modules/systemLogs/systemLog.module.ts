import { forwardRef, Module, Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { WsModule } from 'src/extensions/websocket/ws.module';
import { CreateSystemLogCommandHandler } from './applicationService/commands/systemLog/createSystemLog.command';
import { FindAllSystemLogsQueryHandler } from './applicationService/queries/systemLog/findAllSystemLogs.queryHandler';
import { SYSTEM_LOG_REPOSITORY } from './infra/diToken/systemLog.diToken';
import { SystemLogService } from './applicationService/services/systemLog.service';

import { SystemLogController } from './controllers/systemLog.controller';
import { DeleteAllSystemLogCommandHandler } from './applicationService/commands/systemLog/deleteAllSystemLog.command';
import { CountAllSystemLogsQueryHandler } from './applicationService/queries/systemLog/countAllSystemLogs.queryHandler';
import { FindAllPaginatedSystemLogsQueryHandler } from './applicationService/queries/systemLog/findAllPaginatedSystemLogs.queryHandler';
import { SystemLogRepository } from './infra/repositories/systemLog.timeseriesRepository';
import { AppModule } from 'src/app.module';
import { ClearAllSystemLogsCommandHandler } from './applicationService/commands/systemLog/clearAllSystemLogs.command';
import { SystemLogApiForCloudConnectionService } from './applicationService/apiForAnotherServices/systemLogApiForCloudConnection.service';
import { VideoDevicesModule } from '../videoDevices/videoDevices.module';

const commandHandlers: Provider[] = [
  CreateSystemLogCommandHandler,
  DeleteAllSystemLogCommandHandler,
  ClearAllSystemLogsCommandHandler,
];
const queryHandlers: Provider[] = [
  FindAllSystemLogsQueryHandler,
  FindAllPaginatedSystemLogsQueryHandler,
  CountAllSystemLogsQueryHandler,
];

const repositories: Provider[] = [
  { provide: SYSTEM_LOG_REPOSITORY, useClass: SystemLogRepository },
];

const apiServicesForAnotherModules: Provider[] = [
  SystemLogService,
  SystemLogApiForCloudConnectionService,
];
@Module({
  imports: [
    CqrsModule,
    WsModule,
    forwardRef(() => VideoDevicesModule),
    forwardRef(() => AppModule),
  ],
  providers: [
    ...apiServicesForAnotherModules,
    ...queryHandlers,
    ...repositories,
    ...commandHandlers,
  ],
  controllers: [SystemLogController],
  exports: [...apiServicesForAnotherModules],
})
export class SystemLogModule {}
