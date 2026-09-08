import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { NetworkProcessRunner } from './networkProcess.runner';
import { NmapXmlParser } from './nmapXml.parser';
import { OnvifDiscoveryService } from './onvifDiscovery.service';
import { PassiveNeighborService } from './passiveNeighbor.service';
import { PhysicalEthernetProvider } from './physicalEthernet.provider';
import { DnsmasqLeaseProvider } from './dnsmasqLease.provider';
import {
  MergedObservation,
  NetworkObservation,
} from './networkScanner.types';
import { isUsableAddressOnNetwork } from './cidr';

@Injectable()
export class CameraNetworkScannerService {
  constructor(
    private readonly leaseProvider: DnsmasqLeaseProvider,
    private readonly interfaceProvider: PhysicalEthernetProvider,
    private readonly processRunner: NetworkProcessRunner,
    private readonly xmlParser: NmapXmlParser,
    private readonly passiveNeighbors: PassiveNeighborService,
    private readonly onvifDiscovery: OnvifDiscoveryService,
  ) {}

  async scan(signal?: AbortSignal): Promise<MergedObservation[]> {
    signal?.throwIfAborted();
    const networks = await this.interfaceProvider.listNetworks();
    const observations: NetworkObservation[] = [];
    for (const network of networks) {
      signal?.throwIfAborted();
      const leaseObservations = await this.leaseProvider.read(network.interfaceName);
      observations.push(
        ...leaseObservations.filter((observation) =>
          isUsableAddressOnNetwork(observation.ipAddress, network),
        ),
      );
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
): MergedObservation[] {
  const byKey = new Map<string, MergedObservation>();
  for (const observation of observations) {
    // One rule covers both conflict shapes: several MACs at one address, and
    // several ONVIF endpoint references at one address.
    const key =
      observation.macAddress ??
      observation.endpointReference ??
      observation.ipAddress;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ipAddress: observation.ipAddress,
        interfaceName: observation.interfaceName,
        evidence: [observation.evidence],
        ...(observation.macAddress ? { macAddress: observation.macAddress } : {}),
        ...(observation.endpointReference
          ? { endpointReference: observation.endpointReference }
          : {}),
        ...(observation.onvifXaddr ? { onvifXaddr: observation.onvifXaddr } : {}),
        ...(observation.hostname ? { hostname: observation.hostname } : {}),
        ...(observation.scopes ? { scopes: observation.scopes } : {}),
      });
      continue;
    }
    if (!existing.evidence.includes(observation.evidence)) {
      existing.evidence.push(observation.evidence);
    }
    existing.macAddress ??= observation.macAddress;
    existing.endpointReference ??= observation.endpointReference;
    existing.onvifXaddr ??= observation.onvifXaddr;
    existing.hostname ??= observation.hostname;
    existing.scopes ??= observation.scopes;
    if (existing.ipAddress !== observation.ipAddress) {
      // The lease file is authoritative; anything else may be a stale entry.
      existing.multiHomed = true;
      if (observation.evidence === 'lease') existing.ipAddress = observation.ipAddress;
    }
  }

  const merged = [...byKey.values()];
  joinOnvifOnlyEntries(merged);
  markAddressConflicts(merged);
  return merged;
}

// A WS-Discovery observation carries no MAC, so it lands under its endpoint
// reference. When exactly one MAC-keyed device holds that address, they are the
// same device and the ONVIF details belong to it.
function joinOnvifOnlyEntries(merged: MergedObservation[]): void {
  for (const entry of [...merged]) {
    if (entry.macAddress || !entry.endpointReference) continue;
    const withMac = merged.filter(
      (other) => other.ipAddress === entry.ipAddress && other.macAddress,
    );
    if (withMac.length !== 1) continue;
    const target = withMac[0]!;
    target.endpointReference ??= entry.endpointReference;
    target.onvifXaddr ??= entry.onvifXaddr;
    target.scopes ??= entry.scopes;
    for (const evidence of entry.evidence) {
      if (!target.evidence.includes(evidence)) target.evidence.push(evidence);
    }
    merged.splice(merged.indexOf(entry), 1);
  }
}

function markAddressConflicts(merged: MergedObservation[]): void {
  const byAddress = new Map<string, MergedObservation[]>();
  for (const entry of merged) {
    const group = byAddress.get(entry.ipAddress) ?? [];
    group.push(entry);
    byAddress.set(entry.ipAddress, group);
  }
  for (const group of byAddress.values()) {
    if (group.length < 2) continue;
    const macAddresses = group
      .map((entry) => entry.macAddress)
      .filter((mac): mac is string => Boolean(mac))
      .sort();
    const endpointReferences = group
      .map((entry) => entry.endpointReference)
      .filter((epr): epr is string => Boolean(epr))
      .sort();
    for (const entry of group) {
      if (macAddresses.length) entry.conflictMacAddresses = [...macAddresses];
      if (endpointReferences.length) {
        entry.conflictEndpointReferences = [...endpointReferences];
      }
    }
  }
}
