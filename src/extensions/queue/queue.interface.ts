import { Job } from 'bullmq';

export type QueueMsg = Job;
export class RepeatQueueMsgOptions {
  retryCount: number;
  retryPeriodInSecond: number;
}
export class QueueMsgOptions {
  repeat?: RepeatQueueMsgOptions;
  cron?: string;
  delayInSecond?: number;
  msgId: string;
}

export interface IQueue<T> {
  createQueue(
    queueName: string,
    workerMsgHandler: (msg: QueueMsg) => Promise<void>,
    expiredMsgHandler?: (msg: QueueMsg) => Promise<void>,
    failureMsgHandler?: (msg: QueueMsg) => Promise<void>,
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
