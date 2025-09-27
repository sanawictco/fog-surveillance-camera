import { Global, Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { ConfigModule } from '@nestjs/config';
@Global()
@Module({
  imports: [ConfigModule],

  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
