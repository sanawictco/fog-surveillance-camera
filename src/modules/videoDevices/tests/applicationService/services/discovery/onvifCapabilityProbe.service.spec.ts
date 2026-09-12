import { OnvifCapabilityProbe } from '../../../../applicationService/services/discovery/onvifCapabilityProbe.service';
import { MergedObservation } from '../../../../infra/networkScanner/networkScanner.types';
import { OnvifFaultError } from '../../../../infra/deviceAccess/onvif/onvifSoap.client';

// A `let` mutated by the empty-credentials test below and restored afterwards,
// so that test can exercise the shipped production default
// (`ONVIF_DEFAULT_CREDENTIALS` defaults to `'[]'`) without a second mock setup.
let mockDefaultCredentials: { username: string; password: string }[] = [
  { username: 'admin', password: 'wrong' },
  { username: 'admin', password: 'right' },
];

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    onvif: {
      get defaultCredentials() {
        return mockDefaultCredentials;
      },
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
    // Keyed off the credential ARGUMENT, not call number: an implementation
    // that tried the configured candidates in a different order would still
    // see one reject and one resolve, so keying on call number alone cannot
    // distinguish "tried in configured order" from "tried in any order".
    const getDeviceInformation = jest.fn().mockImplementation((_endpoint, credentials) => {
      if (credentials.password === 'wrong') {
        return Promise.reject(new Error('not authorized'));
      }
      return Promise.resolve({ manufacturer: 'ACME', firmwareVersion: 'V5.7.3' });
    });
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(getDeviceInformation).toHaveBeenCalledTimes(2);
    expect(getDeviceInformation.mock.calls[0]?.[1]?.password).toBe('wrong');
    expect(getDeviceInformation.mock.calls[1]?.[1]?.password).toBe('right');
    expect(result.status).toBe('ONVIF_READY');
    expect(result.firmwareVersion).toBe('V5.7.3');
  });

  it('reports AUTH_FAILED when every credential is genuinely rejected', async () => {
    // A SOAP fault is the device saying "no". Only that is evidence about the
    // credential, so only that may produce AUTH_FAILED.
    const getDeviceInformation = jest
      .fn()
      .mockRejectedValue(new OnvifFaultError('Sender not Authorized'));
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(result.status).toBe('AUTH_FAILED');
    expect(result.macAddress).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('does not report AUTH_FAILED when an attempt fails for a transport reason', async () => {
    // AUTH_FAILED is the status that dispatches a human with a reset button, so
    // it must not be produced by a socket hang up, a timeout, or an unparseable
    // response — none of which are evidence about the password. Observed on a
    // real IPC6515F-K: connection reuse killed every second request and the
    // camera was reported AUTH_FAILED with correct credentials configured.
    const getDeviceInformation = jest
      .fn()
      .mockRejectedValue(new Error('socket hang up'));
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(result.status).toBe('ONVIF_UNREACHABLE');
  });

  it('reports AUTH_FAILED only when no attempt failed for a transport reason', async () => {
    // One transport failure among genuine rejections still taints the verdict:
    // the credential that hung up was never actually tested.
    const getDeviceInformation = jest
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockRejectedValueOnce(new OnvifFaultError('Sender not Authorized'));
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(getDeviceInformation).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ONVIF_UNREACHABLE');
  });

  it('reports AUTH_FAILED without calling getDeviceInformation when no credentials are configured', async () => {
    // ONVIF_DEFAULT_CREDENTIALS defaults to '[]' in production: a stock
    // deployment has no candidates at all. This must not be misread as
    // ONVIF_READY just because there was nothing to fail.
    mockDefaultCredentials = [];
    try {
      const getDeviceInformation = jest.fn();
      const result = await build({ device: { getDeviceInformation } }).probe(observation);
      expect(result.status).toBe('AUTH_FAILED');
      expect(getDeviceInformation).not.toHaveBeenCalled();
    } finally {
      mockDefaultCredentials = [
        { username: 'admin', password: 'wrong' },
        { username: 'admin', password: 'right' },
      ];
    }
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

  it('still returns a record when getServices fails', async () => {
    const getServices = jest.fn().mockRejectedValue(new Error('services unavailable'));
    const result = await build({ device: { getServices } }).probe(observation);
    expect(result.status).toBe('ONVIF_READY');
    expect(result.streams).toBeUndefined();
    expect(result.manufacturer).toBe('ACME');
  });
});
