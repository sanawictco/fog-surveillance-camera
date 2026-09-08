import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DnsmasqLeaseProvider } from '../../../infra/networkScanner/dnsmasqLease.provider';

let leasePath = '';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    networkScanner: { dnsmasqLeaseFile: leasePath },
  }),
}));

async function writeLeaseFile(contents: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'leases-'));
  leasePath = join(dir, 'dnsmasq.leases');
  await writeFile(leasePath, contents, 'utf8');
}

function fakeServiceProvider() {
  return {
    logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as never;
}

describe('DnsmasqLeaseProvider', () => {
  it('parses a lease line into a normalized observation', async () => {
    await writeLeaseFile(
      '1757251200 aa:bb:cc:dd:ee:ff 192.168.10.51 cam-lobby 01:aa:bb:cc:dd:ee:ff\n',
    );
    expect(
      await new DnsmasqLeaseProvider(fakeServiceProvider()).read('eth1'),
    ).toEqual([
      {
        ipAddress: '192.168.10.51',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        interfaceName: 'eth1',
        evidence: 'lease',
        hostname: 'cam-lobby',
      },
    ]);
  });

  it('treats the placeholder hostname as absent', async () => {
    await writeLeaseFile('1757251200 aa:bb:cc:dd:ee:ff 192.168.10.51 * *\n');
    const [observation] = await new DnsmasqLeaseProvider(
      fakeServiceProvider(),
    ).read('eth1');
    expect(observation.hostname).toBeUndefined();
  });

  it('skips malformed lines without failing the whole read', async () => {
    await writeLeaseFile(
      [
        'garbage',
        '1757251200 not-a-mac 192.168.10.52 cam-b *',
        '1757251200 aa:bb:cc:dd:ee:01 999.1.1.1 cam-c *',
        '1757251200 aa:bb:cc:dd:ee:02 192.168.10.53 cam-d *',
      ].join('\n'),
    );
    const observations = await new DnsmasqLeaseProvider(
      fakeServiceProvider(),
    ).read('eth1');
    expect(observations).toHaveLength(1);
    expect(observations[0].ipAddress).toBe('192.168.10.53');
  });

  it('returns no observations and stays silent when the lease file is absent', async () => {
    leasePath = '/nonexistent/dnsmasq.leases';
    const serviceProvider = fakeServiceProvider();
    expect(await new DnsmasqLeaseProvider(serviceProvider).read('eth1')).toEqual(
      [],
    );
    expect(serviceProvider.logger.warn).not.toHaveBeenCalled();
  });

  it('returns no observations but logs a warning on a non-ENOENT read failure', async () => {
    // A directory can't be read as a file: this raises EISDIR, not ENOENT,
    // simulating permission-denied/I/O failures on a host where the lease
    // file was supposed to be readable.
    leasePath = await mkdtemp(join(tmpdir(), 'leases-dir-'));
    const serviceProvider = fakeServiceProvider();
    expect(await new DnsmasqLeaseProvider(serviceProvider).read('eth1')).toEqual(
      [],
    );
    expect(serviceProvider.logger.warn).toHaveBeenCalledTimes(1);
    expect(serviceProvider.logger.debug).not.toHaveBeenCalled();
  });
});
