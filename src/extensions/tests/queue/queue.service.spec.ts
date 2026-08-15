import { QueueService } from 'src/extensions/queue/queue.service';

describe('QueueService', () => {
  it('uses a stable job ID and one attempt for one-shot work', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = new QueueService();
    Object.assign(service, {
      queue: { add },
      shutdownOrchestrator: { isShuttingDown: false },
    });

    await service.addMsg(
      { data: { type: 'cameraCommand' } },
      { msgId: 'camera-command-1', attempts: 1 },
    );

    expect(add).toHaveBeenCalledWith(
      'camera-command-1',
      { type: 'cameraCommand' },
      {
        attempts: 1,
        delay: 0,
        jobId: 'camera-command-1',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('rejects new work after shutdown begins', async () => {
    const service = new QueueService();
    Object.assign(service, {
      queue: { add: jest.fn() },
      shutdownOrchestrator: { isShuttingDown: true },
    });

    await expect(
      service.addMsg({ data: 'value' }, { msgId: 'job-1' }),
    ).rejects.toThrow('Cannot add jobs during shutdown');
  });
});
