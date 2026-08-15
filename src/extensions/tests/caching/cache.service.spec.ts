import { CacheService } from 'src/extensions/caching/cache.service';

describe('CacheService', () => {
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const orchestrator = {
    isShuttingDown: false,
    registerHandler: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('isolates application values under the cache namespace', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(JSON.stringify({ id: 'nvr-1' })),
      del: jest.fn().mockResolvedValue(1),
    };
    const service = new CacheService<any>(
      redis as any,
      logger as any,
      orchestrator as any,
    );

    await service.set('Nvr:nvr-1', { id: 'nvr-1' });
    await expect(service.get('Nvr:nvr-1')).resolves.toEqual({ id: 'nvr-1' });
    await service.delete('Nvr:nvr-1');

    expect(redis.set).toHaveBeenCalledWith(
      'cache:Nvr:nvr-1',
      JSON.stringify({ id: 'nvr-1' }),
    );
    expect(redis.get).toHaveBeenCalledWith('cache:Nvr:nvr-1');
    expect(redis.del).toHaveBeenCalledWith('cache:Nvr:nvr-1');
  });

  it('registers and gracefully closes its Redis connection', async () => {
    const redis = {
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    };
    const service = new CacheService<any>(
      redis as any,
      logger as any,
      orchestrator as any,
    );

    service.onModuleInit();
    await service.shutdown();
    await service.shutdown();

    expect(orchestrator.registerHandler).toHaveBeenCalledWith('Cache', service);
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });
});
