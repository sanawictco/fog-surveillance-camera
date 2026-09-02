import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { NetworkProcessRunner } from './networkProcess.runner';
import { NmapXmlParser } from './nmapXml.parser';
import { OnvifDiscoveryService } from './onvifDiscovery.service';
import { PassiveNeighborService } from './passiveNeighbor.service';
import { PhysicalEthernetProvider } from './physicalEthernet.provider';
import {
  CameraNetworkObservation,
  NetworkObservation,
} from './networkScanner.types';
import { isUsableAddressOnNetwork } from './cidr';

@Injectable()
export class CameraNetworkScannerService {
  constructor(
    private readonly interfaceProvider: PhysicalEthernetProvider,
    private readonly processRunner: NetworkProcessRunner,
    private readonly xmlParser: NmapXmlParser,
    private readonly passiveNeighbors: PassiveNeighborService,
    private readonly onvifDiscovery: OnvifDiscoveryService,
  ) {}

  async scan(signal?: AbortSignal): Promise<CameraNetworkObservation[]> {
    signal?.throwIfAborted();
    const networks = await this.interfaceProvider.listNetworks();
    const observations: NetworkObservation[] = [];
    for (const network of networks) {
      signal?.throwIfAborted();
      const neighborObservations = await this.passiveNeighbors.read(
        network.interfaceName,
        signal,
      );
      observations.push(
        ...neighborObservations.filter((observation) =>
          isUsableAddressOnNetwork(observation.ipAddress, network),
        ),
      );
      const onvifObservations = await this.onvifDiscovery.discover(
          network.interfaceName,
          network.hostAddress,
          signal,
        );
      observations.push(
        ...onvifObservations.filter((observation) =>
          isUsableAddressOnNetwork(observation.ipAddress, network),
        ),
      );
      const config = AppConfig().networkScanner;
      const excludedAddresses = [network.hostAddress];
      if (network.prefixLength <= 30) {
        excludedAddresses.push(
          network.networkAddress,
          network.broadcastAddress,
        );
      }
      const result = await this.processRunner.run(
        config.nmapExecutable,
        [
          '-sn',
          '-PR',
          '-n',
          '-e',
          network.interfaceName,
          '--max-retries',
          '1',
          '--host-timeout',
          '1s',
          '--exclude',
          excludedAddresses.join(','),
          '-oX',
          '-',
          '--',
          network.cidr,
        ],
        config.processTimeoutMs,
        config.maxOutputBytes,
        signal,
      );
      observations.push(
        ...this.xmlParser.parse(result.stdout, network.interfaceName),
      );
    }
    return mergeObservations(observations);
  }
}

export function mergeObservations(
  observations: NetworkObservation[],
): CameraNetworkObservation[] {
  const byMac = new Map<string, CameraNetworkObservation>();
  const macByIp = new Map<string, string>();
  for (const observation of observations) {
    if (!observation.macAddress) continue;
    const existingMac = macByIp.get(observation.ipAddress);
    if (existingMac && existingMac !== observation.macAddress) {
      throw new Error(`ambiguous MAC addresses for ${observation.ipAddress}`);
    }
    const existing = byMac.get(observation.macAddress);
    if (existing && existing.ipAddress !== observation.ipAddress) {
      throw new Error(`ambiguous IP addresses for ${observation.macAddress}`);
    }
    macByIp.set(observation.ipAddress, observation.macAddress);
    byMac.set(observation.macAddress, {
      ipAddress: observation.ipAddress,
      macAddress: observation.macAddress,
      interfaceName: observation.interfaceName,
    });
  }
  return [...byMac.values()];
}
