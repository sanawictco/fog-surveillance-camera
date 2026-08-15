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
import { generateRandomId } from 'src/dddLib/utils/randomIdGenerator';
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

const WORKER_LISTENER_EVENT = 'completed' as const;
type WorkerListenerEvent = typeof WORKER_LISTENER_EVENT;

@Injectable({ scope: Scope.TRANSIENT })
export class QueueService<T>
  implements IQueue<T>, IShutdownHandler, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(QueueService.name);

  public queueName!: string;
  public queue!: Queue;

  static readonly workers = new Map<string, Worker>();
  static readonly eventListeners = new Map<
    string,
    { event: WorkerListenerEvent; handler: (msg: QueueMsg) => Promise<void> }
  >();

  private static connectionInstance: Redis | null = null;
  private static isStaticShuttingDown = false;
  private static readonly staticQueues = new Map<string, Queue>();
  private isShutDown = false;

  @Inject(ShutdownOrchestratorService)
  private readonly shutdownOrchestrator!: ShutdownOrchestratorService;

  static get connection(): Redis {
    QueueService.connectionInstance ??= new Redis(
      QueueService.getConnectionOptions(),
    );
    return QueueService.connectionInstance;
  }

  onModuleInit(): void {
    if (
      QueueService.workers.size === 0 &&
      !this.shutdownOrchestrator.isShuttingDown
    ) {
      QueueService.isStaticShuttingDown = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;

    if (this.shutdownOrchestrator.isShuttingDown) {
      QueueService.isStaticShuttingDown = true;
    }

    const worker = QueueService.workers.get(this.queueName);
    if (worker) {
      this.logger.log(`[${this.queueName}] Waiting for active jobs to finish`);
      const drained = await QueueService.settleWithin(worker.close(), 15_000);
      if (!drained) {
        this.logger.warn(
          `[${this.queueName}] Worker drain timed out; forcing disconnect`,
        );
        await worker.disconnect().catch(() => undefined);
      }
      QueueService.workers.delete(this.queueName);
      this.logger.log(`[${this.queueName}] Worker closed`);
    }

    if (this.queue) {
      this.queue.removeAllListeners();
      const closed = await QueueService.settleWithin(this.queue.close(), 3_000);
      if (!closed) await this.queue.disconnect().catch(() => undefined);
      this.logger.log(`[${this.queueName}] Queue closed`);
    }

    if (QueueService.workers.size === 0) {
      QueueService.isStaticShuttingDown = true;
      await QueueService.closeStaticQueues();
      if (QueueService.connectionInstance) {
        try {
          await QueueService.connectionInstance.quit();
          this.logger.log('Queue Redis utility connection closed');
        } catch {
          QueueService.connectionInstance.disconnect();
        } finally {
          QueueService.connectionInstance = null;
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }

  createQueue(
    queueName: string,
    workerMsgHandler: (msg: QueueMsg) => Promise<void>,
    expiredMsgHandler?: (msg: QueueMsg) => Promise<void>,
    failureMsgHandler?: (msg: QueueMsg, err: Error) => Promise<void>,
    workerOptions?: QueueWorkerOverrides,
  ): this {
    if (QueueService.workers.has(queueName)) {
      throw new Error(`Queue "${queueName}" already registered`);
    }

    this.queueName = queueName;
    this.queue = new Queue(queueName, {
      connection: QueueService.getConnectionOptions(),
    });
    void this.queue.resume().catch((err: unknown) => {
      this.logger.warn(
        `[${queueName}] Failed to resume queue: ${QueueService.errorMessage(err)}`,
      );
    });
    this.queue.on('error', (err: Error) =>
      this.logger.error(`[${queueName}] Queue error: ${err.message}`, err),
    );

    const safeWorkerHandler = async (msg: QueueMsg) => {
      if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) {
        throw new Error('Service is shutting down');
      }
      return workerMsgHandler(msg);
    };

    const worker = new Worker(queueName, safeWorkerHandler, {
      connection: QueueService.getConnectionOptions(),
      autorun: false,
      concurrency: workerOptions?.concurrency ?? 1000,
      lockDuration: workerOptions?.lockDuration ?? 60_000,
      lockRenewTime: workerOptions?.lockRenewTime ?? 20_000,
      stalledInterval: workerOptions?.stalledInterval ?? 15_000,
    });

    worker.on('error', (err: Error) =>
      this.logger.error(`[${queueName}] Worker error: ${err.message}`, err),
    );
    worker.on('failed', (job: Job | undefined, err: Error) =>
      this.logger.error(
        `[${queueName}] Job failed: ${job?.name ?? 'unknown'}: ${err.message}`,
        err,
      ),
    );

    QueueService.workers.set(queueName, worker);
    this.shutdownOrchestrator.registerHandler(`Queue[${queueName}]`, this);

    if (expiredMsgHandler) {
      worker.on('completed', async (msg: QueueMsg) => {
        const repeat = (msg.opts as any).repeat;
        if (repeat && repeat.limit === repeat.count) {
          try {
            await this.getAndDeleteMsg(msg.name);
            await expiredMsgHandler(msg);
          } catch (err) {
            this.logger.error(`[${queueName}] Expired handler failed`, err);
          }
        }
      });
    }

    if (failureMsgHandler) {
      worker.on('failed', async (job, err) => {
        if (!job) return;
        try {
          await failureMsgHandler(job as QueueMsg, err);
        } catch (handlerError) {
          this.logger.error(
            `[${queueName}] Failure handler failed`,
            handlerError,
          );
        }
      });
    }

    worker.run().catch((err) => worker.emit('error', err));
    return this;
  }

  async addMsg(msg: any, opts?: QueueMsgOptions): Promise<void> {
    if (!this.queue) throw new Error('Queue does not exist');
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) {
      throw new Error('Cannot add jobs during shutdown');
    }
    await QueueService.addToQueue(this.queue, msg, opts);
  }

  static async addMsg(
    queueName: string,
    msg: any,
    opts?: QueueMsgOptions,
  ): Promise<void> {
    if (QueueService.isStaticShuttingDown) {
      throw new Error('Cannot add jobs during shutdown');
    }
    if (!(await QueueService.isQueueExists(queueName))) {
      throw new Error('Queue does not exist');
    }
    await QueueService.addToQueue(
      QueueService.getStaticQueue(queueName),
      msg,
      opts,
    );
  }

  async getMsg(msgId: string): Promise<T | undefined> {
    const msg = await this.queue.getJobScheduler(msgId);
    return msg?.template?.data as T | undefined;
  }

  static async getMsg(queueName: string, msgId: string): Promise<any> {
    const msg =
      await QueueService.getStaticQueue(queueName).getJobScheduler(msgId);
    return msg?.template?.data;
  }

  async getAndDeleteMsg(msgId: string): Promise<T | undefined> {
    if (!this.queue) throw new Error('Queue does not exist');
    const msg = await this.getMsg(msgId);
    if (msg !== undefined) {
      await this.queue.removeJobScheduler(msgId);
      return msg;
    }
    return undefined;
  }

  async deleteOneTimeMsg(msgId: string): Promise<boolean> {
    if (!this.queue) throw new Error('Queue does not exist');
    const job = await this.queue.getJob(msgId);
    if (!job) return false;
    try {
      await this.queue.remove(msgId);
      return true;
    } catch (err) {
      this.logger.warn(
        `[${this.queueName}] Could not remove ${msgId}: ${QueueService.errorMessage(err)}`,
      );
      return false;
    }
  }

  static async deleteQueue(queueName: string): Promise<void> {
    const worker = QueueService.workers.get(queueName);
    await worker?.close();
    QueueService.workers.delete(queueName);

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
    const worker = QueueService.workers.get(queueName);
    const existing = QueueService.eventListeners.get(key);
    if (worker && existing) worker.off(existing.event, existing.handler);
    worker?.on(WORKER_LISTENER_EVENT, eventHandler);
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
    QueueService.removeEventListener(queueName, eventId);
  }

  static removeEventListener(queueName: string, eventId: string): void {
    const key = `${queueName}-${eventId}`;
    const worker = QueueService.workers.get(queueName);
    const entry = QueueService.eventListeners.get(key);
    if (worker && entry) worker.off(entry.event, entry.handler);
    QueueService.eventListeners.delete(key);
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

  private static getConnectionOptions() {
    return {
      host: AppConfig().redis.host,
      port: AppConfig().redis.port,
      password: AppConfig().redis.password || undefined,
      db: AppConfig().redis.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      keepAlive: 30_000,
      connectTimeout: 10_000,
      retryStrategy: (times: number) => {
        if (QueueService.isStaticShuttingDown) return null;
        return Math.min(times * 50, 2000);
      },
      reconnectOnError: (err: Error) =>
        ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].some((code) =>
          err.message.includes(code),
        ),
    };
  }

  private static getStaticQueue(queueName: string): Queue {
    let queue = QueueService.staticQueues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, {
        connection: QueueService.getConnectionOptions(),
      });
      QueueService.staticQueues.set(queueName, queue);
    }
    return queue;
  }

  private static async closeStaticQueue(queueName: string): Promise<void> {
    const queue = QueueService.staticQueues.get(queueName);
    if (!queue) return;
    QueueService.staticQueues.delete(queueName);
    const closed = await QueueService.settleWithin(queue.close(), 2_000);
    if (!closed) await queue.disconnect().catch(() => undefined);
  }

  private static async closeStaticQueues(): Promise<void> {
    const queues = [...QueueService.staticQueues.values()];
    QueueService.staticQueues.clear();
    await Promise.allSettled(
      queues.map(async (queue) => {
        const closed = await QueueService.settleWithin(queue.close(), 2_000);
        if (!closed) await queue.disconnect().catch(() => undefined);
      }),
    );
  }

  private static buildRepeatTemplate(opts: QueueMsgOptions): {
    repeat: Record<string, any>;
    removeOnComplete: any;
  } {
    const { retryCount, retryPeriodInSecond } = opts.repeat!;
    if (
      retryCount !== undefined &&
      (!Number.isInteger(retryCount) || retryCount < 0)
    ) {
      throw new Error('repeat.retryCount must be a non-negative integer');
    }
    if (retryPeriodInSecond <= 0) {
      throw new Error('repeat.retryPeriodInSecond must be positive');
    }

    const repeat: Record<string, any> = {
      every: retryPeriodInSecond * 1000,
    };
    let removeOnComplete: any;
    if (!retryCount) {
      removeOnComplete = true;
      repeat.startDate = new Date(Date.now() + repeat.every);
    } else {
      repeat.limit = retryCount;
      repeat.count = 0;
      removeOnComplete = { age: retryPeriodInSecond * retryCount };
    }
    if (opts.delayInSecond !== undefined) {
      repeat.startDate = new Date(Date.now() + opts.delayInSecond * 1000);
    }
    return { repeat, removeOnComplete };
  }

  private static async addToQueue(
    queue: Queue,
    msg: any,
    opts?: QueueMsgOptions,
  ): Promise<void> {
    if (opts?.repeat) {
      const { repeat, removeOnComplete } =
        QueueService.buildRepeatTemplate(opts);
      await queue.upsertJobScheduler(opts.msgId, repeat, {
        name: opts.msgId,
        data: msg,
        opts: {
          removeOnComplete,
          removeOnFail: true,
          attempts: opts.attempts || 3,
        },
      });
      return;
    }

    if (opts?.cron) {
      if (!isValidCron(opts.cron, { seconds: true })) {
        throw new Error('Invalid cron format');
      }
      await queue.upsertJobScheduler(
        opts.msgId,
        { pattern: opts.cron },
        {
          name: opts.msgId,
          data: msg.data,
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
            attempts: opts.attempts || 3,
          },
        },
      );
      return;
    }

    const jobId = opts?.msgId || `random-msg-${generateRandomId(12)}`;
    await queue.add(opts?.msgId || 'random-msg', msg.data, {
      removeOnComplete: true,
      removeOnFail: true,
      delay: (opts?.delayInSecond || 0) * 1000,
      jobId,
      attempts: opts?.attempts || 1,
    });
  }

  private static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static async settleWithin(
    operation: Promise<unknown>,
    timeoutMs: number,
  ): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = operation.then(
      () => true,
      () => false,
    );
    const result = await Promise.race([
      settled,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return result;
  }
}
