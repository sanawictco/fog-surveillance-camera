import { OnvifEndpointResolver } from '../../../../infra/deviceAccess/onvif/onvifEndpoint.resolver';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ onvif: { candidatePorts: [80, 8000], requestTimeoutMs: 500 } }),
}));

function dateTimeResponse(iso: string) {
  const d = new Date(iso);
  return {
    GetSystemDateAndTimeResponse: {
      SystemDateAndTime: {
        UTCDateTime: {
          Date: {
            Year: String(d.getUTCFullYear()),
            Month: String(d.getUTCMonth() + 1),
            Day: String(d.getUTCDate()),
          },
          Time: {
            Hour: String(d.getUTCHours()),
            Minute: String(d.getUTCMinutes()),
            Second: String(d.getUTCSeconds()),
          },
        },
      },
    },
  };
}

describe('OnvifEndpointResolver', () => {
  const now = Date.parse('2026-09-07T10:00:00.000Z');
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => jest.restoreAllMocks());

  it('uses the XAddr from WS-Discovery without probing ports', async () => {
    const call = jest.fn().mockResolvedValue(dateTimeResponse('2026-09-07T10:00:00.000Z'));
    const endpoint = await new OnvifEndpointResolver({ call } as never).resolve(
      '192.168.10.51',
      'http://192.168.10.51:8899/onvif/device_service',
    );
    expect(endpoint?.xaddr).toBe('http://192.168.10.51:8899/onvif/device_service');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('reports the device clock offset when the camera clock is skewed', async () => {
    const call = jest.fn().mockResolvedValue(dateTimeResponse('2026-09-07T11:00:00.000Z'));
    const endpoint = await new OnvifEndpointResolver({ call } as never).resolve(
      '192.168.10.51',
      'http://192.168.10.51/onvif/device_service',
    );
    expect(endpoint?.deviceTimeOffsetMs).toBe(3_600_000);
  });

  it('falls back to the candidate ports and returns the first that answers', async () => {
    const call = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(dateTimeResponse('2026-09-07T10:00:00.000Z'));
    const endpoint = await new OnvifEndpointResolver({ call } as never).resolve(
      '192.168.10.51',
    );
    expect(endpoint?.xaddr).toBe('http://192.168.10.51:8000/onvif/device_service');
  });

  it('returns undefined when nothing answers', async () => {
    const call = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(
      await new OnvifEndpointResolver({ call } as never).resolve('192.168.10.51'),
    ).toBeUndefined();
  });
});
