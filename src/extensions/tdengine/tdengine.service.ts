import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';
import AppConfig from 'configs/app.config';
import { TDENGINE_CLIENT } from './tdeinge.tokens';
const MAX_CONNECT_RETRIES = 5;
const RETRY_DELAY_MS = 3_000;

/**
 * TDengineService
 *
 * Wraps the @tdengine/websocket client with:
 * - Proper WebSocket connection lifecycle
 * - Graceful shutdown (closes WS connection cleanly)
 * - Health check
 *
 * Registers itself with ShutdownOrchestratorService.
 */
@Injectable()
export class TDengineService
  implements IShutdownHandler, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TDengineService.name);
  private _isShutDown = false;
  private _isConnected = false;
  private client: any = null;
  // True only while a (re)connect attempt is running. Used to stop the
  // reconnect-on-error wrapper from re-entering itself while connection
  // initializers run.
  private _connecting = false;
  // Single-flight handle: concurrent reconnects collapse onto one attempt so a
  // burst of queries against a dropped socket can't open a storm of connections.
  private _reconnecting: Promise<void> | null = null;
  private readonly connectionInitializers: Array<() => Promise<void>> = [];

  constructor(
    @Inject(TDENGINE_CLIENT) private readonly taos: any,
    private readonly shutdownOrchestrator: ShutdownOrchestratorService,
  ) {}

  registerConnectionInitializer(initializer: () => Promise<void>): void {
    this.connectionInitializers.push(initializer);
  }

  async onModuleInit(): Promise<void> {
    // The @tdengine/websocket library registers its OWN process listeners
    // ('exit', 'SIGINT', 'SIGTERM') that destroy the pool and call process.exit()
    // on signal - bypassing our graceful shutdown AND masking real exit codes
    // (an unrelated boot crash once surfaced as a silent exit 0 via the 'exit'
    // handler). Strip all three; TDengineService.shutdown() owns cleanup.
    for (const sig of ['exit', 'SIGINT', 'SIGTERM'] as const) {
      const rogue = process
        .rawListeners(sig)
        .filter((fn: any) => fn.toString().includes('WebSocketConnectionPool'));
      for (const listener of rogue) {
        process.removeListener(sig, listener as any);
      }
    }

    this.shutdownOrchestrator.registerHandler('TDengine', this);

    // Connect HERE (onModuleInit), NOT onApplicationBootstrap: NestJS completes
    // ALL onModuleInit hooks before ANY onApplicationBootstrap, so the client is
    // ready before other modules' bootstrap hooks use it (e.g. EmployeeInit ->
    // ActorLog.createSubTable, which was crashing the app on a startup race).
    // _connectWithRetry never throws - on total failure it leaves the service
    // unavailable for lazy reconnect on the next query.
    await this._connectWithRetry();
    if (this.isAvailable) {
      this.logger.log('TDengine WebSocket client ready');
    } else {
      this.logger.warn(
        'TDengine is unavailable after startup retries; queries will reconnect lazily',
      );
    }
  }

  private async _connectWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
      if (this._isShutDown) return;

      try {
        await this._connectOnce();
        return;
      } catch (err) {
        this.logger.error(
          `TDengine connection attempt ${attempt}/${MAX_CONNECT_RETRIES} failed:`,
          err,
        );

        if (attempt === MAX_CONNECT_RETRIES) {
          // Don't throw - let app start. The next query will lazily reconnect
          // via _withReconnect (see exec/query) instead of failing forever.
          this.logger.error(
            'TDengine failed to connect after all retries. ' +
              'Service will be unavailable until the next query reconnects.',
          );
          return;
        }

        await this._delay(RETRY_DELAY_MS * attempt); // linear backoff
      }
    }
  }

  /**
   * One connection attempt: (re)establish the WS client, select the DB, and
   * run registered idempotent schema initializers. Sets `_isConnected` on success;
   * throws on failure so the caller (startup retry loop or lazy reconnect)
   * decides what to do. `_connecting` is held for the whole attempt so the
   * reconnect-on-error wrapper does not re-enter while connection initializers
   * run.
   */
  private async _connectOnce(): Promise<void> {
    this._connecting = true;
    try {
      const { wsUrl, user, password, dbName } = AppConfig().timeseriesDb;
      const conf = new this.taos.WSConfig(wsUrl);
      conf.setUser(user);
      conf.setPwd(password);
      conf.setDb(dbName);
      conf.setTimeOut(5_000);

      // Close any half-open client left by a previous failed attempt before
      // reconnecting, so a retry can't leak the prior WS connection.
      if (this.client) {
        try {
          await this.client.close?.();
        } catch {
          // ignore - it's being replaced regardless
        }
        this.client = null;
      }

      const client = await this.taos.sqlConnect(conf);
      // If shutdown began while we were connecting, don't adopt the new client
      // - shutdown() may already have run its close(). Discard and bail so we
      // never leave a live socket open past shutdown.
      if (this._isShutDown) {
        try {
          await client.close?.();
        } catch {
          // ignore
        }
        return;
      }
      this.client = client;
      await this.client.exec(`USE ${dbName}`);

      this._isConnected = true;
      this.logger.log('TDengine connected');
      for (const initialize of this.connectionInitializers) {
        await initialize();
      }
    } catch (err) {
      this._isConnected = false;
      throw err;
    } finally {
      this._connecting = false;
    }
  }

  /**
   * Lazily (re)establish the connection on demand. Single-flight: a burst of
   * callers awaits one shared attempt. No-op during shutdown. Never throws -
   * failure leaves `_isConnected` false and the caller's getClient() guard
   * surfaces the clear "not available" error.
   */
  private async _reconnect(): Promise<void> {
    if (this._isShutDown) return;
    if (!this._reconnecting) {
      this._reconnecting = this._connectOnce()
        .catch((err) => {
          this.logger.error('TDengine reconnect attempt failed:', err);
        })
        .finally(() => {
          this._reconnecting = null;
        });
    }
    await this._reconnecting;
  }

  /**
   * Whether an error from the driver indicates a broken/closed socket (so a
   * reconnect is warranted). Codes are @tdengine/websocket ErrorCode values;
   * query-timeout (105) and connection-limit (110) are deliberately excluded
   * so a slow query or server-side cap can't tear down a healthy connection.
   */
  private _isConnectionError(err: any): boolean {
    const code = err?.code;
    return code === 104 /* CONNECTION_FAIL */ || code === 108; /* CLOSED */
  }

  /**
   * Run a WS operation, reconnecting once if needed. If the client isn't
   * available (failed startup / prior drop) it tries to reconnect first; if the
   * op fails with a connection-level error it reconnects and retries exactly
   * once. SQL/other errors propagate unchanged. Steady-state (connected) callers
   * take the fast path with no added behavior.
   */
  private async _withReconnect<T>(op: (client: any) => Promise<T>): Promise<T> {
    if (!this.isAvailable && !this._isShutDown && !this._connecting) {
      await this._reconnect();
    }
    try {
      return await op(this.getClient());
    } catch (err) {
      if (
        this._isShutDown ||
        this._connecting ||
        !this._isConnectionError(err)
      ) {
        throw err;
      }
      this._isConnected = false;
      await this._reconnect();
      return await op(this.getClient());
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getClient(): any {
    if (!this.isAvailable) {
      throw new Error(
        'TDengine client is not available. ' +
          'Either startup connection failed or shutdown is in progress.',
      );
    }
    return this.client;
  }
  /**
   * Called by ShutdownOrchestratorService at the correct shutdown step.
   *
   * @tdengine/websocket exposes:
   *   client.close()         -> graceful close (preferred)
   *   client.destroy()       -> force close (fallback)
   *
   * Check your installed version's API if method names differ.
   */
  async shutdown(): Promise<void> {
    if (this._isShutDown) return;
    this._isShutDown = true;
    this._isConnected = false;

    try {
      if (this.client && typeof this.client.close === 'function') {
        await this.client.close();
        this.logger.log('TDengine WebSocket connection closed gracefully');
      } else if (this.client && typeof this.client.destroy === 'function') {
        // Fallback for older versions of the driver
        this.client.destroy();
        this.logger.log('TDengine WebSocket connection destroyed');
      } else {
        this.logger.warn(
          'TDengine client has no close/destroy method - skipping',
        );
      }
    } catch (err) {
      this.logger.error('Error closing TDengine connection:', err);
      // Attempt force destroy as last resort
      try {
        this.client?.destroy?.();
      } catch {
        // ignore
      }
    }
  }

  /**
   * NestJS lifecycle hook - becomes no-op if orchestrator already ran shutdown()
   */
  async onModuleDestroy(): Promise<void> {
    if (this._isShutDown) return;
    if (this.shutdownOrchestrator.isShuttingDown) return; // stand down for orchestrator
    await this.shutdown();
  }

  /**
   * Guard: reject new queries if we're shutting down.
   * Use this in TimeseriesRepository before executing any query.
   */
  get isAvailable(): boolean {
    return this._isConnected && !this._isShutDown;
  }

  async exec(sqlCommand: string): Promise<void> {
    await this._withReconnect((client) => client.exec(sqlCommand));
  }

  async query(sqlQuery: string) {
    return await this._withReconnect((client) => client.query(sqlQuery));
  }

  async close() {
    // close is teardown - tolerate an absent/already-closed client.
    await this.client?.close();
  }
}
