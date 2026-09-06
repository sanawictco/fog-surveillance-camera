import { Module, Provider, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { CachingModule } from 'src/extensions/caching/cacheing.module';
import { QueueModule } from 'src/extensions/queue/queue.module';
import { WsModule } from 'src/extensions/websocket/ws.module';
import { MqttModule } from '../../extensions/mqtt/mqtt.module';
import { ActorLogModule } from '../actorLogs/actorLog.module';
import { VideoDevicesModule } from '../videoDevices/videoDevices.module';
import { DashboardApiForVideoDevicesService } from './applicationService/apiForAnotherServices/dashboardApiForVideoDevices.service';
import { CreatePageCommandHandler } from './applicationService/commands/createPage.command';
import { DeletePageCommandHandler } from './applicationService/commands/deletePage.command';
import { RestorePagesToCacheCommandHandler } from './applicationService/commands/restorePagesToCache.command';
import { UpdatePageCommandHandler } from './applicationService/commands/updatePage.command';
import { FindAllPagesQueryHandler } from './applicationService/queries/findAllPages.queryHandler';
import { FindPageByIdQueryHandler } from './applicationService/queries/findPageById.queryHandler';
import { FindPageByNameQueryHandler } from './applicationService/queries/findPageByName.queryHandler';
import { FindPageByNameAndNvrIdQueryHandler } from './applicationService/queries/findPageByNameAndNvrId.queryHandler';
import { DashboardCloudCommunicationService } from './applicationService/services/dashboardCloudCommunicationService';
import { DashboardDataService } from './applicationService/services/dashboardData.service';
import { DashboardInitService } from './applicationService/services/init.service';
import { PagesHttpService } from './applicationService/services/page.http.service';
import { PageMqttService } from './applicationService/services/page.mqtt.service';
import { PageValidator } from './applicationService/services/page.validator';
import { PageActorLogService } from './applicationService/services/pageActorLog.service';
import { DashboardDataController } from './controllers/dashboardData.controller';
import { PageHttpController } from './controllers/page.http.controller';
import { PageMqttController } from './controllers/page.mqtt.controller';
import { PAGE_REPOSITORY } from './infra/page.diToken';
import { PageMapper } from './infra/page.mapper';
import { PageRepository } from './infra/page.repository';
import { PageModel, PageSchema } from './infra/page.schema';

const commandHandlers: Provider[] = [
  ...[
    CreatePageCommandHandler,
    UpdatePageCommandHandler,
    DeletePageCommandHandler,
    RestorePagesToCacheCommandHandler,
  ],
];
const queryHandlers: Provider[] = [
  ...[
    FindAllPagesQueryHandler,
    FindPageByIdQueryHandler,
    FindPageByNameQueryHandler,
    FindPageByNameAndNvrIdQueryHandler,
  ],
];
const repositories: Provider[] = [
  { provide: PAGE_REPOSITORY, useClass: PageRepository },
];
const mappers: Provider[] = [PageMapper];

const mqttControllers: Provider[] = [PageMqttController];

const httpServices: Provider[] = [
  DashboardDataService,
  PagesHttpService,
  PagesHttpService,
  DashboardDataService,
  PageActorLogService,
  PageValidator,
];
const mqttServices: Provider[] = [PageMqttService];
@Module({
  imports: [
    MongooseModule.forFeature([{ name: PageModel.name, schema: PageSchema }]),
    CachingModule,
    CqrsModule,
    forwardRef(() => MqttModule),
    WsModule,
    QueueModule,
    forwardRef(() => VideoDevicesModule),
    ActorLogModule,
  ],
  providers: [
    ...httpServices,
    ...mqttServices,
    ...mqttControllers,
    ...queryHandlers,
    ...commandHandlers,
    ...repositories,
    ...mappers,
    DashboardCloudCommunicationService,
    DashboardApiForVideoDevicesService,
    DashboardInitService,
  ],
  controllers: [DashboardDataController, PageHttpController],
  exports: [DashboardApiForVideoDevicesService],
})
export class DashboardModule {}
