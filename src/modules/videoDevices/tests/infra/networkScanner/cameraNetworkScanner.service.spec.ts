import { mergeObservations } from '../../../infra/networkScanner/cameraNetworkScanner.service';
import { NetworkObservation } from '../../../infra/networkScanner/networkScanner.types';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    networkScanner: {
      nmapExecutable: '/usr/bin/nmap',
      processTimeoutMs: 120_000,
      maxOutputBytes: 10_485_760,
    },
  }),
}));

const base = { interfaceName: 'eth1' } as const;

describe('mergeObservations', () => {
  it('merges observations of one device and unions their evidence', () => {
    const merged = mergeObservations([
      { ...base, ipAddress: '192.168.10.51', macAddress: 'AA:BB:CC:DD:EE:FF', evidence: 'neighbor' },
      { ...base, ipAddress: '192.168.10.51', macAddress: 'AA:BB:CC:DD:EE:FF', evidence: 'nmap' },
      {
        ...base,
        ipAddress: '192.168.10.51',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        evidence: 'lease',
        hostname: 'cam-lobby',
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].evidence.sort()).toEqual(['lease', 'neighbor', 'nmap']);
    expect(merged[0].hostname).toBe('cam-lobby');
    expect(merged[0].conflictMacAddresses).toBeUndefined();
  });

  it('reports every device sharing an address instead of throwing', () => {
    const observations: NetworkObservation[] = [
      { ...base, ipAddress: '192.168.1.21', macAddress: 'AA:BB:CC:00:00:01', evidence: 'nmap' },
      { ...base, ipAddress: '192.168.1.21', macAddress: 'AA:BB:CC:00:00:02', evidence: 'neighbor' },
      { ...base, ipAddress: '192.168.1.21', macAddress: 'AA:BB:CC:00:00:03', evidence: 'lease' },
    ];
    const merged = mergeObservations(observations);
    expect(merged).toHaveLength(3);
    for (const entry of merged) {
      expect(entry.conflictMacAddresses).toEqual([
        'AA:BB:CC:00:00:01',
        'AA:BB:CC:00:00:02',
        'AA:BB:CC:00:00:03',
      ]);
    }
  });

  it('keeps colliding devices apart by endpoint reference when no MAC is known', () => {
    const merged = mergeObservations([
      { ...base, ipAddress: '192.168.1.21', evidence: 'onvif', endpointReference: 'urn:uuid:a' },
      { ...base, ipAddress: '192.168.1.21', evidence: 'onvif', endpointReference: 'urn:uuid:b' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].conflictEndpointReferences).toEqual(['urn:uuid:a', 'urn:uuid:b']);
    expect(merged[1].conflictEndpointReferences).toEqual(['urn:uuid:a', 'urn:uuid:b']);
    expect(merged[0].conflictMacAddresses).toBeUndefined();
    expect(merged[1].conflictMacAddresses).toBeUndefined();
  });

  it('joins an ONVIF observation to the MAC seen at the same address', () => {
    const merged = mergeObservations([
      { ...base, ipAddress: '192.168.10.51', macAddress: 'AA:BB:CC:DD:EE:FF', evidence: 'lease' },
      {
        ...base,
        ipAddress: '192.168.10.51',
        evidence: 'onvif',
        endpointReference: 'urn:uuid:a',
        onvifXaddr: 'http://192.168.10.51/onvif/device_service',
        scopes: ['onvif://www.onvif.org/name/Lobby'],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(merged[0].onvifXaddr).toBe('http://192.168.10.51/onvif/device_service');
    expect(merged[0].scopes).toEqual(['onvif://www.onvif.org/name/Lobby']);
  });

  it('keeps a MAC observation and colliding ONVIF observations separate instead of dropping one', () => {
    const merged = mergeObservations([
      { ...base, ipAddress: '192.168.1.21', macAddress: 'AA:BB:CC:DD:EE:FF', evidence: 'neighbor' },
      { ...base, ipAddress: '192.168.1.21', evidence: 'onvif', endpointReference: 'urn:uuid:a' },
      { ...base, ipAddress: '192.168.1.21', evidence: 'onvif', endpointReference: 'urn:uuid:b' },
    ]);
    expect(merged).toHaveLength(3);
    for (const entry of merged) {
      expect(entry.conflictMacAddresses).toEqual(['AA:BB:CC:DD:EE:FF']);
      expect(entry.conflictEndpointReferences).toEqual(['urn:uuid:a', 'urn:uuid:b']);
    }
  });

  it('marks one MAC seen at several addresses as multi-homed and prefers the lease', () => {
    const merged = mergeObservations([
      { ...base, ipAddress: '192.168.10.9', macAddress: 'AA:BB:CC:DD:EE:FF', evidence: 'neighbor' },
      { ...base, ipAddress: '192.168.10.51', macAddress: 'AA:BB:CC:DD:EE:FF', evidence: 'lease' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].ipAddress).toBe('192.168.10.51');
    expect(merged[0].multiHomed).toBe(true);
  });
});
