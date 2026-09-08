import { OnvifCapabilityProbe } from '../../../../applicationService/services/discovery/onvifCapabilityProbe.service';
import { MergedObservation } from '../../../../infra/networkScanner/networkScanner.types';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    onvif: {
      defaultCredentials: [
        { username: 'admin', password: 'wrong' },
        { username: 'admin', password: 'right' },
      ],
    },
  }),
}));

const observation: MergedObservation = {
  ipAddress: '192.168.10.51',
  macAddress: 'AA:BB:CC:DD:EE:FF',
  interfaceName: 'eth1',
  evidence: ['lease', 'onvif'],
  onvifXaddr: 'http://192.168.10.51/onvif/device_service',
  scopes: ['onvif://www.onvif.org/name/Lobby'],
};

const endpoint = { xaddr: observation.onvifXaddr!, deviceTimeOffsetMs: 0 };

function build(overrides: {
  resolve?: jest.Mock;
  device?: Partial<Record<string, jest.Mock>>;
  media?: jest.Mock;
}) {
  return new OnvifCapabilityProbe(
    { resolve: overrides.resolve ?? jest.fn().mockResolvedValue(endpoint) } as never,
    {
      getDeviceInformation:
        overrides.device?.getDeviceInformation ??
        jest.fn().mockResolvedValue({ manufacturer: 'ACME', model: 'IPC-1234' }),
      getServices:
        overrides.device?.getServices ??
        jest.fn().mockResolvedValue([
          { namespace: 'http://www.onvif.org/ver10/media/wsdl', xaddr: 'http://cam/media' },
        ]),
      getMacAddress:
        overrides.device?.getMacAddress ?? jest.fn().mockResolvedValue('AA:BB:CC:DD:EE:FF'),
    } as never,
    { getProfiles: overrides.media ?? jest.fn().mockResolvedValue([]) } as never,
  );
}

describe('OnvifCapabilityProbe', () => {
  it('reports a conflicted address without probing it', async () => {
    const resolve = jest.fn();
    const result = await build({ resolve }).probe({
      ...observation,
      conflictMacAddresses: ['AA:BB:CC:00:00:01', 'AA:BB:CC:00:00:02'],
    });
    expect(result.status).toBe('IP_CONFLICT');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('reports ONVIF_UNREACHABLE when no endpoint answers', async () => {
    const result = await build({ resolve: jest.fn().mockResolvedValue(undefined) }).probe(
      observation,
    );
    expect(result.status).toBe('ONVIF_UNREACHABLE');
  });

  it('tries each credential in order and records success', async () => {
    const getDeviceInformation = jest
      .fn()
      .mockRejectedValueOnce(new Error('not authorized'))
      .mockResolvedValueOnce({ manufacturer: 'ACME', firmwareVersion: 'V5.7.3' });
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(getDeviceInformation).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ONVIF_READY');
    expect(result.firmwareVersion).toBe('V5.7.3');
  });

  it('reports AUTH_FAILED when no credential works', async () => {
    const getDeviceInformation = jest.fn().mockRejectedValue(new Error('not authorized'));
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(result.status).toBe('AUTH_FAILED');
    expect(result.macAddress).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('derives name, PTZ, audio and streams from the media profiles', async () => {
    const media = jest.fn().mockResolvedValue([
      {
        token: 'main',
        resolution: { width: 2560, height: 1440 },
        hasAudio: true,
        hasPtz: true,
        streamUri: 'rtsp://cam/main',
      },
      {
        token: 'sub',
        resolution: { width: 640, height: 360 },
        hasAudio: false,
        hasPtz: false,
        streamUri: 'rtsp://cam/sub',
      },
    ]);
    const result = await build({ media }).probe(observation);
    expect(result.suggestedName).toBe('Lobby');
    expect(result.hasPtz).toBe(true);
    expect(result.hasAudio).toBe(true);
    expect(result.streams?.recordStream.token).toBe('main');
    expect(result.streams?.liveStream.token).toBe('sub');
  });

  it('still returns a record when the media service fails', async () => {
    const media = jest.fn().mockRejectedValue(new Error('media unavailable'));
    const result = await build({ media }).probe(observation);
    expect(result.status).toBe('ONVIF_READY');
    expect(result.streams).toBeUndefined();
    expect(result.manufacturer).toBe('ACME');
  });
});
