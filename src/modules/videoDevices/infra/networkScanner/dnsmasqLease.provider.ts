import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import AppConfig from 'configs/app.config';
import { assertIpv4, normalizeMacAddress } from './cidr';
import { NetworkObservation } from './networkScanner.types';

@Injectable()
export class DnsmasqLeaseProvider {
  async read(interfaceName: string): Promise<NetworkObservation[]> {
    let contents: string;
    try {
      contents = await readFile(AppConfig().networkScanner.dnsmasqLeaseFile, 'utf8');
    } catch {
      // dnsmasq is absent in development (spec §10.1); degrade to no leases.
      return [];
    }
    const observations: NetworkObservation[] = [];
    for (const line of contents.split('\n')) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 3) continue;
      const rawMac = fields[1]!;
      const rawIp = fields[2]!;
      const rawHostname = fields[3];
      try {
        observations.push({
          ipAddress: assertIpv4(rawIp),
          macAddress: normalizeMacAddress(rawMac),
          interfaceName,
          evidence: 'lease',
          ...(rawHostname && rawHostname !== '*' ? { hostname: rawHostname } : {}),
        });
      } catch {
        // A malformed line must not discard the leases that parsed cleanly.
      }
    }
    return observations;
  }
}
