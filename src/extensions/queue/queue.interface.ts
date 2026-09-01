import { Job, RepeatOptions, WorkerOptions } from 'bullmq';

export type QueueMsg = Job & {
  opts: Job['opts'] & { repeat?: RepeatOptions };
};

/**
 * Per-queue BullMQ worker tuning. Optional on createQueue; any field omitted
 * falls back to the rule-engine's sanctioned defaults (concurrency 1000,
 * lockDuration 60s, lockRenewTime 20s, stalledInterval 15s). Provide this only
 * for auxiliary queues (e.g. systemLog/actorLog) that don't need rule-engine
 * sizing - never override these for the rule-engine queue itself.
 */
export type QueueWorkerOverrides = Partial<
  Pick<
    WorkerOptions,
    'concurrency' | 'lockDuration' | 'lockRenewTime' | 'stalledInterval'
  >
>;

export interface RepeatQueueMsgOptions {
  readonly retryCount?: number;
  readonly retryPeriodInSecond: number;
}
export interface QueueMsgOptions {
  readonly repeat?: RepeatQueueMsgOptions;
  cron?: string;
  delayInSecond?: number;
  readonly msgId: string;
  readonly attempts?: number;
}

export interface IQueue<T> {
  createQueue(
    queueName: string,
    workerMsgHandler: (msg: QueueMsg) => Promise<void>,
    expiredMsgHandler?: (msg: QueueMsg) => Promise<void>,
    // the failure handler receives the error too (matching QueueService and
    // BullMQ's own 'failed' event). The interface previously declared a
    // one-arg handler, so a two-arg implementation did not type-check here.
    failureMsgHandler?: (msg: QueueMsg, err: Error) => Promise<void>,
    workerOptions?: QueueWorkerOverrides,
  ): IQueue<T>;
  /**
   * Add a job to the queue.
   *
   * Payload-envelope contract (worker handler reads `job.data`):
   * - **non-repeat** (default) and **cron** (`opts.cron`): caller MUST wrap as
   *   `{ data: T }`. The worker receives the inner `T`.
   * - **repeat** (`opts.repeat`): caller passes `T` directly (no wrap). The
   *   worker receives the whole `T`.
   *
   * This split is historical (deviceData repeat-flow vs. ruleEngine/eventBus
   * non-repeat-flow). Keep it consistent on a given queue.
   */
  addMsg(msg: T, opts: QueueMsgOptions): Promise<void>;
  getMsg(msgId: string): Promise<T | undefined>;
  getAndDeleteMsg(msgId: string): Promise<T | undefined>;
  addEventListener(
    queueName: string,
    eventHandler: (msg: QueueMsg) => Promise<void>,
    eventId: string,
  ): Promise<void>;
  removeEventListener(queueName: string, eventId: string): void;
}
