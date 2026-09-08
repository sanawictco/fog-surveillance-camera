import { Injectable } from '@nestjs/common';
import { StreamsProps } from '../../../domain/camera/valueObjects/streams.vo';
import { OnvifSoapClient } from './onvifSoap.client';
import { OnvifCredentials } from './onvifSecurity';
import { OnvifEndpoint, OnvifProfile } from './onvif.types';
import { asArray, text } from './onvifDevice.service';

const MEDIA10 = 'http://www.onvif.org/ver10/media/wsdl';
const MEDIA20 = 'http://www.onvif.org/ver20/media/wsdl';
const SCHEMA = 'http://www.onvif.org/ver10/schema';

@Injectable()
export class OnvifMediaService {
  constructor(private readonly soap: OnvifSoapClient) {}

  async getProfiles(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
    mediaXaddr: string,
    useMedia2: boolean,
  ): Promise<OnvifProfile[]> {
    const ns = useMedia2 ? MEDIA20 : MEDIA10;
    const body = await this.call(
      mediaXaddr,
      credentials,
      endpoint,
      useMedia2
        ? `<GetProfiles xmlns="${ns}"><Type>All</Type></GetProfiles>`
        : `<GetProfiles xmlns="${ns}"/>`,
    );
    const raw = asArray(
      body?.GetProfilesResponse?.Profiles ?? body?.GetProfilesResponse?.Profile,
    );
    const profiles: OnvifProfile[] = [];
    for (const item of raw) {
      const token = text(item?.token);
      if (!token) continue;
      const resolution =
        item?.VideoEncoderConfiguration?.Resolution ??
        item?.Configurations?.VideoEncoder?.Resolution;
      profiles.push({
        token,
        name: text(item?.Name),
        ...(resolution
          ? {
              resolution: {
                width: Number(resolution.Width),
                height: Number(resolution.Height),
              },
            }
          : {}),
        hasAudio: Boolean(
          item?.AudioEncoderConfiguration ?? item?.Configurations?.AudioEncoder,
        ),
        hasPtz: Boolean(item?.PTZConfiguration ?? item?.Configurations?.PTZ),
        streamUri: await this.getStreamUri(
          mediaXaddr,
          credentials,
          endpoint,
          token,
          useMedia2,
        ),
      });
    }
    return profiles;
  }

  private async getStreamUri(
    mediaXaddr: string,
    credentials: OnvifCredentials,
    endpoint: OnvifEndpoint,
    profileToken: string,
    useMedia2: boolean,
  ): Promise<string | undefined> {
    const bodyXml = useMedia2
      ? `<GetStreamUri xmlns="${MEDIA20}"><Protocol>RTSP</Protocol>` +
        `<ProfileToken>${profileToken}</ProfileToken></GetStreamUri>`
      : `<GetStreamUri xmlns="${MEDIA10}"><StreamSetup>` +
        `<Stream xmlns="${SCHEMA}">RTP-Unicast</Stream>` +
        `<Transport xmlns="${SCHEMA}"><Protocol>RTSP</Protocol></Transport>` +
        `</StreamSetup><ProfileToken>${profileToken}</ProfileToken></GetStreamUri>`;
    try {
      const body = await this.call(mediaXaddr, credentials, endpoint, bodyXml);
      const uri =
        text(body?.GetStreamUriResponse?.MediaUri?.Uri) ??
        text(body?.GetStreamUriResponse?.Uri);
      return uri ? stripCredentials(uri) : undefined;
    } catch {
      // A profile without a readable stream URI is still worth reporting.
      return undefined;
    }
  }

  private call(
    xaddr: string,
    credentials: OnvifCredentials,
    endpoint: OnvifEndpoint,
    bodyXml: string,
  ): Promise<Record<string, any>> {
    return this.soap.call(xaddr, bodyXml, {
      credentials,
      deviceTimeOffsetMs: endpoint.deviceTimeOffsetMs,
    });
  }
}

// Some devices echo the credentials back inside the stream URI. Storing them
// would duplicate secrets into every consumer's config file.
//
// The character class excludes only the slash (not '@'): passwords may
// themselves contain '@', so the match must be greedy up to the LAST '@'
// before the first '/' (the userinfo/host boundary), not the first '@'.
// Excluding '@' from the class would stop at that first '@' and leave a
// trailing fragment of the password in the path (and pointed at the wrong
// host). '[^/]*' cannot cross the first slash, so a '@' appearing later in
// the URI's path is left untouched.
export function stripCredentials(uri: string): string {
  return uri.replace(/^(rtsps?:\/\/)[^/]*@/i, '$1');
}

export function toStreams(profiles: OnvifProfile[]): StreamsProps | undefined {
  const usable = profiles.filter((profile) => profile.streamUri);
  if (usable.length === 0) return undefined;
  const sorted = [...usable].sort((a, b) => area(b) - area(a));
  const record = sorted[0]!;
  const live = sorted[sorted.length - 1]!;
  return {
    recordStream: {
      token: record.token,
      path: record.streamUri!,
      resolutions: record.resolution ? [record.resolution] : [],
    },
    liveStream: {
      token: live.token,
      path: live.streamUri!,
      resolutions: live.resolution ? [live.resolution] : [],
    },
  } as StreamsProps;
}

// A profile with no resolution at all is deliberately treated as area 0 (the
// smallest), so it can still win the live role. The opposite rule (treating
// "unknown" as largest, so it wins record) would fail symmetrically: if the
// SUB stream is the one missing resolution metadata, disqualifying it from
// live promotes the MAIN stream to live and sends full-bitrate video to the
// cloud instead. Phase 1 has no signal to tell which case it is, and the
// cloud can override the stream selection at register time, so a
// mis-selection here is correctable rather than permanent.
function area(profile: OnvifProfile): number {
  if (!profile.resolution) return 0;
  const value = profile.resolution.width * profile.resolution.height;
  // A malformed Resolution (missing/non-numeric Width or Height) produces
  // NaN here. NaN breaks Array.sort's comparator contract: `area(b) -
  // area(a)` becomes NaN for every comparison involving this profile, which
  // makes the sort order (and therefore which profile becomes record/live)
  // depend on the malformed profile's position in the input array rather
  // than on its resolution. Degrade it to the same deterministic path as
  // "no resolution at all" instead of letting NaN reach the comparator.
  return Number.isFinite(value) ? value : 0;
}
