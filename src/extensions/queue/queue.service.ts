import { Queue, Worker } from 'bullmq';
import { IQueue, QueueMsg, QueueMsgOptions } from './queue.interface';
import Redis from 'ioredis';
import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { isValidCron } from 'cron-validator';
@Injectable()
export class QueueService<T> implements IQueue<T>, OnApplicationBootstrap {
  public queueName: string;
  public queue: Queue;
  static workers: Map<string, Worker> = new Map();
  static eventListeners: Map<string, (msg: QueueMsg) => Promise<void>> =
    new Map();
  static connection: Redis;
  static initialize = false;
  constructor() {
    if (!QueueService.initialize) {
      QueueService.connection = new Redis({
        host: AppConfig().redis.host,
        port: AppConfig().redis.port,
        maxRetriesPerRequest: null,
      });
      QueueService.initialize = true;
    }
  }

  async onApplicationBootstrap() {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        QueueService.connection.flushall((err, res) => {
          if (err) {
            return reject(err);
          }
          resolve(res as string | PromiseLike<string>);
        });
      });
      console.log('All Queues data removed:', result);
    } catch (err) {
      console.error('Error flushing Queues data:', err);
    }
  }
  createQueue(
    queueName: string,
    workerMsgHandler: (msg: QueueMsg) => Promise<void>,
    expiredMsgHandler?: (msg: QueueMsg) => Promise<void>,
    failureMsgHandler?: (msg: QueueMsg, err: Error) => Promise<void>,
  ): QueueService<T> {
    this.queueName = queueName;
    this.queue = new Queue(queueName, {
      connection: QueueService.connection,
    });
    this.queue.on('error', (err) => console.log('queue error: ', err));
    const worker = new Worker(queueName, workerMsgHandler, {
      connection: QueueService.connection,
      concurrency: 1000,
    });
    worker.on('error', (err) => console.log('worker error: ', err));
    QueueService.workers.set(this.queueName, worker);

    if (expiredMsgHandler)
      worker.on('completed', async (msg: QueueMsg) => {
        if (msg.opts.repeat && msg.opts.repeat.limit == msg.opts.repeat.count) {
          await this.getAndDeleteMsg(msg.name);
          await expiredMsgHandler(msg);
        }
      });
    if (failureMsgHandler)
      worker.on('failed', async (msg: QueueMsg, err: Error) => {
        await failureMsgHandler(msg, err);
      });

    return this;
  }

  async addMsg(msg: any, opts?: QueueMsgOptions): Promise<void> {
    if (!this.queue) throw new Error('dont exist queue');
    if (opts?.repeat) {
      const msgId = opts.msgId;
      const repeat: any = {
        every: opts.repeat.retryPeriodInSecond * 1000,
        limit: opts.repeat.retryCount,
        count: 0,
      };
      let removeOnComplete: any = {
        age: repeat.every * (repeat.limit || 1),
      };
      if (!opts.repeat.retryCount) {
        // this condition only used for setInterval schedulerService
        delete repeat.limit;
        delete repeat.count;
        removeOnComplete = true;
        repeat.startDate = new Date(Date.now() + repeat.every);
      }
      if (opts.delayInSecond !== undefined)
        repeat.startDate = new Date(Date.now() + opts.delayInSecond * 1000);
      await this.queue.upsertJobScheduler(msgId, repeat, {
        name: msgId,
        data: msg,
        opts: {
          removeOnComplete,
          removeOnFail: true,
        },
      });
    } else if (opts?.cron) {
      const msgId = opts.msgId;
      if (!isValidCron(opts.cron, { seconds: true }))
        throw new Error('cron format is not valid');
      await this.queue.upsertJobScheduler(
        msgId,
        { pattern: opts.cron },
        {
          name: msgId,
          data: msg,
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
    } else {
      await this.queue.add(opts?.msgId || 'random-msg', msg.data, {
        removeOnComplete: true,
        removeOnFail: true,
        delay: (opts?.delayInSecond || 0) * 1000,
        jobId: opts?.msgId || 'random-msg',
      });
    }
  }

  static async addMsg(
    queueName: string,
    msg: any,
    opts?: QueueMsgOptions,
  ): Promise<void> {
    if (!QueueService.isQueueExists(queueName))
      throw new Error('dont exist queue');
    const queue = new Queue(queueName, { connection: QueueService.connection });
    if (opts?.repeat) {
      const msgId = opts.msgId;
      const repeat: any = {
        every: opts.repeat.retryPeriodInSecond * 1000,
        limit: opts.repeat.retryCount,
        count: 0,
      };
      let removeOnComplete: any = {
        age: repeat.every * (repeat.limit || 1),
      };
      if (!opts.repeat.retryCount) {
        // this condition only used for setInterval schedulerService
        delete repeat.limit;
        delete repeat.count;
        removeOnComplete = true;
        repeat.startDate = new Date(Date.now() + repeat.every);
      }
      if (opts.delayInSecond !== undefined)
        repeat.startDate = new Date(Date.now() + opts.delayInSecond * 1000);
      await queue.upsertJobScheduler(msgId, repeat, {
        name: msgId,
        data: msg,
        opts: {
          removeOnComplete,
          removeOnFail: true,
        },
      });
    } else if (opts?.cron) {
      const msgId = opts.msgId;
      if (!isValidCron(opts.cron, { seconds: true }))
        throw new Error('cron format is not valid');
      await queue.upsertJobScheduler(
        msgId,
        { pattern: opts.cron },
        {
          name: msgId,
          data: msg,
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
    } else {
      await queue.add(opts?.msgId || 'random-msg', msg.data, {
        removeOnComplete: true,
        removeOnFail: true,
        delay: (opts?.delayInSecond || 0) * 1000,
        jobId: opts?.msgId || 'random-msg',
      });
    }
  }

  async getMsg(msgId: string): Promise<T | undefined> {
    const msg = await this.queue.getJobScheduler(`${msgId}`);
    if (msg?.template?.data) return msg.template.data as T | undefined;
  }

  async getAndDeleteMsg(msgId: string): Promise<T | undefined> {
    if (!this.queue) throw new Error("queue doesn't exist");
    const msg = await this.getMsg(msgId);
    if (msg) {
      await this.queue.removeJobScheduler(msgId);
      return msg;
    }
  }

  async deleteOneTimeMsg(queueName: string, msgId: string): Promise<boolean> {
    if (!QueueService.isQueueExists(queueName))
      throw new Error('dont exist queue');
    const queue = new Queue(queueName, { connection: QueueService.connection });
    const msg = await queue.getJob(`${msgId}`);
    if (msg) {
      await msg?.remove();
      return true;
    }
    return false;
  }

  static async deleteQueue(queueName: string): Promise<void> {
    //delete the queue worker
    const worker = QueueService.workers.get(queueName);
    await worker?.close();
    await worker?.disconnect();
    QueueService.workers.delete(queueName);
    //clean all jobs in the queue delete the queue
    const queue = new Queue(queueName);
    await queue.removeAllListeners();
    await queue.drain();
    await queue.clean(0, 0, 'completed');
    await queue.clean(0, 0, 'paused');
    await queue.clean(0, 0, 'failed');
    await queue.clean(0, 0, 'delayed');
    await queue.clean(0, 0, 'wait');
    await queue.clean(0, 0, 'active');
    await queue.clean(0, 0, 'prioritized');
    await queue.obliterate({ force: true });
    await queue.disconnect();
    console.log(queueName, ' queue removed ...');
  }

  async addEventListener(
    queueName: string,
    eventHandler: (msg: QueueMsg) => Promise<void>,
    eventId: string,
  ) {
    const queueWorker = QueueService.workers.get(queueName);
    queueWorker?.on('completed', eventHandler);
    QueueService.eventListeners.set(`${queueName}-${eventId}`, eventHandler);
  }

  static addEventListener(
    queueName: string,
    eventHandler: (msg: QueueMsg) => Promise<void>,
    eventId: string,
  ) {
    const queueWorker = QueueService.workers.get(queueName);
    queueWorker?.on('completed', eventHandler);
    QueueService.eventListeners.set(`${queueName}-${eventId}`, eventHandler);
  }

  removeEventListener(queueName: string, eventId: string) {
    const queueWorker = QueueService.workers.get(queueName);
    const eventHandler = QueueService.eventListeners.get(
      `${queueName}-${eventId}`,
    );
    if (queueWorker && eventHandler) queueWorker.off('completed', eventHandler);
    QueueService.eventListeners.delete(`${queueName}-${eventId}`);
  }

  static removeEventListener(queueName: string, eventId: string) {
    const queueWorker = QueueService.workers.get(queueName);
    const eventHandler = QueueService.eventListeners.get(
      `${queueName}-${eventId}`,
    );
    if (queueWorker && eventHandler)
      queueWorker?.off('completed', eventHandler);
    QueueService.eventListeners.delete(`${queueName}-${eventId}`);
  }

  static async isQueueExists(queueName: string): Promise<boolean> {
    return (await QueueService.connection.exists(`bull:${queueName}:events`))
      ? true
      : false;
  }
}
