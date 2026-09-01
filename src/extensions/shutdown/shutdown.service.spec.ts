import { ShutdownOrchestratorService } from './shutdown.service';

describe('ShutdownOrchestratorService', () => {
  it('runs handlers in infrastructure-safe priority order', async () => {
    const service = new ShutdownOrchestratorService();
    const order: string[] = [];
    const handler = (label: string) => ({
      shutdown: jest.fn(async () => {
        order.push(label);
      }),
    });

    service.registerHandler('MongoDB', handler('MongoDB'));
    service.registerHandler('Cache', handler('Cache'));
    service.registerHandler('Queue[devices]', handler('Queue[devices]'));
    service.registerHandler('WebSocket', handler('WebSocket'));
    service.registerHandler('TDengine', handler('TDengine'));
    service.registerHandler('MQTT', handler('MQTT'));
    service.registerHandler('Scheduler', handler('Scheduler'));
    service.registerHandler('Other', handler('Other'));

    await service.onApplicationShutdown('SIGTERM');

    expect(order).toEqual([
      'WebSocket',
      'Scheduler',
      'Queue[devices]',
      'MQTT',
      'Cache',
      'TDengine',
      'MongoDB',
      'Other',
    ]);
  });

  it('does not run handlers twice', async () => {
    const service = new ShutdownOrchestratorService();
    const shutdown = jest.fn().mockResolvedValue(undefined);
    service.registerHandler('Cache', { shutdown });

    await service.onApplicationShutdown('SIGINT');
    await service.onApplicationShutdown('SIGINT');

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('continues shutting down after a handler fails', async () => {
    const service = new ShutdownOrchestratorService();
    const cacheShutdown = jest.fn().mockRejectedValue(new Error('Redis down'));
    const mongoShutdown = jest.fn().mockResolvedValue(undefined);
    service.registerHandler('Cache', { shutdown: cacheShutdown });
    service.registerHandler('MongoDB', { shutdown: mongoShutdown });

    await service.onApplicationShutdown('SIGTERM');

    expect(cacheShutdown).toHaveBeenCalledTimes(1);
    expect(mongoShutdown).toHaveBeenCalledTimes(1);
  });
});
