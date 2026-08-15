import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ServiceProvider } from '../serviceProvider/serviceProvider.service';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';
import { Exact, WsRespnoseTypes } from './wsResponse.types.dto';

enum WsChannels {
  DEVICES_SOCKET = 'DevicesSocket',
  RULE_CHAINS_SOCKET = 'RuleChainsSocket',
  SYSTEM_LOGS_SOCKET = 'SystemLogsSocket',
  PAGES_SOCKET = 'PagesSocket',
  ERRORS_SOCKET = 'ErrorsSocket',
}

export interface WebsocketMsgBaseDto {
  readonly type: string;
  readonly data: object;
  readonly message?: string | { msgKey: string; msgParams?: string[] };
  readonly metadata?: object;
}

@WebSocketGateway()
export class WebsocketService
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy,
    IShutdownHandler
{
  @WebSocketServer()
  private readonly server!: Server;
  public readonly channels = WsChannels;
  private isShutDown = false;

  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.shutdownOrchestrator.registerHandler('WebSocket', this);
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;
    if (!this.server) {
      this.serviceProvider.logger.log(
        'WebSocket server was not initialized; nothing to close',
      );
      return;
    }

    this.server.emit('server:shutdown', {
      message: 'Server is restarting. Please reconnect in a moment.',
    });
    this.server.disconnectSockets(true);

    const closed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.serviceProvider.logger.warn(
          'WebSocket close timed out after 5000ms; continuing shutdown',
        );
        resolve(false);
      }, 5_000);
      this.server.close((err) => {
        clearTimeout(timer);
        if (err) {
          this.serviceProvider.logger.error('WebSocket close failed', err);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
    if (closed) {
      this.serviceProvider.logger.log('WebSocket server closed gracefully');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }

  handleDisconnect(client: any): void {
    this.serviceProvider.logger.log(`socketId=${client.id} disconnected`);
  }

  handleConnection(client: any): void {
    this.serviceProvider.logger.log(`socketId=${client.id} connected`);
  }

  afterInit(): void {
    this.serviceProvider.logger.log('WebSocket initialized');
  }

  sendMessage<T>(
    channel: WsChannels,
    messageToSend: Exact<WsRespnoseTypes, T>,
  ): void {
    if (this.isShutDown || !this.server) return;
    try {
      const wsMessage: any = structuredClone(messageToSend);
      let message = wsMessage.message || wsMessage.data?.message;
      if (message && typeof message !== 'string') {
        const { msgKey, msgParams } = message;
        message = msgParams
          ? this.serviceProvider.translatorService.translateByPattern(
              msgKey,
              msgParams,
            )
          : this.serviceProvider.translatorService.translateByName(msgKey);
      }
      if (wsMessage.message) wsMessage.message = message;
      if (wsMessage.data?.message) wsMessage.data.message = message;
      this.server.emit(channel, wsMessage);
    } catch (err) {
      this.serviceProvider.logger.error('WebSocket sendMessage failed', err, {
        channel,
      });
    }
  }
}
