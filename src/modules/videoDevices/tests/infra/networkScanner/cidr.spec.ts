import {
  assertIpv4,
  deriveNetwork,
  isUsableAddressOnNetwork,
  normalizeMacAddress,
} from '../../../infra/networkScanner/cidr';

describe('network CIDR utilities', () => {
  it('derives an exact non-/24 network', () => {
    expect(
      deriveNetwork('enp1s0', '192.168.10.9', '255.255.255.248', 100),
    ).toEqual({
      interfaceName: 'enp1s0',
      hostAddress: '192.168.10.9',
      netmask: '255.255.255.248',
      cidr: '192.168.10.8/29',
      prefixLength: 29,
      networkAddress: '192.168.10.8',
      broadcastAddress: '192.168.10.15',
      hostCount: 5,
    });
  });

  it('does not arbitrarily skip low host addresses', () => {
    const network = deriveNetwork(
      'eth0',
      '10.0.0.9',
      '255.255.255.0',
      300,
    );
    expect(network.networkAddress).toBe('10.0.0.0');
    expect(network.hostCount).toBe(253);
  });

  it('rejects oversized networks rather than truncating them', () => {
    expect(() =>
      deriveNetwork('eth0', '10.2.3.4', '255.255.0.0', 4094),
    ).toThrow('exceeds 4094 hosts');
  });

  it('rejects a non-contiguous netmask', () => {
    expect(() =>
      deriveNetwork('eth0', '10.2.3.4', '255.0.255.0', 4094),
    ).toThrow('non-contiguous netmask');
  });

  it('validates IPv4 and normalizes MAC addresses', () => {
    expect(assertIpv4('192.168.1.1')).toBe('192.168.1.1');
    expect(normalizeMacAddress('aa-bb-cc-dd-ee-ff')).toBe(
      'AA:BB:CC:DD:EE:FF',
    );
    expect(() => assertIpv4('192.168.1.999')).toThrow('invalid IPv4');
  });

  it('accepts only usable addresses on the exact derived network', () => {
    const network = deriveNetwork(
      'enp1s0',
      '192.168.10.9',
      '255.255.255.248',
      100,
    );

    expect(isUsableAddressOnNetwork('192.168.10.10', network)).toBe(true);
    expect(isUsableAddressOnNetwork('192.168.10.7', network)).toBe(false);
    expect(isUsableAddressOnNetwork('192.168.10.8', network)).toBe(false);
    expect(isUsableAddressOnNetwork('192.168.10.9', network)).toBe(false);
    expect(isUsableAddressOnNetwork('192.168.10.15', network)).toBe(false);
    expect(isUsableAddressOnNetwork('192.168.10.16', network)).toBe(false);
  });
});
