import { PhysicalEthernetNetwork } from './networkScanner.types';

export function deriveNetwork(
  interfaceName: string,
  hostAddress: string,
  netmask: string,
  maxHosts: number,
): PhysicalEthernetNetwork {
  const address = ipv4ToUint(hostAddress);
  const mask = ipv4ToUint(netmask);
  const invertedMask = (~mask) >>> 0;
  if ((invertedMask & (invertedMask + 1)) !== 0) {
    throw new Error(`non-contiguous netmask on ${interfaceName}`);
  }
  const prefixLength = countBits(mask);
  const totalAddresses = 2 ** (32 - prefixLength);
  const hostCount = Math.max(0, totalAddresses - (prefixLength <= 30 ? 2 : 0) - 1);
  if (hostCount > maxHosts) {
    throw new Error(
      `derived network on ${interfaceName} exceeds ${maxHosts} hosts`,
    );
  }
  const network = (address & mask) >>> 0;
  const broadcast = (network | invertedMask) >>> 0;
  return {
    interfaceName,
    hostAddress,
    netmask,
    cidr: `${uintToIpv4(network)}/${prefixLength}`,
    prefixLength,
    networkAddress: uintToIpv4(network),
    broadcastAddress: uintToIpv4(broadcast),
    hostCount,
  };
}

export function normalizeMacAddress(macAddress: string): string {
  const compact = macAddress.replaceAll(/[:-]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) throw new Error('invalid MAC address');
  return compact.match(/.{2}/g)!.join(':');
}

export function assertIpv4(ipAddress: string): string {
  ipv4ToUint(ipAddress);
  return ipAddress;
}

export function isUsableAddressOnNetwork(
  ipAddress: string,
  network: PhysicalEthernetNetwork,
): boolean {
  const address = ipv4ToUint(ipAddress);
  const mask = ipv4ToUint(network.netmask);
  const networkAddress = ipv4ToUint(network.networkAddress);
  if (((address & mask) >>> 0) !== networkAddress) return false;
  if (ipAddress === network.hostAddress) return false;
  if (
    network.prefixLength <= 30 &&
    (ipAddress === network.networkAddress ||
      ipAddress === network.broadcastAddress)
  ) {
    return false;
  }
  return true;
}

function ipv4ToUint(value: string): number {
  const parts = value.split('.');
  if (parts.length !== 4) throw new Error(`invalid IPv4 address: ${value}`);
  let result = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      throw new Error(`invalid IPv4 address: ${value}`);
    }
    const octet = Number(part);
    if (octet > 255) throw new Error(`invalid IPv4 address: ${value}`);
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function uintToIpv4(value: number): string {
  return [24, 16, 8, 0]
    .map((shift) => ((value >>> shift) & 255).toString())
    .join('.');
}

function countBits(value: number): number {
  let count = 0;
  let remaining = value >>> 0;
  while (remaining !== 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}
