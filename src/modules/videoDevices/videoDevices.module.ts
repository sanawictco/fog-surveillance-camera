import { Module, Provider, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CqrsModule } from '@nestjs/cqrs';
import { CachingModule } from 'src/extensions/caching/cacheing.module';
import { MqttModule } from 'src/extensions/mqtt/mqtt.module';
import { QueueModule } from 'src/extensions/queue/queue.module';
import { WsModule } from 'src/extensions/websocket/ws.module';
import { ActorLogModule } from '../actorLogs/actorLog.module';
import { SystemLogModule } from '../systemLogs/systemLog.module';
import { CAMERA_REPOSITORY } from './infra/camera/camera.diToken';
import { CameraMapper } from './infra/camera/camera.mapper';
import { CameraRepository } from './infra/camera/camera.repository';
import { CameraModel, CameraSchema } from './infra/camera/camera.schema';
import { NVR_REPOSITORY } from './infra/nvr/nvr.diToken';
import { NvrMapper } from './infra/nvr/nvr.mapper';
import { NvrRepository } from './infra/nvr/nvr.repository';
import { NvrModel, NvrSchema } from './infra/nvr/nvr.schema';
import { CreateNvrCommandHandler } from './applicatonService/commands/nvr/createNvr.command';
import { UpdateNvrCommandHandler } from './applicatonService/commands/nvr/updateNvr.command';
import { DeleteNvrCommandHandler } from './applicatonService/commands/nvr/deleteNvr.command';
import { ActiveNvrCommandHandler } from './applicatonService/commands/nvr/activeNvr.command';
import { RestoreNvrsToCacheCommandHandler } from './applicatonService/commands/nvr/restoreNvrsToCache.command';
import { InActiveNvrCommandHandler } from './applicatonService/commands/nvr/inactiveNvr.command';
import { CreateCameraCommandHandler } from './applicatonService/commands/camera/createCamera.command';
import { UpdateCameraCommandHandler } from './applicatonService/commands/camera/updateCamera.command';
import { DeleteCameraCommandHandler } from './applicatonService/commands/camera/deleteCamera.command';
import { ActiveCameraCommandHandler } from './applicatonService/commands/camera/activeCamera.command';
import { RestoreCamerasToCacheCommandHandler } from './applicatonService/commands/camera/restoreCamerasToCache.command';
import { InActiveCameraCommandHandler } from './applicatonService/commands/camera/inactiveCamera.command';
import { FindAllNvrsQueryHandler } from './applicatonService/queries/nvr/findAllNvrs.queryHandler';
import { FindNvrByIdQueryHandler } from './applicatonService/queries/nvr/findNvrById.queryHandler';
import { FindNvrByNameQueryHandler } from './applicatonService/queries/nvr/findNvrByName.queryHandler';
import { FindNvrBySerialNumberQueryHandler } from './applicatonService/queries/nvr/findNvrBySerialNumber.queryHandler';
import { FindAllCamerasQueryHandler } from './applicatonService/queries/camera/findAllCameras.queryHandler';
import { FindCameraByIdQueryHandler } from './applicatonService/queries/camera/findCameraById.queryHandler';
import { FindCameraByNameQueryHandler } from './applicatonService/queries/camera/findCameraByName.queryHandler';
import { FindCameraByNameAndNvrIdQueryHandler } from './applicatonService/queries/camera/findCameraByNameAndNvrId.queryHandler';
import { FindCameraBySerialNumberQueryHandler } from './applicatonService/queries/camera/findCameraBySerialNumber.queryHandler';
import { FindAllDeletedCamerasByDeletedSerialNumbersQueryHandler } from './applicatonService/queries/camera/findAllDeletedCamerasByDeletedSerialNumbers.queryHandler';
import { VideoDevicesApiForDashboardService } from './applicatonService/services/apiForAnotherServices/videoDeviceApiForDashboard.service';
import { NvrValidator } from './applicatonService/services/http/validators/nvr.validator';
import { CameraValidator } from './applicatonService/services/http/validators/camera.validator';
import { VideoDevicesInitService } from './applicatonService/services/init.service';
import { CameraSystemLogService } from './applicatonService/services/systemLogs/cameraSystemLog.service';
import { VideoDevicesApiForSystemLogService } from './applicatonService/services/apiForAnotherServices/videoDevicesApiForSystemLog.service';
import { NvrActorLogService } from './applicatonService/services/actorLogs/nvrActorLog.service';
import { CameraActorLogService } from './applicatonService/services/actorLogs/cameraActorLog.service';
import { CameraLiveSignalService } from './applicatonService/services/liveSignals/cameraLiveSignal.service';
import { FindAllDeletedCamerasByExistingMacAddressesQueryHandler } from './applicatonService/queries/camera/findAllDeletedCamerasByExistingMacAddresses.queryHandler';
import { DashboardModule } from '../dashboard/dashboard.module';

const commandHandlers: Provider[] = [
  ...[
    CreateNvrCommandHandler,
    UpdateNvrCommandHandler,
    DeleteNvrCommandHandler,
    ActiveNvrCommandHandler,
    InActiveNvrCommandHandler,
    RestoreNvrsToCacheCommandHandler,
  ],
  ...[
    CreateCameraCommandHandler,
    UpdateCameraCommandHandler,
    DeleteCameraCommandHandler,
    CreateCameraCommandHandler,
    ActiveCameraCommandHandler,
    InActiveCameraCommandHandler,
    RestoreCamerasToCacheCommandHandler,
  ],
];
const queryHandlers: Provider[] = [
  ...[
    FindAllNvrsQueryHandler,
    FindNvrByIdQueryHandler,
    FindNvrByNameQueryHandler,
    FindNvrBySerialNumberQueryHandler,
  ],
  ...[
    FindAllCamerasQueryHandler,
    FindCameraByIdQueryHandler,
    FindCameraByNameQueryHandler,
    FindCameraByNameAndNvrIdQueryHandler,
    FindCameraBySerialNumberQueryHandler,
    FindAllDeletedCamerasByDeletedSerialNumbersQueryHandler,
    FindAllDeletedCamerasByExistingMacAddressesQueryHandler,
  ],
];
const apiServiceForAnotherModules: Provider[] = [
  VideoDevicesApiForDashboardService,
  VideoDevicesApiForSystemLogService,
];
const repositories: Provider[] = [
  { provide: NVR_REPOSITORY, useClass: NvrRepository },
  { provide: CAMERA_REPOSITORY, useClass: CameraRepository },
];

const mappers: Provider[] = [NvrMapper, CameraMapper];

const services: Provider[] = [
  NvrActorLogService,
  CameraActorLogService,
  CameraLiveSignalService,
];

const systemLogHandlers: Provider[] = [CameraSystemLogService];

const validators: Provider[] = [NvrValidator, CameraValidator];

const mqttControllers: Provider[] = [];

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CameraModel.name, schema: CameraSchema },
      { name: NvrModel.name, schema: NvrSchema },
    ]),
    CachingModule,
    CqrsModule,
    MqttModule,
    WsModule,
    QueueModule,
    forwardRef(() => ActorLogModule),
    forwardRef(() => SystemLogModule),
    forwardRef(() => DashboardModule),
  ],
  providers: [
    ...services,
    ...validators,
    ...mqttControllers,
    ...queryHandlers,
    ...repositories,
    ...mappers,
    ...commandHandlers,
    ...apiServiceForAnotherModules,
    ...systemLogHandlers,
    VideoDevicesInitService,
  ],
  controllers: [],
  exports: [...apiServiceForAnotherModules],
})
export class VideoDevicesModule {}
