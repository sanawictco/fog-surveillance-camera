import { ShutdownOrchestratorService } from 'src/extensions/shutdown/shutdown.service';

describe('ShutdownOrchestratorService', () => {
  it('runs handlers sequentially in resource-safe priority order', async () => {
    const order: string[] = [];
    const orchestrator = new ShutdownOrchestratorService();
    const register = (label: string) =>
      orchestrator.registerHandler(label, {
        shutdown: async () => {
          order.push(label);
        },
      });

    register('Cache');
    register('TDengine');
    register('MQTT');
    register('Queue[schedulerQueue]');
    register('WebSocket');
    register('Scheduler');
    register('Application[CloudConnection]');

    await orchestrator.onApplicationShutdown('SIGTERM');

    expect(order).toEqual([
      'Application[CloudConnection]',
      'WebSocket',
      'Scheduler',
      'Queue[schedulerQueue]',
      'MQTT',
      'Cache',
      'TDengine',
    ]);
  });

  it('does not run handlers twice for duplicate shutdown triggers', async () => {
    const shutdown = jest.fn().mockResolvedValue(undefined);
    const orchestrator = new ShutdownOrchestratorService();
    orchestrator.registerHandler('Cache', { shutdown });

    await orchestrator.onApplicationShutdown('SIGTERM');
    await orchestrator.onApplicationShutdown('SIGINT');

    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
