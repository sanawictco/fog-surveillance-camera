import { Injectable } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { normalizeMacAddress, assertIpv4 } from './cidr';
import { NetworkObservation } from './networkScanner.types';

@Injectable()
export class NmapXmlParser {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });

  parse(xml: string, interfaceName: string): NetworkObservation[] {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new Error(`invalid nmap XML: ${validation.err.msg}`);
    }
    let parsed: unknown;
    try {
      parsed = this.parser.parse(xml);
    } catch (error) {
      throw new Error(`invalid nmap XML: ${(error as Error).message}`);
    }
    const root = parsed as {
      nmaprun?: { host?: NmapHost | NmapHost[] };
    };
    const hosts = asArray(root.nmaprun?.host);
    const observations: NetworkObservation[] = [];
    for (const host of hosts) {
      if (host.status?.state !== 'up') continue;
      const addresses = asArray(host.address);
      const ip = addresses.find((address) => address.addrtype === 'ipv4')?.addr;
      const mac = addresses.find((address) => address.addrtype === 'mac')?.addr;
      if (!ip || !mac) continue;
      observations.push({
        ipAddress: assertIpv4(ip),
        macAddress: normalizeMacAddress(mac),
        interfaceName,
        evidence: 'nmap',
      });
    }
    return observations;
  }
}

interface NmapHost {
  status?: { state?: string };
  address?: NmapAddress | NmapAddress[];
}

interface NmapAddress {
  addr?: string;
  addrtype?: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
