import { CacheService } from './cache.service';

describe('CacheService', () => {
  const createService = () => {
    const cache = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const orchestrator = {
      registerHandler: jest.fn(),
      isShuttingDown: false,
    };
    const service = new CacheService(
      cache as any,
      logger as any,
      orchestrator as any,
    );
    return { service, cache, logger, orchestrator };
  };

  it('prefixes keys and applies only positive TTL values', async () => {
    const { service, cache } = createService();

    await service.set('nvr:1', { active: true }, 30);
    await service.set('nvr:2', { active: false }, 0);

    expect(cache.set).toHaveBeenNthCalledWith(
      1,
      'cache:nvr:1',
      JSON.stringify({ active: true }),
      'EX',
      30,
    );
    expect(cache.set).toHaveBeenNthCalledWith(
      2,
      'cache:nvr:2',
      JSON.stringify({ active: false }),
    );
  });

  it('closes Redis once during shutdown', async () => {
    const { service, cache } = createService();

    await service.shutdown('SIGTERM');
    await service.shutdown('SIGTERM');

    expect(cache.quit).toHaveBeenCalledTimes(1);
  });
});
