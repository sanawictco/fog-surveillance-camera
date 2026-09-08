import {
  OnvifMediaService,
  toStreams,
} from '../../../../infra/deviceAccess/onvif/onvifMedia.service';

const ENDPOINT = { xaddr: 'http://192.168.10.51/onvif/device_service', deviceTimeOffsetMs: 0 };
const CREDS = { username: 'admin', password: 'secret' };
const MEDIA = 'http://192.168.10.51/onvif/media';

describe('OnvifMediaService.getProfiles', () => {
  it('maps profiles, detecting audio and PTZ, and attaches stream URIs', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({
        GetProfilesResponse: {
          Profiles: [
            {
              token: 'main',
              Name: 'MainStream',
              VideoEncoderConfiguration: { Resolution: { Width: '2560', Height: '1440' } },
              AudioEncoderConfiguration: { Name: 'A' },
              PTZConfiguration: { Name: 'P' },
            },
            {
              token: 'sub',
              Name: 'SubStream',
              VideoEncoderConfiguration: { Resolution: { Width: '640', Height: '360' } },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        GetStreamUriResponse: {
          MediaUri: { Uri: 'rtsp://admin:secret@192.168.10.51:554/Streaming/Channels/101' },
        },
      })
      .mockResolvedValueOnce({
        GetStreamUriResponse: {
          MediaUri: { Uri: 'rtsp://192.168.10.51:554/Streaming/Channels/102' },
        },
      });

    const profiles = await new OnvifMediaService({ call } as never).getProfiles(
      ENDPOINT,
      CREDS,
      MEDIA,
      false,
    );

    expect(profiles).toEqual([
      {
        token: 'main',
        name: 'MainStream',
        resolution: { width: 2560, height: 1440 },
        hasAudio: true,
        hasPtz: true,
        streamUri: 'rtsp://192.168.10.51:554/Streaming/Channels/101',
      },
      {
        token: 'sub',
        name: 'SubStream',
        resolution: { width: 640, height: 360 },
        hasAudio: false,
        hasPtz: false,
        streamUri: 'rtsp://192.168.10.51:554/Streaming/Channels/102',
      },
    ]);
  });

  it('keeps a profile whose stream URI cannot be read', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({
        GetProfilesResponse: { Profiles: { token: 'only', Name: 'Only' } },
      })
      .mockRejectedValueOnce(new Error('not supported'));
    const profiles = await new OnvifMediaService({ call } as never).getProfiles(
      ENDPOINT,
      CREDS,
      MEDIA,
      false,
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].streamUri).toBeUndefined();
  });
});

describe('toStreams', () => {
  const main = {
    token: 'main',
    resolution: { width: 2560, height: 1440 },
    hasAudio: true,
    hasPtz: false,
    streamUri: 'rtsp://cam/main',
  };
  const sub = {
    token: 'sub',
    resolution: { width: 640, height: 360 },
    hasAudio: false,
    hasPtz: false,
    streamUri: 'rtsp://cam/sub',
  };

  it('maps the largest profile to record and the smallest to live', () => {
    expect(toStreams([sub, main])).toEqual({
      recordStream: {
        token: 'main',
        path: 'rtsp://cam/main',
        resolutions: [{ width: 2560, height: 1440 }],
      },
      liveStream: {
        token: 'sub',
        path: 'rtsp://cam/sub',
        resolutions: [{ width: 640, height: 360 }],
      },
    });
  });

  it('uses the single profile for both roles when only one exists', () => {
    const streams = toStreams([main]);
    expect(streams?.recordStream.token).toBe('main');
    expect(streams?.liveStream.token).toBe('main');
  });

  it('returns undefined when no profile has a stream URI', () => {
    expect(toStreams([{ ...main, streamUri: undefined }])).toBeUndefined();
  });
});
