import { Injectable } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { generateRandomId } from 'src/dddLib/utils/randomIdGenerator';
import { Job } from 'bullmq';
export type SchedulerMsg = Job;
const SCHEDULER_ID_POSTFIX = '-schedulerId';
@Injectable()
export class SchedulerService {
  private schedulerQueue: QueueService<string>;
  static schedulerQueueName = 'schedulerQueue';
  static initialize = false;
  constructor(private readonly queue: QueueService<string>) {
    if (!SchedulerService.initialize) {
      setTimeout(async () => {
        SchedulerService.initialize = true;
        const schedulerQueue = this.queue.createQueue(
          SchedulerService.schedulerQueueName,
          async () => {},
        );
        this.schedulerQueue = schedulerQueue;
      }, 0);
    }
  }

  setInterval(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    timeInSecond: number,
    intervalId?: string,
  ): string {
    const schedulerName = SchedulerService.schedulerQueueName;
    intervalId = (intervalId || generateRandomId(5)) + SCHEDULER_ID_POSTFIX;
    this.schedulerQueue.addEventListener(
      schedulerName,
      async (schedulerMsg: SchedulerMsg) => {
        if (schedulerMsg.name === intervalId)
          await schedulerHandler(schedulerMsg);
      },
      intervalId,
    );
    setTimeout(async () => {
      await this.schedulerQueue.addMsg(intervalId, {
        repeat: {
          retryCount: 0,
          retryPeriodInSecond: timeInSecond,
        },
        msgId: intervalId,
      });
    }, 0);
    return intervalId;
  }

  setTimeout(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    timeInSecond: number,
    timeoutId?: string,
  ): string {
    const schedulerName = SchedulerService.schedulerQueueName;
    timeoutId = (timeoutId || generateRandomId(5)) + SCHEDULER_ID_POSTFIX;
    this.schedulerQueue.addEventListener(
      schedulerName,
      async (schedulerMsg: SchedulerMsg) => {
        if (schedulerMsg.name === timeoutId)
          await schedulerHandler(schedulerMsg);
      },
      timeoutId,
    );
    setTimeout(async () => {
      await this.schedulerQueue.addMsg(timeoutId, {
        delayInSecond: timeInSecond,
        msgId: timeoutId,
      });
    }, 0);
    return timeoutId;
  }

  setCron(
    schedulerHandler: (schedulerMsg: SchedulerMsg) => Promise<void>,
    cronFormat: string,
    schedulerId: string,
  ) {
    const schedulerName = SchedulerService.schedulerQueueName;
    schedulerId = (schedulerId || generateRandomId(5)) + SCHEDULER_ID_POSTFIX;
    this.schedulerQueue.addEventListener(
      schedulerName,
      async (schedulerMsg: SchedulerMsg) => {
        if (schedulerMsg.name === schedulerId)
          await schedulerHandler(schedulerMsg);
      },
      schedulerId,
    );
    setTimeout(async () => {
      await this.schedulerQueue.addMsg(schedulerId, {
        cron: cronFormat,
        msgId: schedulerId,
      });
    }, 0);
  }

  async remove(schedulerId: string): Promise<void> {
    schedulerId += SCHEDULER_ID_POSTFIX;
    this.schedulerQueue.removeEventListener(
      SchedulerService.schedulerQueueName,
      schedulerId,
    );
    await this.schedulerQueue.getAndDeleteMsg(schedulerId);
    await this.schedulerQueue.deleteOneTimeMsg(
      SchedulerService.schedulerQueueName,
      schedulerId,
    );
  }
}
