import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { OnvifEndpointResolver } from '../../../infra/deviceAccess/onvif/onvifEndpoint.resolver';
import { OnvifDeviceService } from '../../../infra/deviceAccess/onvif/onvifDevice.service';
import {
  OnvifMediaService,
  toStreams,
} from '../../../infra/deviceAccess/onvif/onvifMedia.service';
import { OnvifCredentials } from '../../../infra/deviceAccess/onvif/onvifSecurity';
import {
  OnvifDeviceInformation,
  OnvifEndpoint,
} from '../../../infra/deviceAccess/onvif/onvif.types';
import { nameFromScopes } from '../../../infra/networkScanner/onvifDiscovery.service';
import { MergedObservation } from '../../../infra/networkScanner/networkScanner.types';
import { DiscoveredCamera } from '../../../infra/discoveredCamera/discoveredCamera.types';

const MEDIA10 = 'http://www.onvif.org/ver10/media/wsdl';
const MEDIA20 = 'http://www.onvif.org/ver20/media/wsdl';

@Injectable()
export class OnvifCapabilityProbe {
  constructor(
    private readonly endpointResolver: OnvifEndpointResolver,
    private readonly device: OnvifDeviceService,
    private readonly media: OnvifMediaService,
  ) {}

  async probe(observation: MergedObservation): Promise<DiscoveredCamera> {
    const base = this.baseRecord(observation);

    // Unicast ONVIF against a contested address reaches an arbitrary device,
    // so a conflict is reported rather than probed (spec §5.3).
    if (observation.conflictMacAddresses || observation.conflictEndpointReferences) {
      return { ...base, status: 'IP_CONFLICT' };
    }

    const endpoint = await this.endpointResolver.resolve(
      observation.ipAddress,
      observation.onvifXaddr,
    );
    if (!endpoint) return { ...base, status: 'ONVIF_UNREACHABLE' };

    const authenticated = await this.authenticate(endpoint);
    if (!authenticated) return { ...base, status: 'AUTH_FAILED' };

    const { credentials, information } = authenticated;
    const record: DiscoveredCamera = {
      ...base,
      status: 'ONVIF_READY',
      onvifXaddr: endpoint.xaddr,
      ...information,
    };

    try {
      record.macAddress =
        (await this.device.getMacAddress(endpoint, credentials)) ?? record.macAddress;
    } catch {
      // The scan-derived MAC stands.
    }

    try {
      const services = await this.device.getServices(endpoint, credentials);
      const media2 = services.find((service) => service.namespace === MEDIA20);
      const media1 = services.find((service) => service.namespace === MEDIA10);
      const chosen = media1 ?? media2;
      if (chosen) {
        const profiles = await this.media.getProfiles(
          endpoint,
          credentials,
          chosen.xaddr,
          chosen === media2,
        );
        record.hasPtz = profiles.some((profile) => profile.hasPtz);
        record.hasAudio = profiles.some((profile) => profile.hasAudio);
        record.streams = toStreams(profiles);
      }
    } catch {
      // Capabilities are best-effort: identity is still worth reporting.
    }

    return record;
  }

  private async authenticate(
    endpoint: OnvifEndpoint,
  ): Promise<
    { credentials: OnvifCredentials; information: OnvifDeviceInformation } | undefined
  > {
    // Phase 1 stand-in for the phase 3 product catalog. Same interface, different source.
    for (const credentials of AppConfig().onvif.defaultCredentials) {
      try {
        const information = await this.device.getDeviceInformation(endpoint, credentials);
        return { credentials, information };
      } catch {
        // Wrong credentials for this model; try the next candidate.
      }
    }
    return undefined;
  }

  private baseRecord(observation: MergedObservation): DiscoveredCamera {
    return {
      ipAddress: observation.ipAddress,
      interfaceName: observation.interfaceName,
      discoveredVia: observation.evidence,
      status: 'ONVIF_UNREACHABLE',
      ...(observation.macAddress ? { macAddress: observation.macAddress } : {}),
      ...(observation.endpointReference
        ? { endpointReference: observation.endpointReference }
        : {}),
      ...(observation.onvifXaddr ? { onvifXaddr: observation.onvifXaddr } : {}),
      ...(observation.multiHomed ? { multiHomed: true } : {}),
      ...(observation.conflictMacAddresses
        ? { conflictMacAddresses: observation.conflictMacAddresses }
        : {}),
      ...(observation.conflictEndpointReferences
        ? { conflictEndpointReferences: observation.conflictEndpointReferences }
        : {}),
      ...(nameFromScopes(observation.scopes)
        ? { suggestedName: nameFromScopes(observation.scopes) }
        : {}),
    };
  }
}
