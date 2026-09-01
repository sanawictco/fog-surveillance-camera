import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Scope,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import AppConfig from 'configs/app.config';
import { isValidCron } from 'cron-validator';
import Redis from 'ioredis';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';
import {
  IQueue,
  QueueMsg,
  QueueMsgOptions,
  QueueWorkerOverrides,
} from './queue.interface';
import { generateRandomId } from 'src/dddLib/utils/randomIdGenerator';

// single source of truth for the worker event that add/removeEventListener
// subscribe to. The event is also stored per-listener (see eventListeners) so
// detach always targets the exact event a handler was attached with - never a
// hardcoded literal in removeEventListener (Q13). Widen this union to add a new
// event type and both attach/detach follow automatically.
const WORKER_LISTENER_EVENT = 'completed' as const;
type WorkerListenerEvent = typeof WORKER_LISTENER_EVENT;

@Injectable({ scope: Scope.TRANSIENT })
export class QueueService<T>
  implements IQueue<T>, IShutdownHandler, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(QueueService.name);

  public queueName!: string;
  public queue!: Queue;

  static readonly workers: Map<string, Worker> = new Map();
  static readonly eventListeners: Map<
    string,
    { event: WorkerListenerEvent; handler: (msg: QueueMsg) => Promise<void> }
  > = new Map();

  // Shared connection used ONLY for static utility methods (isQueueExists, static addMsg, etc.)
  // Queue and Worker instances each get their own connection via getConnectionOptions()
  private static _connection: Redis | null = null;
  private static _isStaticShuttingDown = false;
  private _isShutDown = false;

  // reusable Queue handles for the static helpers (static addMsg / getMsg /
  // deleteQueue). Each `new Queue` opens its own Redis connection; constructing
  // one per call floods Redis on hot paths (e.g. eventBus static emit). We cache
  // one Queue per name and reuse it; they are closed by closeStaticQueues() on
  // the last-queue-out shutdown branch (and per-name on deleteQueue).
  private static readonly _staticQueues: Map<string, Queue> = new Map();

  private static getStaticQueue(queueName: string): Queue {
    let queue = QueueService._staticQueues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, {
        connection: QueueService.getConnectionOptions(),
      });
      QueueService._staticQueues.set(queueName, queue);
    }
    return queue;
  }

  private static async closeStaticQueue(queueName: string): Promise<void> {
    const queue = QueueService._staticQueues.get(queueName);
    if (!queue) return;
    QueueService._staticQueues.delete(queueName);
    try {
      await queue.close();
    } catch {
      // already closed - ignore
    }
  }

  private static async closeStaticQueues(): Promise<void> {
    const queues = [...QueueService._staticQueues.values()];
    QueueService._staticQueues.clear();
    await Promise.allSettled(queues.map((queue) => queue.close()));
  }

  @Inject(ShutdownOrchestratorService)
  private readonly shutdownOrchestrator!: ShutdownOrchestratorService;

  constructor() {}

  /**
   * Returns a plain connection options object.
   * BullMQ Queue/Worker will create and manage their own Redis connection from this.
   * This means queue.close() / worker.close() only close THAT instance's connection,
   * not any shared connection - preventing the "first queue kills Redis for all" bug.
   */
  private static getConnectionOptions() {
    return {
      host: AppConfig().redis.host,
      port: AppConfig().redis.port,
      password: AppConfig().redis.password, // optional; undefined == no AUTH
      db: AppConfig().redis.db, // env-tunable (REDIS_DB), defaults to 1
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      keepAlive: 30000, // Detect dead sockets via TCP keepalive
      connectTimeout: 10000, // Don't hang forever on connect
      retryStrategy: (times: number) => {
        if (QueueService._isStaticShuttingDown) return null;
        return Math.min(times * 50, 2000);
      },
      reconnectOnError: (err: Error) => {
        // Reconnect on socket-level errors common during VPN switches
        const reconnectErrors = [
          'ECONNRESET',
          'ECONNREFUSED',
          'ETIMEDOUT',
          'EPIPE',
        ];
        return reconnectErrors.some((code) => err.message.includes(code));
      },
    };
  }
  /**
   * Shared Redis instance - used only for static utility operations.
   * NOT passed to Queue/Worker constructors.
   */
  static get connection(): Redis {
    // build from the SAME options as Queue/Worker connections
    // (getConnectionOptions) so the shared utility connection also gets
    // reconnectOnError. Previously this inline literal omitted it, so on
    // ECONNRESET/EPIPE the utility socket died silently and isQueueExists /
    // static addMsg started failing. Keeping one source of options prevents
    // the two from drifting again.
    QueueService._connection ??= new Redis(QueueService.getConnectionOptions());
    return QueueService._connection;
  }

  async onModuleInit(): Promise<void> {
    // this runs on EVERY transient instantiation. Only clear the
    // process-wide shutdown flag at genuine startup - i.e. when no queue is live
    // yet and no orchestrated shutdown is in flight. Otherwise a fresh injection
    // created during teardown would flip the flag back to false and re-enable
    // Redis reconnects while connections are being torn down.
    if (
      QueueService.workers.size === 0 &&
      !this.shutdownOrchestrator.isShuttingDown
    ) {
      QueueService._isStaticShuttingDown = false;
    }
  }

  /**
   * Called by ShutdownOrchestratorService in the correct order.
   * Steps:
   *  1. Close worker - waits for active jobs to finish
   *  2. Close queue - closes this queue's own Redis connection
   *  3. Quit the shared utility connection ONLY when this is the last live queue
   *
   * this service is Scope.TRANSIENT but `_isStaticShuttingDown` and
   * `_connection` are process-global, shared by every live queue instance. A
   * per-instance teardown (a single onModuleDestroy, test reload, dynamic-module
   * unload) must therefore NOT flip the global reconnect flag or quit the shared
   * connection while other queues are still running - doing so breaks
   * isQueueExists / static addMsg for all of them. So we only touch shared state
   * during a real orchestrated shutdown or when we're the last queue out.
   */
  async shutdown(): Promise<void> {
    if (this._isShutDown) return;
    this._isShutDown = true;

    // Suppress Redis reconnects process-wide only during a real full shutdown.
    // A lone instance teardown leaves the flag alone so surviving queues keep
    // reconnecting.
    if (this.shutdownOrchestrator.isShuttingDown) {
      QueueService._isStaticShuttingDown = true;
    }

    const worker = QueueService.workers.get(this.queueName);
    if (worker) {
      this.logger.log(
        `[${this.queueName}] Waiting for active jobs to finish...`,
      );
      await worker.close(); // gracefully waits for active jobs
      QueueService.workers.delete(this.queueName);
      this.logger.log(`[${this.queueName}] Worker closed`);
    }

    if (this.queue) {
      this.queue.removeAllListeners();
      await this.queue.close();
      this.logger.log(`[${this.queueName}] Queue closed`);
    }

    // Quit the shared utility connection ONLY when no other live queue still
    // needs it. workers.size (after this instance's own delete above) is the
    // count of remaining live queues; 0 means we're the last one out. This is
    // what prevents a single-instance teardown from killing Redis for queues
    // that are still running
    if (QueueService.workers.size === 0) {
      QueueService._isStaticShuttingDown = true; // nothing left to reconnect for
      await QueueService.closeStaticQueues(); // release cached helper connections
      if (QueueService._connection) {
        try {
          await QueueService._connection.quit();
          this.logger.log('Queue Redis utility connection closed');
        } catch {
          // Already closed by a previous queue shutdown - ignore
        } finally {
          QueueService._connection = null;
        }
      }
    }
  }

  /**
   * NestJS lifecycle hook - no-op if orchestrator already ran shutdown()
   */
  async onModuleDestroy(): Promise<void> {
    if (this._isShutDown) return;
    if (this.shutdownOrchestrator.isShuttingDown) return; // stand down for orchestrator
    await this.shutdown();
  }

  createQueue(
    queueName: string,
    workerMsgHandler: (msg: QueueMsg) => Promise<void>,
    expiredMsgHandler?: (msg: QueueMsg) => Promise<void>,
    failureMsgHandler?: (msg: QueueMsg, err: Error) => Promise<void>,
    workerOptions?: QueueWorkerOverrides,
  ): this {
    // Q3 (TOCTOU): the claim below - has() guard through workers.set() - MUST
    // stay synchronous (no `await` between them). JS run-to-completion then makes
    // the check-and-register atomic, so two concurrent createQueue() calls for the
    // same name can never both pass the guard and back one queueName with two
    // Workers (which would fire every job twice - a rule-engine duplication
    // invariant violation). Do not introduce an await in this window.
    if (QueueService.workers.has(queueName)) {
      throw new Error(
        `Queue "${queueName}" already registered. Use a unique name.`,
      );
    }
    this.queueName = queueName;
    // Use getConnectionOptions() so this Queue gets its own Redis connection.
    // Closing this queue will NOT affect other queues or the shared utility connection.
    this.queue = new Queue(queueName, {
      connection: QueueService.getConnectionOptions(),
    });

    // clear any stale paused state left by a previous shutdown
    this.queue.resume().catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(
        `[${queueName}] resume() on init failed: ${e.message}`,
        e.stack,
      );
    });
    this.queue.on('error', (err: Error) => {
      this.logger.error(
        `[${queueName}] Queue error: ${err.message}`,
        err.stack,
      );
    });

    // Guard: reject new jobs if shutting down
    const safeWorkerHandler = async (msg: QueueMsg) => {
      if (this._isShutDown || this.shutdownOrchestrator.isShuttingDown) {
        this.logger.warn(
          `[${queueName}] Rejecting job during shutdown: ${msg.name}`,
        );
        throw new Error('Service is shutting down');
      }
      return workerMsgHandler(msg);
    };

    // Use getConnectionOptions() so this Worker gets its own Redis connection.
    // autorun: false - do NOT begin consuming on construction. We start the
    // worker (worker.run()) only after it is registered as this queueName's sole
    // owner and the completed/failed business handlers are attached below, so no
    // job is ever processed by an unregistered worker or before its listeners exist.
    //
    // tuning defaults below are the rule-engine's CLAUDE.md-sanctioned values
    // and are applied to EVERY queue unless a caller overrides them via
    // workerOptions. Defaults are unchanged, so existing callers (including the
    // rule-engine, which must keep these exact values) behave identically. Only
    // auxiliary queues that pass workerOptions deviate. Do NOT pass overrides for
    // the rule-engine queue - its concurrency/lockDuration are tied to
    // RULE_ENGINE_NODE_HANDLER_TIMEOUT_MS.
    const worker = new Worker(queueName, safeWorkerHandler, {
      connection: QueueService.getConnectionOptions(),
      autorun: false,
      concurrency: workerOptions?.concurrency ?? 1000,
      lockDuration: workerOptions?.lockDuration ?? 60_000,
      lockRenewTime: workerOptions?.lockRenewTime ?? 20_000,
      stalledInterval: workerOptions?.stalledInterval ?? 15_000,
    });

    worker.on('error', (err: Error) => {
      this.logger.error(
        `[${queueName}] Worker error: ${err.message}`,
        err.stack,
      );
    });
    worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `[${queueName}] Job failed: ${job?.name} - ${err.message}`,
        err.stack,
      );
    });

    QueueService.workers.set(queueName, worker);

    // Register with orchestrator now that queueName is known
    this.shutdownOrchestrator.registerHandler(`Queue[${queueName}]`, this);

    if (expiredMsgHandler) {
      worker.on('completed', async (msg: QueueMsg) => {
        if (
          msg.opts.repeat &&
          msg.opts.repeat.limit === msg.opts.repeat.count
        ) {
          try {
            await this.getAndDeleteMsg(msg.name);
            await expiredMsgHandler(msg);
          } catch (err) {
            this.logger.error(`[${queueName}] expiredMsgHandler error:`, err);
          }
        }
      });
    }

    if (failureMsgHandler) {
      worker.on('failed', async (job, err) => {
        if (!job) {
          this.logger.error(
            `[${queueName}] failureMsgHandler: job is undefined`,
          );
          return;
        }
        try {
          await failureMsgHandler(job as QueueMsg, err);
        } catch (e) {
          this.logger.error(`[${queueName}] failureMsgHandler error:`, e);
        }
      });
    }

    // Begin consuming now that this worker is the registered sole owner of
    // queueName and all completed/failed listeners are attached (see autorun
    // note above). run() returns a long-lived promise that we intentionally do
    // not await - it drives the processing loop for the worker's lifetime.
    // Route run-loop errors to the 'error' event exactly as BullMQ's own
    // autorun path does (worker.js: `this.run().catch(e => this.emit('error', e))`),
    // so they land on the existing worker.on('error') handler - no new code path.
    worker.run().catch((err) => worker.emit('error', err));

    return this;
  }

  /**
   * Builds the BullMQ repeat template + completed-job retention for a repeating
   * job. Shared by the instance and static addMsg so their semantics can't drift.
   *
   * Q11 - `retryCount` of `undefined` OR `0` both mean "repeat forever". This is
   * load-bearing: scheduler.setInterval passes `retryCount: 0` to get an
   * unbounded interval, so the two cases are folded deliberately (not via
   * accidental falsy coercion). A negative or non-integer count can't be a valid
   * BullMQ `limit`, so it's rejected loudly instead of silently producing a
   * broken schedule (the failure mode for an arithmetic-derived count).
   */
  private static buildRepeatTemplate(opts: QueueMsgOptions): {
    repeat: Record<string, any>;
    removeOnComplete: any;
  } {
    const { retryCount, retryPeriodInSecond } = opts.repeat!;
    if (
      retryCount !== undefined &&
      (!Number.isInteger(retryCount) || retryCount < 0)
    ) {
      throw new Error(
        `Invalid repeat.retryCount: ${retryCount} ` +
          `(must be a non-negative integer; 0 / undefined = unbounded)`,
      );
    }

    const repeat: Record<string, any> = { every: retryPeriodInSecond * 1000 };
    let removeOnComplete: any;
    if (!retryCount) {
      // unbounded: no limit/count, just an ongoing interval.
      removeOnComplete = true;
      repeat.startDate = new Date(Date.now() + repeat.every);
    } else {
      // Q12 - finite repeat: retain completed jobs for one full run
      // (period x count). No `|| 1` fallback - this branch only runs for a
      // positive integer count, so the guard was dead code.
      repeat.limit = retryCount;
      repeat.count = 0;
      removeOnComplete = { age: retryPeriodInSecond * retryCount };
    }
    if (opts.delayInSecond !== undefined) {
      repeat.startDate = new Date(Date.now() + opts.delayInSecond * 1000);
    }
    return { repeat, removeOnComplete };
  }

  async addMsg(msg: any, opts?: QueueMsgOptions): Promise<void> {
    if (!this.queue) throw new Error('Queue does not exist');
    if (this._isShutDown || this.shutdownOrchestrator.isShuttingDown) {
      throw new Error('Cannot add jobs during shutdown');
    }

    if (opts?.repeat) {
      const { repeat, removeOnComplete } =
        QueueService.buildRepeatTemplate(opts);
      await this.queue.upsertJobScheduler(opts.msgId, repeat, {
        name: opts.msgId,
        data: msg,
        opts: {
          removeOnComplete,
          removeOnFail: true,
          attempts: opts?.attempts || 3,
        },
      });
    } else if (opts?.cron) {
      if (!isValidCron(opts.cron, { seconds: true }))
        throw new Error('Invalid cron format');
      await this.queue.upsertJobScheduler(
        opts.msgId,
        { pattern: opts.cron },
        {
          name: opts.msgId,
          data: msg.data,
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: opts?.attempts || 3,
          },
        },
      );
    } else {
      const jobId = opts?.msgId || `random-msg-${generateRandomId(12)}`;
      await this.queue.add(opts?.msgId || 'random-msg', msg.data, {
        removeOnComplete: true,
        removeOnFail: true,
        delay: (opts?.delayInSecond || 0) * 1000,
        jobId,
        // one-shot jobs default to attempts:1 (fail fast, no retry). These
        // jobs are non-idempotent (rule-engine nodes actuate devices / send
        // SMS); retrying a one-shot would duplicate the physical side effect -
        // the rule-engine invariant mandates attempts:1. Callers that genuinely
        // want retries pass opts.attempts explicitly. (repeat/cron branches keep
        // their default of 3.)
        attempts: opts?.attempts || 1,
      });
    }
  }

  /**
   * reuses a cached Queue handle (getStaticQueue) instead of constructing
   * and closing one per call, so hot static-emit paths don't flood Redis with
   * connections. The handle is released by closeStaticQueues() on shutdown.
   */
  static async addMsg(
    queueName: string,
    msg: any,
    opts?: QueueMsgOptions,
  ): Promise<void> {
    // mirror the instance addMsg guard - reject new jobs once the queue
    // subsystem is shutting down, instead of racing the worker/connection close.
    if (QueueService._isStaticShuttingDown)
      throw new Error('Cannot add jobs during shutdown');
    if (!(await QueueService.isQueueExists(queueName)))
      throw new Error('Queue does not exist');

    const queue = QueueService.getStaticQueue(queueName);
    if (opts?.repeat) {
      const { repeat, removeOnComplete } =
        QueueService.buildRepeatTemplate(opts);
      await queue.upsertJobScheduler(opts.msgId, repeat, {
        name: opts.msgId,
        data: msg,
        opts: {
          removeOnComplete,
          removeOnFail: true,
          attempts: opts?.attempts || 3,
        },
      });
    } else if (opts?.cron) {
      if (!isValidCron(opts.cron, { seconds: true }))
        throw new Error('Invalid cron format');
      await queue.upsertJobScheduler(
        opts.msgId,
        { pattern: opts.cron },
        {
          name: opts.msgId,
          data: msg.data,
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: opts?.attempts || 3,
          },
        },
      );
    } else {
      const jobId = opts?.msgId || `random-msg-${generateRandomId(12)}`;
      await queue.add(opts?.msgId || 'random-msg', msg.data, {
        removeOnComplete: true,
        removeOnFail: true,
        delay: (opts?.delayInSecond || 0) * 1000,
        jobId,
        attempts: opts?.attempts || 1, // one-shot fail-fast (see instance addMsg)
      });
    }
  }

  async getMsg(msgId: string): Promise<T | undefined> {
    const msg = await this.queue.getJobScheduler(`${msgId}`);
    if (msg?.template?.data) return msg.template.data as T;
    return undefined;
  }

  /**
   * reuses a cached Queue handle instead of opening/closing one per call.
   */
  static async getMsg(queueName: string, msgId: string): Promise<any> {
    const queue = QueueService.getStaticQueue(queueName);
    const msg = await queue.getJobScheduler(`${msgId}`);
    if (msg?.template?.data) return msg.template.data;
  }

  async getAndDeleteMsg(msgId: string): Promise<T | undefined> {
    if (!this.queue) throw new Error("Queue doesn't exist");
    const msg = await this.getMsg(msgId);
    if (msg) {
      await this.queue.removeJobScheduler(msgId);
      return msg;
    }
    return undefined;
  }

  async deleteOneTimeMsg(msgId: string): Promise<boolean> {
    if (!this.queue) throw new Error('Queue does not exist');
    const job: Job | undefined = await this.queue.getJob(`${msgId}`);
    if (!job) return false;
    // best-effort removal. The old code force-failed via
    // extendLock(fakeToken)/moveToFailed, but those ran only AFTER remove()
    // already deleted the job - so they always threw on an absent job (logged as
    // a spurious error) and never actually helped. They also can't safely fail a
    // job a worker is actively holding without racing its lock (and force-failing
    // an in-flight rule node would risk the never-duplicate invariant). So we
    // just remove(); a job locked by a running worker throws here and we report
    // false rather than claiming a success that didn't happen.
    try {
      await this.queue.remove(msgId);
      return true;
    } catch (e) {
      this.logger.warn(
        `[${this.queueName}] deleteOneTimeMsg: could not remove ${msgId} (likely active): ${
          (e as Error)?.message ?? String(e)
        }`,
      );
      return false;
    }
  }

  static async deleteQueue(queueName: string): Promise<void> {
    const worker = QueueService.workers.get(queueName);
    await worker?.close();
    QueueService.workers.delete(queueName);

    // obliterate({ force: true }) removes every job in every state plus the
    // queue metadata, so the previous pause/drain/cleanx7 were all wasted RTTs.
    // reuse the cached Queue handle, then drop it (the queue no longer
    // exists, so its handle/connection must not linger in the pool).
    const queue = QueueService.getStaticQueue(queueName);
    try {
      queue.removeAllListeners();
      await queue.obliterate({ force: true });
    } finally {
      await QueueService.closeStaticQueue(queueName);
    }
  }

  static addEventListener(
    queueName: string,
    eventHandler: (msg: QueueMsg) => Promise<void>,
    eventId: string,
  ): void {
    const key = `${queueName}-${eventId}`;
    const queueWorker = QueueService.workers.get(queueName);
    // detach any handler previously registered under this same key before
    // attaching the new one. Otherwise re-registering an eventId (e.g. a rule
    // chain / scheduler recreate path) left the old worker.on('completed', ...)
    // subscription firing forever - the map only tracked the latest, so
    // removeEventListener could never remove the stale one (duplicate delivery).
    const existing = QueueService.eventListeners.get(key);
    if (queueWorker && existing)
      queueWorker.off(existing.event, existing.handler);
    queueWorker?.on(WORKER_LISTENER_EVENT, eventHandler);
    QueueService.eventListeners.set(key, {
      event: WORKER_LISTENER_EVENT,
      handler: eventHandler,
    });
  }

  async addEventListener(
    queueName: string,
    eventHandler: (msg: QueueMsg) => Promise<void>,
    eventId: string,
  ): Promise<void> {
    QueueService.addEventListener(queueName, eventHandler, eventId);
  }

  removeEventListener(queueName: string, eventId: string): void {
    const queueWorker = QueueService.workers.get(queueName);
    const entry = QueueService.eventListeners.get(`${queueName}-${eventId}`);
    // detach the exact event the handler was attached with (Q13) - not a
    // hardcoded 'completed' - so a future heterogeneous-event listener can't
    // leave an orphaned subscription.
    if (queueWorker && entry) queueWorker.off(entry.event, entry.handler);
    QueueService.eventListeners.delete(`${queueName}-${eventId}`);
  }

  static removeEventListener(queueName: string, eventId: string): void {
    const queueWorker = QueueService.workers.get(queueName);
    const entry = QueueService.eventListeners.get(`${queueName}-${eventId}`);
    // detach the exact event the handler was attached with (Q13) - not a
    // hardcoded 'completed' - so a future heterogeneous-event listener can't
    // leave an orphaned subscription.
    if (queueWorker && entry) queueWorker.off(entry.event, entry.handler);
    QueueService.eventListeners.delete(`${queueName}-${eventId}`);
  }

  static async isQueueExists(queueName: string): Promise<boolean> {
    return (
      (await QueueService.connection.exists(`bull:${queueName}:events`)) === 1
    );
  }

  async getQueueHealth(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}
