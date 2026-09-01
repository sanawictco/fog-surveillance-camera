import { TDengineService } from './tdengine.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    timeseriesDb: {
      wsUrl: 'ws://tdengine:6041',
      user: 'root',
      password: 'taosdata',
      dbName: 'surveillance',
    },
  }),
}));

describe('TDengineService', () => {
  it('connects, initializes schema, and closes through the orchestrator', async () => {
    const client = {
      exec: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const wsConfig = {
      setUser: jest.fn(),
      setPwd: jest.fn(),
      setDb: jest.fn(),
      setTimeOut: jest.fn(),
    };
    const taos = {
      WSConfig: jest.fn(() => wsConfig),
      sqlConnect: jest.fn().mockResolvedValue(client),
    };
    const orchestrator = {
      registerHandler: jest.fn(),
      isShuttingDown: false,
    };
    const initializeSchema = jest.fn().mockResolvedValue(undefined);
    const service = new TDengineService(taos, orchestrator as any);
    service.registerConnectionInitializer(initializeSchema);

    await service.onModuleInit();
    await service.shutdown();

    expect(orchestrator.registerHandler).toHaveBeenCalledWith(
      'TDengine',
      service,
    );
    expect(client.exec).toHaveBeenCalledWith('USE surveillance');
    expect(initializeSchema).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(service.isAvailable).toBe(false);
  });
});
