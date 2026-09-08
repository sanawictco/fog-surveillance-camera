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
import { CreateNvrCommandHandler } from './applicationService/commands/nvr/createNvr.command';
import { UpdateNvrCommandHandler } from './applicationService/commands/nvr/updateNvr.command';
import { DeleteNvrCommandHandler } from './applicationService/commands/nvr/deleteNvr.command';
import { ActiveNvrCommandHandler } from './applicationService/commands/nvr/activeNvr.command';
import { RestoreNvrsToCacheCommandHandler } from './applicationService/commands/nvr/restoreNvrsToCache.command';
import { InActiveNvrCommandHandler } from './applicationService/commands/nvr/inactiveNvr.command';
import { CreateCameraCommandHandler } from './applicationService/commands/camera/createCamera.command';
import { UpdateCameraCommandHandler } from './applicationService/commands/camera/updateCamera.command';
import { DeleteCameraCommandHandler } from './applicationService/commands/camera/deleteCamera.command';
import { ActiveCameraCommandHandler } from './applicationService/commands/camera/activeCamera.command';
import { RestoreCamerasToCacheCommandHandler } from './applicationService/commands/camera/restoreCamerasToCache.command';
import { InActiveCameraCommandHandler } from './applicationService/commands/camera/inactiveCamera.command';
import { FindAllNvrsQueryHandler } from './applicationService/queries/nvr/findAllNvrs.queryHandler';
import { FindNvrByIdQueryHandler } from './applicationService/queries/nvr/findNvrById.queryHandler';
import { FindNvrByNameQueryHandler } from './applicationService/queries/nvr/findNvrByName.queryHandler';
import { FindNvrBySerialNumberQueryHandler } from './applicationService/queries/nvr/findNvrBySerialNumber.queryHandler';
import { FindAllCamerasQueryHandler } from './applicationService/queries/camera/findAllCameras.queryHandler';
import { FindCameraByIdQueryHandler } from './applicationService/queries/camera/findCameraById.queryHandler';
import { FindCameraByNameQueryHandler } from './applicationService/queries/camera/findCameraByName.queryHandler';
import { FindCameraByNameAndNvrIdQueryHandler } from './applicationService/queries/camera/findCameraByNameAndNvrId.queryHandler';
import { FindCameraBySerialNumberQueryHandler } from './applicationService/queries/camera/findCameraBySerialNumber.queryHandler';
import { FindAllDeletedCamerasByDeletedSerialNumbersQueryHandler } from './applicationService/queries/camera/findAllDeletedCamerasByDeletedSerialNumbers.queryHandler';
import { VideoDevicesApiForDashboardService } from './applicationService/services/apiForAnotherServices/videoDeviceApiForDashboard.service';
import { NvrValidator } from './applicationService/services/http/validators/nvr.validator';
import { CameraValidator } from './applicationService/services/http/validators/camera.validator';
import { VideoDevicesInitService } from './applicationService/services/init.service';
import { CameraSystemLogService } from './applicationService/services/systemLogs/cameraSystemLog.service';
import { VideoDevicesApiForSystemLogService } from './applicationService/services/apiForAnotherServices/videoDevicesApiForSystemLog.service';
import { NvrActorLogService } from './applicationService/services/actorLogs/nvrActorLog.service';
import { CameraActorLogService } from './applicationService/services/actorLogs/cameraActorLog.service';
import { CameraLiveSignalService } from './applicationService/services/liveSignals/cameraLiveSignal.service';
import { FindAllDeletedCamerasByExistingMacAddressesQueryHandler } from './applicationService/queries/camera/findAllDeletedCamerasByExistingMacAddresses.queryHandler';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NetworkProcessRunner } from './infra/networkScanner/networkProcess.runner';
import { NmapXmlParser } from './infra/networkScanner/nmapXml.parser';
import { PassiveNeighborService } from './infra/networkScanner/passiveNeighbor.service';
import { OnvifDiscoveryService } from './infra/networkScanner/onvifDiscovery.service';
import { CameraNetworkScannerService } from './infra/networkScanner/cameraNetworkScanner.service';
import { ScannerPreflightService } from './infra/networkScanner/scannerPreflight.service';
import { NvrConfigsMqttService } from './applicationService/services/mqtt/nvrConfigsMqtt.service';
import { CameraConfigsMqttService } from './applicationService/services/mqtt/cameraConfigsMqtt.service';
import { PhysicalEthernetProvider } from './infra/networkScanner/physicalEthernet.provider';
import { DnsmasqLeaseProvider } from './infra/networkScanner/dnsmasqLease.provider';
import { OnvifSoapClient } from './infra/deviceAccess/onvif/onvifSoap.client';
import { OnvifEndpointResolver } from './infra/deviceAccess/onvif/onvifEndpoint.resolver';
import { VideoDeviceConfigsMqttController } from './controllers/videoDeviceConfigs.mqtt.controller';
import { VideoDevicesCloudCommunicationService } from './applicationService/services/videoDevicesCloudCommunication.service.ts';
import { TDengineModule } from 'src/extensions/tdengine/tdengine.module';

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
  PhysicalEthernetProvider,
  NetworkProcessRunner,
  NmapXmlParser,
  PassiveNeighborService,
  DnsmasqLeaseProvider,
  OnvifDiscoveryService,
  CameraNetworkScannerService,
  ScannerPreflightService,
  VideoDevicesCloudCommunicationService,
  NvrConfigsMqttService,
  CameraConfigsMqttService,
  OnvifSoapClient,
  OnvifEndpointResolver,
];

const systemLogHandlers: Provider[] = [CameraSystemLogService];

const validators: Provider[] = [NvrValidator, CameraValidator];

const mqttControllers: Provider[] = [VideoDeviceConfigsMqttController];

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
    TDengineModule,
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
