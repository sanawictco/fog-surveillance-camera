import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';

/**
 * MongoService
 *
 * Wraps the Mongoose connection with:
 * - Connection health monitoring
 * - Graceful shutdown (waits for in-flight queries)
 * - Auto-reconnect handling
 *
 * Registers itself with ShutdownOrchestratorService.
 * shutdown() is called by the orchestrator at the correct order.
 */
@Injectable()
export class MongoService
  implements
    IShutdownHandler,
    OnModuleInit,
    OnModuleDestroy,
    OnApplicationBootstrap
{
  private readonly logger = new Logger(MongoService.name);
  private _isShutDown = false;

  constructor(
    @InjectConnection() private readonly connection: mongoose.Connection,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.shutdownOrchestrator.registerHandler('MongoDB', this);

    // @nestjs/mongoose's MongooseCoreModule has its own OnApplicationShutdown
    // that calls connection.close() in parallel with our orchestrator.
    // We intercept close() to ensure only our orchestrator can trigger it.
    const originalClose = this.connection.close.bind(this.connection);
    (this.connection as any).close = async (force?: boolean) => {
      if (!this._isShutDown) {
        this.logger.debug(
          'MongoDB close() intercepted - deferring to orchestrator',
        );
        return;
      }
      return originalClose(force);
    };

    this.connection.on('connected', () =>
      this.logger.log('MongoDB connected!'),
    );
    this.connection.on('disconnected', () => {
      if (!this._isShutDown)
        this.logger.warn('MongoDB disconnected unexpectedly');
    });
    this.connection.on('error', (err) =>
      this.logger.error('MongoDB connection error:', err),
    );
    this.connection.on('reconnected', () =>
      this.logger.log('MongoDB reconnected'),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    // By this point all modules are initialized - connection is established
    if (this.connection.readyState === mongoose.ConnectionStates.connected) {
      this.logger.log('MongoDB connected');
    } else {
      this.logger.error(
        `MongoDB not connected - readyState: ${this.connection.readyState}`,
      );
    }
  }

  /**
   * Called by ShutdownOrchestratorService at the correct shutdown step.
   * Mongoose close() waits for active operations to complete before closing.
   */
  async shutdown(): Promise<void> {
    if (this._isShutDown) return;
    this._isShutDown = true;

    if (this.connection.readyState === mongoose.ConnectionStates.disconnected) {
      this.logger.log('MongoDB already disconnected');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const closedGracefully = await Promise.race([
      this.connection.close(false).then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), 5_000);
        timer.unref();
      }),
    ]);
    if (timer) clearTimeout(timer);

    if (closedGracefully) {
      this.logger.log('MongoDB connection closed gracefully');
    } else {
      this.logger.warn('MongoDB close() timed out after 5s - forcing');
      await this.connection.destroy(true).catch((err) => {
        this.logger.error('MongoDB forced close failed:', err);
      });
    }
  }

  /**
   * NestJS lifecycle hook - becomes a no-op if orchestrator already ran shutdown()
   */
  async onModuleDestroy(): Promise<void> {
    // If orchestrator is running, it will call shutdown() at the right time.
    // Don't race it - stand down and wait for the orchestrator to reach us.
    if (this._isShutDown) return;
    if (this.shutdownOrchestrator.isShuttingDown) return;

    // Fallback: only runs if orchestrator never started (e.g., crash before shutdown)
    await this.shutdown();
  }

  async healthCheck(): Promise<{ status: 'ok' | 'error'; readyState: number }> {
    try {
      // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
      const readyState = this.connection.readyState;

      // Guard before pinging: when disconnected, connection.db is undefined and
      // `db?.admin().ping()` short-circuits to `await undefined` - which would
      // otherwise resolve and report a false 'ok' during a real outage.
      if (
        readyState !== mongoose.ConnectionStates.connected ||
        !this.connection.db
      ) {
        return { status: 'error', readyState };
      }

      await this.connection.db.admin().ping();
      return { status: 'ok', readyState };
    } catch (err) {
      this.logger.error('MongoDB health check failed:', err);
      return { status: 'error', readyState: this.connection.readyState };
    }
  }
}
