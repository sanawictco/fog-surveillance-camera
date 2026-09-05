import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudConnectionService } from './applicationService/services/cloudConnection.service';
import { CqrsModule } from '@nestjs/cqrs';
import { MqttModule } from 'src/extensions/mqtt/mqtt.module';
import { AppModule } from 'src/app.module';
import { CloudRecoveryService } from './applicationService/services/cloudRecovery.service';
import { ActorLogModule } from '../actorLogs/actorLog.module';
import { SystemLogModule } from '../systemLogs/systemLog.module';
import { VideoDevicesModule } from '../videoDevices/videoDevices.module';

@Module({
  imports: [
    ConfigModule,
    CqrsModule,
    forwardRef(() => AppModule),
    forwardRef(() => VideoDevicesModule),
    forwardRef(() => MqttModule),
    forwardRef(() => ActorLogModule),
    forwardRef(() => SystemLogModule),
  ],

  providers: [CloudConnectionService, CloudRecoveryService],
  controllers: [],
  exports: [CloudConnectionService],
})
export class CloudConnectionModule {}
