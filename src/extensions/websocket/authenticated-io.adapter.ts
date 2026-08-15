import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import AppConfig from 'configs/app.config';
import * as jwt from 'jsonwebtoken';
import { ServerOptions } from 'socket.io';

export class AuthenticatedIoAdapter extends IoAdapter {
  private readonly logger = new Logger(AuthenticatedIoAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const { authEnabled, allowedOrigins } = AppConfig().websocket;
    const origin = allowedOrigins.length > 0 ? allowedOrigins : true;
    if (allowedOrigins.length === 0) {
      this.logger.warn(
        'WS_ALLOWED_ORIGINS is empty; reflecting all origins. Configure it for production.',
      );
    }

    const server = super.createIOServer(port, {
      ...options,
      cors: { origin },
    });
    server.use((socket: any, next: (err?: Error) => void) => {
      const token =
        socket.handshake.auth?.token ??
        socket.handshake.headers['x-auth-token'] ??
        socket.handshake.query?.token;

      if (!authEnabled) {
        if (!token) {
          this.logger.warn(
            `WS connection without token (auth disabled) id=${socket.id}`,
          );
        }
        next();
        return;
      }
      if (!token) {
        next(new Error('unauthorized'));
        return;
      }

      try {
        socket.data.user = jwt.verify(String(token), AppConfig().jwtSecretKey);
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
    return server;
  }
}
