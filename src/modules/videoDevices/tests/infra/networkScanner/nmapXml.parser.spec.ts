import { NmapXmlParser } from '../../../infra/networkScanner/nmapXml.parser';

describe('NmapXmlParser', () => {
  const parser = new NmapXmlParser();

  it('parses XML independently of address field order', () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="aa:bb:cc:dd:ee:ff" addrtype="mac"/><address addr="192.168.1.2" addrtype="ipv4"/></host></nmaprun>`;
    expect(parser.parse(xml, 'eth0')).toEqual([
      {
        ipAddress: '192.168.1.2',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        interfaceName: 'eth0',
        evidence: 'nmap',
      },
    ]);
  });

  it('skips down and MAC-less hosts without failing valid peers', () => {
    const xml = `<nmaprun><host><status state="down"/><address addr="192.168.1.2" addrtype="ipv4"/></host><host><status state="up"/><address addr="192.168.1.3" addrtype="ipv4"/></host></nmaprun>`;
    expect(parser.parse(xml, 'eth0')).toEqual([]);
  });
});
