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
    await new DiscoveredCameraRepository({ find } as never).findAllFresh();

    const filter = find.mock.calls[0][0];
    expect(filter.tenantId).toBe('tenant-1');
    expect(filter.nvrId).toBe('nvr-1');
    expect(filter.lastSeenAt.$gte).toBeInstanceOf(Date);
  });

  it('skips a record with neither MAC nor endpoint reference', async () => {
    const updateOne = jest.fn();
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([
      { ...camera, macAddress: undefined },
    ]);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
