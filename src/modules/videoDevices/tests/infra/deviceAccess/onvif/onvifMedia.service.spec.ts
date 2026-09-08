import {
  OnvifMediaService,
  stripCredentials,
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

  it('treats a profile with a non-numeric resolution dimension as area 0, deterministically, regardless of its position', () => {
    // Width/Height arrive as strings from ONVIF and are coerced with Number();
    // a camera reporting an unparsable Width yields NaN here. Before the fix,
    // NaN reaching the sort comparator made the outcome depend on this
    // profile's position in the input array. After the fix it always
    // degrades to the same area-0 path as "no resolution at all".
    const malformed = {
      token: 'malformed',
      resolution: { width: Number('not-a-number'), height: 1080 },
      hasAudio: false,
      hasPtz: false,
      streamUri: 'rtsp://cam/malformed',
    };
    for (const order of [
      [main, malformed, sub],
      [malformed, sub, main],
      [sub, main, malformed],
    ]) {
      const streams = toStreams(order);
      // The true largest well-formed profile always wins record, no matter
      // where the malformed profile sits in the input.
      expect(streams?.recordStream.token).toBe('main');
      // area-0 (from the malformed dimension) is, by design, eligible to win
      // the live role -- the same rule that lets a profile with no
      // resolution at all win live (see the comment on area()) -- so it
      // does here, deterministically, in every ordering.
      expect(streams?.liveStream.token).toBe('malformed');
    }
  });
});

describe('stripCredentials', () => {
  it('strips the full credential segment even when the password itself contains "@"', () => {
    const result = stripCredentials(
      'rtsp://admin:P@ss123@192.168.1.1:554/Streaming/Channels/101',
    );
    expect(result).toBe('rtsp://192.168.1.1:554/Streaming/Channels/101');
    // No fragment of the password should survive anywhere in the result.
    expect(result).not.toContain('admin');
    expect(result).not.toContain('P@ss123');
    expect(result).not.toContain('ss123');
    expect(result).not.toContain('@');
  });

  it('leaves a path segment containing "@" after the host untouched', () => {
    expect(stripCredentials('rtsp://192.168.1.1:554/path@with@at')).toBe(
      'rtsp://192.168.1.1:554/path@with@at',
    );
  });
});
