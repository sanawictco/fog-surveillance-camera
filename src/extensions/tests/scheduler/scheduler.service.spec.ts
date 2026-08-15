import { SchedulerService } from 'src/extensions/scheduler/scheduler.service';

describe('SchedulerService', () => {
  it('preserves the seconds contract and returns an awaited scheduler ID', async () => {
    const schedulerQueue = {
      addMsg: jest.fn().mockResolvedValue(undefined),
      getMsg: jest.fn().mockResolvedValue(undefined),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getAndDeleteMsg: jest.fn().mockResolvedValue(undefined),
      deleteOneTimeMsg: jest.fn().mockResolvedValue(false),
      queue: {
        getDelayed: jest.fn().mockResolvedValue([]),
        getJobSchedulers: jest.fn().mockResolvedValue([]),
      },
    };
    const queueFactory = {
      createQueue: jest.fn().mockReturnValue(schedulerQueue),
    };
    const service = new SchedulerService(queueFactory as any);
    Object.assign(service, {
      shutdownOrchestrator: {
        isShuttingDown: false,
        registerHandler: jest.fn(),
      },
    });
    await service.onModuleInit();

    await expect(
      service.setInterval(async () => undefined, 30, 'health-check'),
    ).resolves.toBe('health-check-schedulerId');
    expect(schedulerQueue.addMsg).toHaveBeenCalledWith(
      { data: 'health-check-schedulerId' },
      {
        msgId: 'health-check-schedulerId',
        repeat: { retryCount: 0, retryPeriodInSecond: 30 },
      },
    );

    await service.shutdown();
  });
});
