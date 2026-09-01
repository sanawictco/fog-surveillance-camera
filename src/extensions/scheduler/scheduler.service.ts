import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService } from '../queue/queue.service';
import { isValidCron } from 'cron-validator';
import { ShutdownOrchestratorService } from '../shutdown/shutdown.service';
import { generateRandomId } from 'src/dddLib/utils/randomIdGenerator';

export type SchedulerMsg = Job;
const SCHEDULER_ID_POSTFIX = '-schedulerId';
const MAX_SCHEDULERS_PER_INSTANCE = 1000; // Safety limit

export interface SchedulerOptions {
  /**
   * Behavior when scheduler already exists:
   * - 'error': Throw error (safest for production)
   * - 'recreate': Remove and recreate (useful for deployments)
   * - 'skip': Skip creation silently (idempotent)
   *
   * Default: 'error' in production, 'recreate' in development
   */
  onExists?: 'error' | 'recreate' | 'skip';

  /**
   * Custom namespace for the scheduler (optional)
   * Useful for multi-tenant systems or isolating scheduler groups
   */
  namespace?: string;
}

interface SchedulerMetadata {
  createdAt: number;
  type: 'interval' | 'timeout' | 'cron';
  config: string; // Store interval time or cron pattern for debugging
}

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private schedulerQueue!: QueueService<string>;
  static readonly schedulerQueueName = 'schedulerQueue';
  private static _schedulerQueue: QueueService<string> | null = null;

  // Track schedulers with metadata for better management
  private readonly managedSchedulers: Map<string, SchedulerMetadata> =
    new Map();
  private readonly isDevelopment: boolean;
  private _isShutDown = false;
  @Inject(ShutdownOrchestratorService)
  private readonly shutdownOrchestrator!: ShutdownOrchestratorService;
  constructor(private readonly queue: QueueService<string>) {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  async onModuleInit() {
    SchedulerService._schedulerQueue ??= this.queue.createQueue(
      SchedulerService.schedulerQueueName,
      async () => {},
    );
    this.schedulerQueue = SchedulerService._schedulerQueue;
    this.shutdownOrchestrator.registerHandler('Scheduler', this);
    const mode = this.isDevelopment ? 'development' : 'production';
    this.logger.log(`[Scheduler] Service initialized in ${mode} mode`);
    // In development, clean up orphaned schedulers from crashed instances
    if (this.isDevelopment) {
      await this.cleanupOrphanedSchedulers();
    }
  }

  async shutdown() {
    if (this._isShutDown) return;
    this._isShutDown = true;
    SchedulerService._schedulerQueue = null;
    this.logger.log(
      `[Scheduler] Shutting down, cleaning up ${this.managedSchedulers.size} scheduler(s)`,
    );

    // Remove all delayed job INSTANCES, not just definitions
    const delayedJobs = await this.schedulerQueue.queue.getDelayed();
    await Promise.allSettled(
      delayedJobs.map((job) => job.remove().catch(() => {})),
    );
    // Clean up all schedulers managed by this instance in parallel
    const cleanupPromises = Array.from(this.managedSchedulers.keys()).map(
      async (fullId) => {
        try {
          await this._removeScheduler(fullId, false);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `[Scheduler] Failed to cleanup ${fullId}: ${err.message}`,
            err.stack,
          );
        }
      },
    );

    await Promise.allSettled(cleanupPromises);
    this.managedSchedulers.clear();
    this.logger.log('[Scheduler] Shutdown complete');
  }

  async onModuleDestroy(): Promise<void> {
    if (this._isShutDown) return;
    if (this.shutdownOrchestrator.isShuttingDown) return; // <- add this
    await this.shutdown();
  }

  /**
   * Clean up schedulers that don't have active listeners
   * (likely from crashed previous instances)
   */
  private async cleanupOrphanedSchedulers(): Promise<void> {
    try {
      // Single fetch of scheduler definitions, reused for both the stale-delayed
      // sweep and the orphaned-definition sweep below (S15: this was fetched
      // twice). Removing delayed job *instances* doesn't change the scheduler
      // *definitions*, so the one snapshot is valid for both passes.
      const schedulers = await this.schedulerQueue.queue.getJobSchedulers();
      const schedulerNames = schedulers.map((s) => s.key);

      const delayedJobs = await this.schedulerQueue.queue.getDelayed();
      for (const job of delayedJobs) {
        // If no scheduler definition exists for this job, remove the stale instance
        if (!schedulerNames.includes(job.name)) {
          await job.remove().catch(() => {});
          this.logger.log(`[Scheduler] Removed stale delayed job: ${job.name}`);
        }
      }
      // Orphaned definition cleanup (reuses the snapshot fetched above).
      const activeListeners = QueueService.eventListeners;

      const orphanedSchedulers = schedulers.filter((scheduler) => {
        const listenerKey = `${SchedulerService.schedulerQueueName}-${scheduler.key}`;
        return !activeListeners.has(listenerKey);
      });

      if (orphanedSchedulers.length === 0) {
        return;
      }

      this.logger.log(
        `[Scheduler] Found ${orphanedSchedulers.length} orphaned scheduler(s), cleaning up...`,
      );

      // Parallel cleanup with individual error handling
      const cleanupPromises = orphanedSchedulers.map(async (scheduler) => {
        try {
          await this.schedulerQueue.queue.removeJobScheduler(scheduler.key);
          return { success: true, key: scheduler.key };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `[Scheduler] Failed to cleanup ${scheduler.key}: ${err.message}`,
            err.stack,
          );
          return { success: false, key: scheduler.key, error };
        }
      });

      const results = await Promise.allSettled(cleanupPromises);
      const cleaned = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;

      this.logger.log(
        `[Scheduler] Successfully cleaned up ${cleaned}/${orphanedSchedulers.length} orphaned scheduler(s)`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to cleanup orphaned schedulers: ${err.message}`,
        err.stack,
      );
      // Don't throw - startup should continue even if cleanup fails
    }
  }

  /**
   * Validate scheduler ID format
   */
  private validateSchedulerId(schedulerId: string, strict = true): void {
    if (!schedulerId || schedulerId.trim().length === 0) {
      throw new Error('Scheduler ID cannot be empty');
    }

    if (schedulerId.includes(SCHEDULER_ID_POSTFIX)) {
      throw new Error(`Scheduler ID cannot contain '${SCHEDULER_ID_POSTFIX}'`);
    }

    if (schedulerId.length > 100) {
      throw new Error('Scheduler ID cannot exceed 100 characters');
    }

    // Strict validation for new schedulers (can be disabled for backward
    // compatibility). Allowed = alphanumerics plus the separators callers
    // actually use and that are safe Redis/BullMQ key segments: '_', '@'
    // (rule ids, e.g. @R@xxxxxxxx), '-' (postfix / composite ids), and '.'/':'
    // (common namespacing). Removal is intentionally NOT charset-gated, so an
    // already-created scheduler can always be cleaned up regardless of format.
    if (strict && !/^[a-zA-Z0-9_@.:-]+$/.test(schedulerId)) {
      throw new Error(
        `Scheduler ID contains invalid characters: "${schedulerId}". ` +
          'Allowed: letters, digits, and _ @ . : -',
      );
    }
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): void {
    if (this.managedSchedulers.size >= MAX_SCHEDULERS_PER_INSTANCE) {
      throw new Error(
        `Scheduler limit reached (${MAX_SCHEDULERS_PER_INSTANCE}). ` +
          `Remove unused schedulers before creating new ones.`,
      );
    }
  }

  /**
   * Determine default behavior based on environment
   */
  private getDefaultOnExists(): 'error' | 'recreate' | 'skip' {
    return this.isDevelopment ? 'recreate' : 'error';
  }

  /**
   * Handle existing schedulers based on options
   * Returns true if creation should be skipped
   */
  private async handleExistingScheduler(
    fullId: string,
    options?: SchedulerOptions,
  ): Promise<boolean> {
    const existing = await this.schedulerQueue.getMsg(fullId);

    if (!existing) {
      return false; // Scheduler doesn't exist, proceed with creation
    }

    const onExists = options?.onExists || this.getDefaultOnExists();

    switch (onExists) {
      case 'skip':
        this.logger.log(
          `[Scheduler] Scheduler ${fullId} already exists, skipping creation`,
        );
        return true; // Skip creation

      case 'recreate':
        this.logger.log(`[Scheduler] Recreating existing scheduler ${fullId}`);
        try {
          const schedulerName = SchedulerService.schedulerQueueName;

          // Remove listener first to prevent any race conditions
          this.schedulerQueue.removeEventListener(schedulerName, fullId);

          // Attempt all cleanup operations, don't fail if some don't exist
          const cleanupResults = await Promise.allSettled([
            this.schedulerQueue.getAndDeleteMsg(fullId),
            this.schedulerQueue.deleteOneTimeMsg(fullId),
          ]);

          // Log any cleanup failures for debugging
          cleanupResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              const operation =
                index === 0 ? 'getAndDeleteMsg' : 'deleteOneTimeMsg';
              const reason =
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason);
              this.logger.debug(
                `[Scheduler] ${operation} failed for ${fullId}: ${reason}`,
              );
            }
          });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `[Scheduler] Error during recreate cleanup for ${fullId}: ${err.message}`,
            err.stack,
          );
          // Continue anyway - we've done our best to clean up
        }
        return false; // Proceed with creation

      case 'error':
      default:
        throw new Error(
          `Scheduler ${fullId} already exists. ` +
            `Options: (1) Use different schedulerId, (2) Set onExists: 'recreate' to override, ` +
            `(3) Set onExists: 'skip' for idempotent behavior, (4) Call remove() first.`,
        );
    }
  }

  /**
   * Build full scheduler ID with optional namespace
   */
  private buildFullId(
    baseId: string,
    namespace?: string,
    strictValidation = true,
  ): string {
    this.validateSchedulerId(baseId, strictValidation);

    if (namespace) {
      this.validateSchedulerId(namespace, strictValidation);
    }

    const prefix = namespace || '';
    const separator = prefix ? '-' : '';
    return `${prefix}${separator}${baseId}${SCHEDULER_ID_POSTFIX}`;
  }

  /**
   * Register event listener with error handling wrapper
   */
  private registerSchedulerHandler(
    fullId: string,
    handler: (msg: SchedulerMsg) => Promise<void>,
    autoRemove = false,
  ): void {
    const schedulerName = SchedulerService.schedulerQueueName;

    const wrappedHandler = async (schedulerMsg: SchedulerMsg) => {
      if (schedulerMsg.name !== fullId) return;

      // Don't process if shutting down
      if (this._isShutDown) {
        this.logger.log(
          `[Scheduler] Skipping ${fullId} - service is shutting down`,
        );
        return;
      }

      try {
        await handler(schedulerMsg);

        // Auto-remove for setTimeout - use fullId directly
        if (autoRemove) {
          await this.remove(fullId);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `[Scheduler] Handler error for ${fullId}: ${err.message}`,
          err.stack,
        );
      }
    };

    this.schedulerQueue.addEventListener(schedulerName, wrappedHandler, fullId);
  }

  async setInterval(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    timeInMiliSecond: number,
    intervalId?: string,
    options?: SchedulerOptions,
  ): Promise<string> {
    if (timeInMiliSecond < 0) {
      throw new Error('Time cannot be negative');
    }

    // BullMQ scheduling is second-granular, so the Math.ceil(ms/1000) below
    // rounds any sub-second interval UP to 1s. Warn in every environment (the
    // rounding happens everywhere, not just prod) so the precision loss - the
    // actual problem, not "performance" - is never silent.
    if (timeInMiliSecond > 0 && timeInMiliSecond < 1000) {
      this.logger.warn(
        `[Scheduler] interval ${timeInMiliSecond}ms is below the 1s scheduling ` +
          'granularity and will be rounded up to 1000ms',
      );
    }

    if (this._isShutDown) {
      throw new Error('Cannot create scheduler during shutdown');
    }

    this.checkRateLimit();

    const baseId = intervalId || generateRandomId(8);
    const fullId = this.buildFullId(baseId, options?.namespace);

    try {
      // Check if we should skip creation
      const shouldSkip = await this.handleExistingScheduler(fullId, options);
      if (shouldSkip) {
        return fullId;
      }

      // Register handler first (cheaper operation)
      this.registerSchedulerHandler(fullId, schedulerHandler, false);

      // Create job (this is the critical operation that could fail)
      await this.schedulerQueue.addMsg(
        { data: fullId },
        {
          repeat: {
            retryCount: 0,
            retryPeriodInSecond: Math.ceil(timeInMiliSecond / 1000),
          },
          msgId: fullId,
        },
      );

      // Track this scheduler with metadata (only after successful creation)
      this.managedSchedulers.set(fullId, {
        createdAt: Date.now(),
        type: 'interval',
        config: `${timeInMiliSecond}ms`,
      });

      this.logger.log(
        `[Scheduler] Created interval ${fullId} (${timeInMiliSecond}ms)`,
      );
      return fullId;
    } catch (error) {
      // Cleanup on failure - remove listener if job creation failed
      const schedulerName = SchedulerService.schedulerQueueName;
      this.schedulerQueue.removeEventListener(schedulerName, fullId);
      this.managedSchedulers.delete(fullId);

      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to create interval ${fullId}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async setTimeout(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    timeInMiliSecond: number,
    timeoutId?: string,
    options?: SchedulerOptions,
  ): Promise<string> {
    if (timeInMiliSecond < 0) {
      throw new Error('Time cannot be negative');
    }

    if (this._isShutDown) {
      throw new Error('Cannot create scheduler during shutdown');
    }

    this.checkRateLimit();

    const baseId = timeoutId || generateRandomId(8);
    const fullId = this.buildFullId(baseId, options?.namespace);

    try {
      // Check if we should skip creation
      const shouldSkip = await this.handleExistingScheduler(fullId, options);
      if (shouldSkip) {
        return fullId;
      }

      // Register handler with auto-remove
      this.registerSchedulerHandler(fullId, schedulerHandler, true);

      // Create job
      await this.schedulerQueue.addMsg(
        { data: fullId },
        {
          delayInSecond: Math.ceil(timeInMiliSecond / 1000),
          msgId: fullId,
        },
      );

      // Track this scheduler with metadata
      this.managedSchedulers.set(fullId, {
        createdAt: Date.now(),
        type: 'timeout',
        config: `${timeInMiliSecond}ms`,
      });

      this.logger.log(
        `[Scheduler] Created setTimeout ${fullId} (${timeInMiliSecond}ms)`,
      );
      return fullId;
    } catch (error) {
      // Cleanup on failure
      const schedulerName = SchedulerService.schedulerQueueName;
      this.schedulerQueue.removeEventListener(schedulerName, fullId);
      this.managedSchedulers.delete(fullId);

      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to create timeout ${fullId}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  async setCron(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    cronFormat: string,
    schedulerId: string,
    options?: SchedulerOptions,
  ): Promise<string> {
    if (!isValidCron(cronFormat, { seconds: true })) {
      throw new Error(`cronFormat is not valid =>  ${cronFormat}`);
    }

    if (this._isShutDown) {
      throw new Error('Cannot create scheduler during shutdown');
    }

    this.checkRateLimit();

    const fullId = this.buildFullId(schedulerId, options?.namespace);

    try {
      // Check if we should skip creation
      const shouldSkip = await this.handleExistingScheduler(fullId, options);
      if (shouldSkip) {
        return fullId;
      }

      // Register handler
      this.registerSchedulerHandler(fullId, schedulerHandler, false);

      // Create job
      await this.schedulerQueue.addMsg(
        { data: fullId },
        {
          cron: cronFormat,
          msgId: fullId,
        },
      );

      // Track this scheduler with metadata
      this.managedSchedulers.set(fullId, {
        createdAt: Date.now(),
        type: 'cron',
        config: cronFormat,
      });

      this.logger.log(`[Scheduler] Created cron ${fullId} (${cronFormat})`);
      return fullId;
    } catch (error) {
      // Cleanup on failure
      const schedulerName = SchedulerService.schedulerQueueName;
      this.schedulerQueue.removeEventListener(schedulerName, fullId);
      this.managedSchedulers.delete(fullId);

      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to create cron ${fullId}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Internal method to remove scheduler
   * @param updateTracking - Whether to update managedSchedulers map
   */
  private async _removeScheduler(
    fullId: string,
    updateTracking = true,
  ): Promise<void> {
    const schedulerName = SchedulerService.schedulerQueueName;

    // Remove listener first (prevent any new executions)
    this.schedulerQueue.removeEventListener(schedulerName, fullId);

    // Parallel cleanup operations with individual error handling
    const cleanupResults = await Promise.allSettled([
      this.schedulerQueue.getAndDeleteMsg(fullId),
      this.schedulerQueue.deleteOneTimeMsg(fullId),
    ]);

    // Log failures for debugging but don't throw
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const operation = index === 0 ? 'getAndDeleteMsg' : 'deleteOneTimeMsg';
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        this.logger.debug(
          `[Scheduler] ${operation} failed for ${fullId}: ${reason}`,
        );
      }
    });

    if (updateTracking) {
      this.managedSchedulers.delete(fullId);
    }
  }

  async remove(schedulerId: string): Promise<void> {
    // Handle both formats: with or without SCHEDULER_ID_POSTFIX
    const fullId = schedulerId.endsWith(SCHEDULER_ID_POSTFIX)
      ? schedulerId
      : schedulerId + SCHEDULER_ID_POSTFIX;

    if (!this.managedSchedulers.has(fullId)) {
      this.logger.warn(
        `[Scheduler] Attempted to remove unmanaged scheduler: ${fullId}`,
      );
      // Still attempt removal in case it exists in Redis
    }

    try {
      // Don't validate on removal - allow removing legacy schedulers with any ID format
      await this._removeScheduler(fullId, true);
      this.logger.log(`[Scheduler] Removed scheduler ${fullId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to remove scheduler ${fullId}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Remove multiple schedulers in parallel
   */
  async removeBatch(schedulerIds: string[]): Promise<{
    succeeded: string[];
    failed: { id: string; error: any }[];
  }> {
    const results = await Promise.allSettled(
      schedulerIds.map(async (id) => {
        await this.remove(id);
        return id;
      }),
    );

    const succeeded: string[] = [];
    const failed: { id: string; error: any }[] = [];

    results.forEach((result, index) => {
      const schedulerId = schedulerIds[index];
      if (!schedulerId) return; // Skip if undefined (shouldn't happen)

      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else {
        failed.push({ id: schedulerId, error: result.reason });
      }
    });

    return { succeeded, failed };
  }

  /**
   * List schedulers managed by this instance with metadata
   */
  listManagedSchedulers(): Array<{ id: string; metadata: SchedulerMetadata }> {
    return Array.from(this.managedSchedulers.entries()).map(
      ([id, metadata]) => ({
        id,
        metadata,
      }),
    );
  }

  /**
   * List all schedulers across all instances
   */
  async listAllSchedulers(): Promise<string[]> {
    try {
      const schedulers = await this.schedulerQueue.queue.getJobSchedulers();
      return schedulers.map((s) => s.key);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to list all schedulers: ${err.message}`,
        err.stack,
      );
      throw new Error(`Failed to list schedulers: ${err.message}`);
    }
  }

  /**
   * Get detailed health information about schedulers
   */
  async getSchedulerHealth(): Promise<{
    managed: number;
    total: number;
    orphaned: number;
    byType: { interval: number; timeout: number; cron: number };
    oldestScheduler: number | null;
  }> {
    try {
      const allSchedulers = await this.schedulerQueue.queue.getJobSchedulers();
      const activeListeners = QueueService.eventListeners;

      const orphanedCount = allSchedulers.filter((scheduler) => {
        const listenerKey = `${SchedulerService.schedulerQueueName}-${scheduler.key}`;
        return !activeListeners.has(listenerKey);
      }).length;

      // Calculate type distribution and oldest scheduler
      const byType = { interval: 0, timeout: 0, cron: 0 };
      let oldestTimestamp: number | null = null;

      for (const [_, metadata] of this.managedSchedulers) {
        byType[metadata.type]++;
        if (oldestTimestamp === null || metadata.createdAt < oldestTimestamp) {
          oldestTimestamp = metadata.createdAt;
        }
      }

      return {
        managed: this.managedSchedulers.size,
        total: allSchedulers.length,
        orphaned: orphanedCount,
        byType,
        oldestScheduler: oldestTimestamp,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[Scheduler] Failed to get health info: ${err.message}`,
        err.stack,
      );
      throw new Error(`Failed to get scheduler health: ${err.message}`);
    }
  }

  /**
   * Check if a specific scheduler exists
   */
  async exists(schedulerId: string): Promise<boolean> {
    const fullId = schedulerId.endsWith(SCHEDULER_ID_POSTFIX)
      ? schedulerId
      : schedulerId + SCHEDULER_ID_POSTFIX;

    try {
      const msg = await this.schedulerQueue.getMsg(fullId);
      return msg !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get metadata for a managed scheduler
   */
  getSchedulerMetadata(schedulerId: string): SchedulerMetadata | undefined {
    const fullId = schedulerId.endsWith(SCHEDULER_ID_POSTFIX)
      ? schedulerId
      : schedulerId + SCHEDULER_ID_POSTFIX;

    return this.managedSchedulers.get(fullId);
  }
}
