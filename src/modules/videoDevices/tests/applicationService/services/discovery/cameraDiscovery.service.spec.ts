import { CameraDiscoveryService } from '../../../../applicationService/services/discovery/cameraDiscovery.service';

const observation = {
  ipAddress: '192.168.10.51',
  interfaceName: 'eth1',
  evidence: ['lease'] as const,
};

function logger() {
  return { logger: { error: jest.fn(), debug: jest.fn() } };
}

describe('CameraDiscoveryService', () => {
  it('probes every observation and caches the results', async () => {
    const upsertMany = jest.fn().mockResolvedValue(undefined);
    const probe = jest
      .fn()
      .mockResolvedValue({ ipAddress: '192.168.10.51', status: 'ONVIF_READY' });
    const cameras = await new CameraDiscoveryService(
      { scan: jest.fn().mockResolvedValue([observation, observation]) } as never,
      { probe } as never,
      { upsertMany } as never,
      logger() as never,
    ).discover();

    expect(probe).toHaveBeenCalledTimes(2);
    expect(cameras).toHaveLength(2);
    expect(upsertMany).toHaveBeenCalledWith(cameras);
  });

  it('keeps the inventory when one device probe throws unexpectedly', async () => {
    const upsertMany = jest.fn().mockResolvedValue(undefined);
    const probe = jest
      .fn()
      .mockRejectedValueOnce(new Error('unexpected'))
      .mockResolvedValueOnce({ ipAddress: '192.168.10.52', status: 'ONVIF_READY' });
    const cameras = await new CameraDiscoveryService(
      { scan: jest.fn().mockResolvedValue([observation, observation]) } as never,
      { probe } as never,
      { upsertMany } as never,
      logger() as never,
    ).discover();

    expect(cameras).toHaveLength(1);
    expect(upsertMany).toHaveBeenCalledTimes(1);
  });
});
