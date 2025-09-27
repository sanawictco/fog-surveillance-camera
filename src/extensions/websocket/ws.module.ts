import { Module } from '@nestjs/common';
import { WebsocketService } from './websocket.service';

@Module({
  imports: [],
  providers: [WebsocketService],
  exports: [WebsocketService],
})
export class WsModule {}
