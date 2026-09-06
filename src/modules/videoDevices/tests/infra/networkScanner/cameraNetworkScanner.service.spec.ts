import { mergeObservations } from '../../../infra/networkScanner/cameraNetworkScanner.service';
import { CameraNetworkScannerService } from '../../../infra/networkScanner/cameraNetworkScanner.service';

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

describe('mergeObservations', () => {
  it('deduplicates observations with the same normalized identity', () => {
    expect(
      mergeObservations([
        {
          ipAddress: '192.168.1.2',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          interfaceName: 'eth0',
          evidence: 'neighbor',
        },
        {
          ipAddress: '192.168.1.2',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          interfaceName: 'eth0',
          evidence: 'nmap',
        },
      ]),
    ).toHaveLength(1);
  });

  it('rejects one MAC observed at multiple IP addresses', () => {
    expect(() =>
      mergeObservations([
        {
          ipAddress: '192.168.1.2',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          interfaceName: 'eth0',
          evidence: 'neighbor',
        },
        {
          ipAddress: '192.168.1.3',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          interfaceName: 'eth0',
          evidence: 'nmap',
        },
      ]),
    ).toThrow('ambiguous IP addresses');
  });

  it('rejects one IP observed with multiple MAC addresses', () => {
    expect(() =>
      mergeObservations([
        {
          ipAddress: '192.168.1.2',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          interfaceName: 'eth0',
          evidence: 'neighbor',
        },
        {
          ipAddress: '192.168.1.2',
          macAddress: '11:22:33:44:55:66',
          interfaceName: 'eth0',
          evidence: 'nmap',
        },
      ]),
    ).toThrow('ambiguous MAC addresses');
  });

  it('runs fixed nmap argv through the no-shell process adapter', async () => {
    const processRunner = {
      run: jest.fn().mockResolvedValue({ stdout: '<nmaprun/>', stderr: '' }),
    };
    const scanner = new CameraNetworkScannerService(
      {
        listNetworks: jest.fn().mockResolvedValue([
          {
            interfaceName: 'enp1s0',
            hostAddress: '192.168.1.9',
            cidr: '192.168.1.0/24',
            prefixLength: 24,
            networkAddress: '192.168.1.0',
            broadcastAddress: '192.168.1.255',
          },
        ]),
      } as never,
      processRunner as never,
      { parse: jest.fn().mockReturnValue([]) } as never,
      { read: jest.fn().mockResolvedValue([]) } as never,
      { discover: jest.fn().mockResolvedValue([]) } as never,
    );

    await scanner.scan();

    expect(processRunner.run).toHaveBeenCalledWith(
      '/usr/bin/nmap',
      [
        '-sn',
        '-PR',
        '-n',
        '-e',
        'enp1s0',
        '--max-retries',
        '1',
        '--host-timeout',
        '1s',
        '--exclude',
        '192.168.1.9,192.168.1.0,192.168.1.255',
        '-oX',
        '-',
        '--',
        '192.168.1.0/24',
      ],
      120_000,
      10_485_760,
      undefined,
    );
  });
});
