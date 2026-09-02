import { Injectable } from '@nestjs/common';
import { networkInterfaces } from 'node:os';
import { access, readFile, realpath } from 'node:fs/promises';
import AppConfig from 'configs/app.config';
import { deriveNetwork } from './cidr';
import { PhysicalEthernetNetwork } from './networkScanner.types';

@Injectable()
export class PhysicalEthernetProvider {
  async listNetworks(): Promise<PhysicalEthernetNetwork[]> {
    const results: PhysicalEthernetNetwork[] = [];
    for (const [interfaceName, addresses] of Object.entries(networkInterfaces())) {
      if (!(await this.isEligible(interfaceName))) continue;
      for (const address of addresses ?? []) {
        if (address.family !== 'IPv4' || address.internal || !address.netmask) {
          continue;
        }
        results.push(
          deriveNetwork(
            interfaceName,
            address.address,
            address.netmask,
            AppConfig().networkScanner.maxHosts,
          ),
        );
      }
    }
    if (results.length === 0) {
      throw new Error('no active physical Ethernet IPv4 network is available');
    }
    return results;
  }

  private async isEligible(interfaceName: string): Promise<boolean> {
    if (
      interfaceName === 'lo' ||
      /^(wl|wlan|docker|br-|virbr|veth|vmnet|tun|tap)/i.test(interfaceName) ||
      !/^[a-zA-Z0-9_.-]{1,15}$/.test(interfaceName)
    ) {
      return false;
    }
    try {
      const resolved = await realpath(`/sys/class/net/${interfaceName}`);
      if (resolved.includes('/virtual/')) return false;
      try {
        await access(`/sys/class/net/${interfaceName}/wireless`);
        return false;
      } catch {
        // A missing wireless marker is expected for physical Ethernet NICs.
      }
      const [type, carrier] = await Promise.all([
        readFile(`/sys/class/net/${interfaceName}/type`, 'utf8'),
        readFile(`/sys/class/net/${interfaceName}/carrier`, 'utf8'),
      ]);
      return type.trim() === '1' && carrier.trim() === '1';
    } catch {
      return false;
    }
  }
}
