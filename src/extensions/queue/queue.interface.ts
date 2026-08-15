import { Job, WorkerOptions } from 'bullmq';

export type QueueMsg = Job;

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
  readonly cron?: string;
  readonly delayInSecond?: number;
  readonly msgId: string;
  readonly attempts?: number;
}

export interface IQueue<T> {
  createQueue(
    queueName: string,
    workerMsgHandler: (msg: QueueMsg) => Promise<void>,
    expiredMsgHandler?: (msg: QueueMsg) => Promise<void>,
    failureMsgHandler?: (msg: QueueMsg, err: Error) => Promise<void>,
    workerOptions?: QueueWorkerOverrides,
  ): IQueue<T>;
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
