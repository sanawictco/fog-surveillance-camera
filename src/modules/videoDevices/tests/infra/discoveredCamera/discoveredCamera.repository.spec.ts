import { DiscoveredCameraRepository } from '../../../infra/discoveredCamera/discoveredCamera.repository';
import { DiscoveredCamera } from '../../../infra/discoveredCamera/discoveredCamera.types';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    tenantId: 'tenant-1',
    nvrId: 'nvr-1',
    onvif: { discoveryTtlMinutes: 60 },
  }),
}));

const camera: DiscoveredCamera = {
  macAddress: 'AA:BB:CC:DD:EE:FF',
  ipAddress: '192.168.10.51',
  interfaceName: 'eth1',
  status: 'ONVIF_READY',
  discoveredVia: ['lease', 'onvif'],
  manufacturer: 'ACME',
};

describe('DiscoveredCameraRepository', () => {
  it('upserts scoped by tenant, nvr and MAC address', async () => {
    const updateOne = jest.fn().mockResolvedValue(undefined);
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([camera]);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({
      tenantId: 'tenant-1',
      nvrId: 'nvr-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
    });
    expect(update.$set.manufacturer).toBe('ACME');
    expect(update.$set.lastSeenAt).toBeInstanceOf(Date);
    expect(options).toEqual({ upsert: true });
    // Verify fields absent from input are not included in $set (prevents nulling on re-scan)
    expect(update.$set).not.toHaveProperty('hardwareId');
    expect(update.$set).not.toHaveProperty('model');
  });

  it('falls back to the endpoint reference when no MAC is known', async () => {
    const updateOne = jest.fn().mockResolvedValue(undefined);
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([
      { ...camera, macAddress: undefined, endpointReference: 'urn:uuid:a' },
    ]);
    expect(updateOne.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-1',
      nvrId: 'nvr-1',
      endpointReference: 'urn:uuid:a',
    });
  });

  it('reads only records seen inside the freshness window', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ lean });
    const nowMs = Date.now();
    await new DiscoveredCameraRepository({ find } as never).findAllFresh();

    const filter = find.mock.calls[0][0];
    expect(filter.tenantId).toBe('tenant-1');
    expect(filter.nvrId).toBe('nvr-1');
    expect(filter.lastSeenAt.$gte).toBeInstanceOf(Date);
    // Verify cutoff is approximately 60 minutes (3,600,000 ms) before now
    const cutoffMs = filter.lastSeenAt.$gte.getTime();
    const expectedCutoffMs = nowMs - 60 * 60_000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedCutoffMs - 100);
    expect(cutoffMs).toBeLessThanOrEqual(expectedCutoffMs + 100);
  });

  it('skips a record with neither MAC nor endpoint reference', async () => {
    const updateOne = jest.fn();
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([
      { ...camera, macAddress: undefined },
    ]);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('matches an existing endpoint-reference-keyed row by $or once a MAC is learned', async () => {
    const updateOne = jest.fn().mockResolvedValue(undefined);
    const repository = new DiscoveredCameraRepository({ updateOne } as never);

    // Scan 1: only WS-Discovery evidence, so the camera is cached keyed by
    // endpoint reference alone.
    await repository.upsertMany([
      { ...camera, macAddress: undefined, endpointReference: 'urn:uuid:a' },
    ]);
    const firstFilter = updateOne.mock.calls[0][0];
    expect(firstFilter).toEqual({
      tenantId: 'tenant-1',
      nvrId: 'nvr-1',
      endpointReference: 'urn:uuid:a',
    });

    // Scan 2: the camera now also carries a MAC. The filter must still be
    // able to match the row created above, not just a fresh MAC-only filter.
    await repository.upsertMany([
      { ...camera, macAddress: 'AA:BB:CC:DD:EE:FF', endpointReference: 'urn:uuid:a' },
    ]);
    const secondFilter = updateOne.mock.calls[1][0];
    expect(secondFilter).toEqual({
      $or: [
        { tenantId: 'tenant-1', nvrId: 'nvr-1', macAddress: 'AA:BB:CC:DD:EE:FF' },
        { tenantId: 'tenant-1', nvrId: 'nvr-1', endpointReference: 'urn:uuid:a' },
      ],
    });
    // The first document (matched by endpointReference alone) would satisfy
    // this $or, proving it is updated in place rather than colliding.
    expect(secondFilter.$or).toContainEqual(firstFilter);
  });

  it('continues after a failed write, isolating errors per camera', async () => {
    const updateOne = jest
      .fn()
      .mockRejectedValueOnce(new Error('E11000 duplicate key'))
      .mockResolvedValueOnce(undefined);
    await expect(
      new DiscoveredCameraRepository({ updateOne } as never).upsertMany([
        camera,
        { ...camera, macAddress: 'BB:CC:DD:EE:FF:AA' },
      ]),
    ).resolves.toBeUndefined();

    expect(updateOne).toHaveBeenCalledTimes(2);
  });
});
