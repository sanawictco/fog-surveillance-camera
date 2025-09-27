import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ServiceProvider } from '../serviceProvider/serviceProvider.service';
import { Exact, WsRespnoseTypes } from './wsResponse.types.dto';
import { LanguageCode } from '../translation/languageCode.enum';

enum WsChannels {
  DEVICES_SOCKET = 'DevicesSocket',
  RULE_CHAINS_SOCKET = 'RuleChainsSocket',
  SYSTEM_LOGS_SOCKET = 'SystemLogsSocket',
  PAGES_SOCKET = 'PagesSocket',
  ERRORS_SOCKET = 'ErrorsSocket',
}

export interface WebsocketMsgBaseDto {
  type: string;
  data: object;
  message?: string | { msgKey: string; msgParams?: string[] };
  metadata?: object;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketService
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;
  public readonly channels = WsChannels;

  constructor(private readonly serviceProvider: ServiceProvider) {}

  handleDisconnect(client: any) {
    this.serviceProvider.logger.log(`socketId= ${client.id} disconnected`);
  }

  handleConnection(client: any /*, ...args: any[]*/) {
    this.serviceProvider.logger.log(`socketId= ${client.id} connected`);
  }

  afterInit(/*server: any*/) {
    this.serviceProvider.logger.log('websocket initialized...');
  }

  sendMessage<T>(channel: WsChannels, _wsMessage: Exact<WsRespnoseTypes, T>) {
    const wsMessage: any = structuredClone(_wsMessage);
    let message = wsMessage.message || wsMessage.data.message;
    if (message && typeof message !== 'string') {
      const { msgKey, msgParams } = message;
      if (msgParams) {
        message = this.serviceProvider.translatorService.translateByPattern(
          msgKey,
          msgParams,
        );
      } else {
        message =
          this.serviceProvider.translatorService.translateByName(msgKey);
      }
    }
    if (wsMessage.message) wsMessage.message = message; // for non systemlog messages
    if (wsMessage.data.message) wsMessage.data.message = message; // for systemlog messages
    this.server.emit(channel, wsMessage);
  }
}
