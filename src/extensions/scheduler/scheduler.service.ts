import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job } from 'bullmq';
import { isValidCron } from 'cron-validator';
import { generateRandomId } from 'src/dddLib/utils/randomIdGenerator';
import { QueueService } from '../queue/queue.service';
import {
  IShutdownHandler,
  ShutdownOrchestratorService,
} from '../shutdown/shutdown.service';

export type SchedulerMsg = Job;

export interface SchedulerOptions {
  onExists?: 'error' | 'recreate' | 'skip';
  namespace?: string;
}

export interface SchedulerMetadata {
  readonly createdAt: number;
  readonly type: 'interval' | 'timeout' | 'cron';
  readonly config: string;
}

const SCHEDULER_ID_POSTFIX = '-schedulerId';
const MAX_SCHEDULERS_PER_INSTANCE = 1000;

@Injectable()
export class SchedulerService
  implements OnModuleInit, OnModuleDestroy, IShutdownHandler
{
  private readonly logger = new Logger(SchedulerService.name);
  private readonly managedSchedulers = new Map<string, SchedulerMetadata>();
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private schedulerQueue!: QueueService<string>;
  private isShutDown = false;

  static readonly schedulerQueueName = 'schedulerQueue';
  private static schedulerQueueInstance: QueueService<string> | null = null;

  constructor(private readonly queue: QueueService<string>) {}

  @Inject(ShutdownOrchestratorService)
  private readonly shutdownOrchestrator!: ShutdownOrchestratorService;

  async onModuleInit(): Promise<void> {
    SchedulerService.schedulerQueueInstance ??= this.queue.createQueue(
      SchedulerService.schedulerQueueName,
      async () => {},
    );
    this.schedulerQueue = SchedulerService.schedulerQueueInstance;
    this.shutdownOrchestrator.registerHandler('Scheduler', this);

    if (this.isDevelopment) await this.cleanupOrphanedSchedulers();
    this.logger.log(
      `[Scheduler] Service initialized in ${this.isDevelopment ? 'development' : 'production'} mode`,
    );
  }

  async shutdown(): Promise<void> {
    if (this.isShutDown) return;
    this.isShutDown = true;
    SchedulerService.schedulerQueueInstance = null;

    this.logger.log(
      `[Scheduler] Cleaning up ${this.managedSchedulers.size} scheduler(s)`,
    );
    const delayedJobs = await this.schedulerQueue.queue.getDelayed();
    await Promise.allSettled(delayedJobs.map((job) => job.remove()));
    await Promise.allSettled(
      [...this.managedSchedulers.keys()].map((id) =>
        this.removeScheduler(id, false),
      ),
    );
    this.managedSchedulers.clear();
    this.logger.log('[Scheduler] Shutdown complete');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShutDown || this.shutdownOrchestrator.isShuttingDown) return;
    await this.shutdown();
  }

  async setInterval(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    timeInSecond: number,
    intervalId?: string,
    options?: SchedulerOptions,
  ): Promise<string> {
    if (timeInSecond <= 0) throw new Error('Interval must be positive');
    this.assertCanCreate();

    const fullId = this.buildFullId(
      intervalId || generateRandomId(8),
      options?.namespace,
    );
    try {
      if (await this.handleExistingScheduler(fullId, options)) return fullId;
      this.registerSchedulerHandler(fullId, schedulerHandler);
      await this.schedulerQueue.addMsg({ data: fullId } as any, {
        repeat: { retryCount: 0, retryPeriodInSecond: timeInSecond },
        msgId: fullId,
      });
      this.track(fullId, 'interval', `${timeInSecond}s`);
      return fullId;
    } catch (err) {
      this.cleanupFailedCreation(fullId);
      this.logError(`Failed to create interval ${fullId}`, err);
      throw err;
    }
  }

  async setTimeout(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    timeInSecond: number,
    timeoutId?: string,
    options?: SchedulerOptions,
  ): Promise<string> {
    if (timeInSecond < 0) throw new Error('Timeout cannot be negative');
    this.assertCanCreate();

    const fullId = this.buildFullId(
      timeoutId || generateRandomId(8),
      options?.namespace,
    );
    try {
      if (await this.handleExistingScheduler(fullId, options)) return fullId;
      this.registerSchedulerHandler(fullId, schedulerHandler, true);
      await this.schedulerQueue.addMsg({ data: fullId } as any, {
        delayInSecond: timeInSecond,
        msgId: fullId,
      });
      this.track(fullId, 'timeout', `${timeInSecond}s`);
      return fullId;
    } catch (err) {
      this.cleanupFailedCreation(fullId);
      this.logError(`Failed to create timeout ${fullId}`, err);
      throw err;
    }
  }

  async setCron(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    cronFormat: string,
    schedulerId: string,
    options?: SchedulerOptions,
  ): Promise<string> {
    if (!isValidCron(cronFormat, { seconds: true })) {
      throw new Error(`Invalid cron format: ${cronFormat}`);
    }
    this.assertCanCreate();

    const fullId = this.buildFullId(schedulerId, options?.namespace);
    try {
      if (await this.handleExistingScheduler(fullId, options)) return fullId;
      this.registerSchedulerHandler(fullId, schedulerHandler);
      await this.schedulerQueue.addMsg({ data: fullId } as any, {
        cron: cronFormat,
        msgId: fullId,
      });
      this.track(fullId, 'cron', cronFormat);
      return fullId;
    } catch (err) {
      this.cleanupFailedCreation(fullId);
      this.logError(`Failed to create cron ${fullId}`, err);
      throw err;
    }
  }

  async remove(schedulerId: string): Promise<void> {
    const fullId = schedulerId.endsWith(SCHEDULER_ID_POSTFIX)
      ? schedulerId
      : `${schedulerId}${SCHEDULER_ID_POSTFIX}`;
    if (!this.managedSchedulers.has(fullId)) {
      this.logger.warn(`[Scheduler] Removing unmanaged scheduler ${fullId}`);
    }
    await this.removeScheduler(fullId);
  }

  async removeBatch(schedulerIds: string[]): Promise<{
    succeeded: string[];
    failed: Array<{ id: string; error: unknown }>;
  }> {
    const results = await Promise.allSettled(
      schedulerIds.map(async (id) => {
        await this.remove(id);
        return id;
      }),
    );
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: unknown }> = [];
    results.forEach((result, index) => {
      const id = schedulerIds[index];
      if (!id) return;
      if (result.status === 'fulfilled') succeeded.push(result.value);
      else failed.push({ id, error: result.reason });
    });
    return { succeeded, failed };
  }

  listManagedSchedulers(): Array<{
    id: string;
    metadata: SchedulerMetadata;
  }> {
    return [...this.managedSchedulers].map(([id, metadata]) => ({
      id,
      metadata,
    }));
  }

  async listAllSchedulers(): Promise<string[]> {
    const schedulers = await this.schedulerQueue.queue.getJobSchedulers();
    return schedulers.map((scheduler) => scheduler.key);
  }

  async getSchedulerHealth(): Promise<{
    managed: number;
    total: number;
    orphaned: number;
    byType: { interval: number; timeout: number; cron: number };
    oldestScheduler: number | null;
  }> {
    const schedulers = await this.schedulerQueue.queue.getJobSchedulers();
    const byType = { interval: 0, timeout: 0, cron: 0 };
    let oldestScheduler: number | null = null;
    for (const metadata of this.managedSchedulers.values()) {
      byType[metadata.type]++;
      if (oldestScheduler === null || metadata.createdAt < oldestScheduler) {
        oldestScheduler = metadata.createdAt;
      }
    }
    const orphaned = schedulers.filter(
      ({ key }) =>
        !QueueService.eventListeners.has(
          `${SchedulerService.schedulerQueueName}-${key}`,
        ),
    ).length;
    return {
      managed: this.managedSchedulers.size,
      total: schedulers.length,
      orphaned,
      byType,
      oldestScheduler,
    };
  }

  async exists(schedulerId: string): Promise<boolean> {
    const fullId = schedulerId.endsWith(SCHEDULER_ID_POSTFIX)
      ? schedulerId
      : `${schedulerId}${SCHEDULER_ID_POSTFIX}`;
    try {
      return (await this.schedulerQueue.getMsg(fullId)) !== undefined;
    } catch {
      return false;
    }
  }

  getSchedulerMetadata(schedulerId: string): SchedulerMetadata | undefined {
    const fullId = schedulerId.endsWith(SCHEDULER_ID_POSTFIX)
      ? schedulerId
      : `${schedulerId}${SCHEDULER_ID_POSTFIX}`;
    return this.managedSchedulers.get(fullId);
  }

  private assertCanCreate(): void {
    if (this.isShutDown) {
      throw new Error('Cannot create scheduler during shutdown');
    }
    if (this.managedSchedulers.size >= MAX_SCHEDULERS_PER_INSTANCE) {
      throw new Error(
        `Scheduler limit reached (${MAX_SCHEDULERS_PER_INSTANCE})`,
      );
    }
  }

  private buildFullId(baseId: string, namespace?: string): string {
    this.validateSchedulerId(baseId);
    if (namespace) this.validateSchedulerId(namespace);
    return `${namespace ? `${namespace}-` : ''}${baseId}${SCHEDULER_ID_POSTFIX}`;
  }

  private validateSchedulerId(schedulerId: string): void {
    if (!schedulerId?.trim()) throw new Error('Scheduler ID cannot be empty');
    if (schedulerId.includes(SCHEDULER_ID_POSTFIX)) {
      throw new Error(`Scheduler ID cannot contain '${SCHEDULER_ID_POSTFIX}'`);
    }
    if (schedulerId.length > 100) {
      throw new Error('Scheduler ID cannot exceed 100 characters');
    }
    if (!/^[a-zA-Z0-9_@.:-]+$/.test(schedulerId)) {
      throw new Error(
        `Scheduler ID contains invalid characters: ${schedulerId}`,
      );
    }
  }

  private async handleExistingScheduler(
    fullId: string,
    options?: SchedulerOptions,
  ): Promise<boolean> {
    if ((await this.schedulerQueue.getMsg(fullId)) === undefined) return false;
    const onExists =
      options?.onExists ?? (this.isDevelopment ? 'recreate' : 'error');
    if (onExists === 'skip') return true;
    if (onExists === 'recreate') {
      await this.removeScheduler(fullId);
      return false;
    }
    throw new Error(`Scheduler ${fullId} already exists`);
  }

  private registerSchedulerHandler(
    fullId: string,
    handler: (msg: SchedulerMsg) => Promise<void>,
    autoRemove = false,
  ): void {
    QueueService.addEventListener(
      SchedulerService.schedulerQueueName,
      async (msg: SchedulerMsg) => {
        if (msg.name !== fullId || this.isShutDown) return;
        try {
          await handler(msg);
          if (autoRemove) await this.remove(fullId);
        } catch (err) {
          this.logError(`Handler failed for ${fullId}`, err);
        }
      },
      fullId,
    );
  }

  private async removeScheduler(
    fullId: string,
    updateTracking = true,
  ): Promise<void> {
    this.schedulerQueue.removeEventListener(
      SchedulerService.schedulerQueueName,
      fullId,
    );
    const results = await Promise.allSettled([
      this.schedulerQueue.getAndDeleteMsg(fullId),
      this.schedulerQueue.deleteOneTimeMsg(fullId),
    ]);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        this.logger.debug(
          `[Scheduler] Cleanup failed for ${fullId}: ${this.errorMessage(result.reason)}`,
        );
      }
    });
    if (updateTracking) this.managedSchedulers.delete(fullId);
  }

  private track(
    fullId: string,
    type: SchedulerMetadata['type'],
    config: string,
  ): void {
    this.managedSchedulers.set(fullId, {
      createdAt: Date.now(),
      type,
      config,
    });
    this.logger.log(`[Scheduler] Created ${type} ${fullId} (${config})`);
  }

  private cleanupFailedCreation(fullId: string): void {
    this.schedulerQueue.removeEventListener(
      SchedulerService.schedulerQueueName,
      fullId,
    );
    this.managedSchedulers.delete(fullId);
  }

  private async cleanupOrphanedSchedulers(): Promise<void> {
    try {
      const schedulers = await this.schedulerQueue.queue.getJobSchedulers();
      const schedulerKeys = new Set(schedulers.map(({ key }) => key));
      const delayedJobs = await this.schedulerQueue.queue.getDelayed();
      await Promise.allSettled(
        delayedJobs
          .filter((job) => !schedulerKeys.has(job.name))
          .map((job) => job.remove()),
      );
      const orphaned = schedulers.filter(
        ({ key }) =>
          !QueueService.eventListeners.has(
            `${SchedulerService.schedulerQueueName}-${key}`,
          ),
      );
      await Promise.allSettled(
        orphaned.map(({ key }) =>
          this.schedulerQueue.queue.removeJobScheduler(key),
        ),
      );
    } catch (err) {
      this.logError('Failed to clean orphaned schedulers', err);
    }
  }

  private logError(message: string, err: unknown): void {
    this.logger.error(
      `[Scheduler] ${message}: ${this.errorMessage(err)}`,
      err instanceof Error ? err.stack : undefined,
    );
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
