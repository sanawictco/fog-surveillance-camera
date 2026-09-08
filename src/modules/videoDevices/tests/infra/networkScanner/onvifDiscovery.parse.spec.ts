import {
  nameFromScopes,
  parseProbeMatches,
} from '../../../infra/networkScanner/onvifDiscovery.service';

function probeMatch(inner: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope"' +
    ' xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"' +
    ' xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">' +
    `<SOAP-ENV:Body><d:ProbeMatches>${inner}</d:ProbeMatches></SOAP-ENV:Body>` +
    '</SOAP-ENV:Envelope>'
  );
}

const MATCH_A =
  '<d:ProbeMatch>' +
  '<wsa:EndpointReference><wsa:Address>urn:uuid:aaaa-1111</wsa:Address></wsa:EndpointReference>' +
  '<d:Scopes>onvif://www.onvif.org/name/Front%20Door onvif://www.onvif.org/hardware/IPC-1234</d:Scopes>' +
  '<d:XAddrs>http://192.168.10.51/onvif/device_service</d:XAddrs>' +
  '</d:ProbeMatch>';

describe('parseProbeMatches', () => {
  it('extracts address, endpoint reference, XAddr and scopes', () => {
    expect(parseProbeMatches(probeMatch(MATCH_A), 'eth1')).toEqual([
      {
        ipAddress: '192.168.10.51',
        interfaceName: 'eth1',
        evidence: 'onvif',
        endpointReference: 'urn:uuid:aaaa-1111',
        onvifXaddr: 'http://192.168.10.51/onvif/device_service',
        scopes: [
          'onvif://www.onvif.org/name/Front%20Door',
          'onvif://www.onvif.org/hardware/IPC-1234',
        ],
      },
    ]);
  });

  it('returns one observation per ProbeMatch when several share a datagram', () => {
    const matchB = MATCH_A.replace('aaaa-1111', 'bbbb-2222').replace(
      '192.168.10.51',
      '192.168.10.52',
    );
    const observations = parseProbeMatches(probeMatch(MATCH_A + matchB), 'eth1');
    expect(observations.map((o) => o.endpointReference)).toEqual([
      'urn:uuid:aaaa-1111',
      'urn:uuid:bbbb-2222',
    ]);
  });

  it('uses the first HTTP XAddr when several are advertised', () => {
    const multi = MATCH_A.replace(
      '<d:XAddrs>http://192.168.10.51/onvif/device_service</d:XAddrs>',
      '<d:XAddrs>http://[fe80::1]/onvif/device_service http://192.168.10.77/onvif/device_service</d:XAddrs>',
    );
    const [observation] = parseProbeMatches(probeMatch(multi), 'eth1');
    expect(observation.ipAddress).toBe('192.168.10.77');
  });

  it('ignores datagrams that are not ProbeMatches', () => {
    expect(parseProbeMatches('<html>nope</html>', 'eth1')).toEqual([]);
  });

  it('parses scopes from attributed Scopes element', () => {
    const attributed = MATCH_A.replace(
      '<d:Scopes>onvif://www.onvif.org/name/Front%20Door onvif://www.onvif.org/hardware/IPC-1234</d:Scopes>',
      '<d:Scopes MatchBy="http://schemas.xmlsoap.org/ws/2005/04/discovery/rfc3986">onvif://www.onvif.org/name/Front%20Door onvif://www.onvif.org/hardware/IPC-1234</d:Scopes>',
    );
    const [observation] = parseProbeMatches(probeMatch(attributed), 'eth1');
    expect(observation.scopes).toEqual([
      'onvif://www.onvif.org/name/Front%20Door',
      'onvif://www.onvif.org/hardware/IPC-1234',
    ]);
    expect(nameFromScopes(observation.scopes)).toBe('Front Door');
  });

  it('produces observation from ProbeMatch with attributed XAddrs element', () => {
    const attributed = MATCH_A.replace(
      '<d:XAddrs>http://192.168.10.51/onvif/device_service</d:XAddrs>',
      '<d:XAddrs xmlns:foo="http://example.com" foo:id="device1">http://192.168.10.51/onvif/device_service</d:XAddrs>',
    );
    const [observation] = parseProbeMatches(probeMatch(attributed), 'eth1');
    expect(observation).toBeDefined();
    expect(observation.ipAddress).toBe('192.168.10.51');
    expect(observation.onvifXaddr).toBe('http://192.168.10.51/onvif/device_service');
  });

  it('does not merge ProbeMatches with empty endpoint references into one observation', () => {
    const matchEmpty1 = MATCH_A.replace(
      '<wsa:EndpointReference><wsa:Address>urn:uuid:aaaa-1111</wsa:Address></wsa:EndpointReference>',
      '<wsa:EndpointReference><wsa:Address></wsa:Address></wsa:EndpointReference>',
    ).replace('192.168.10.51', '192.168.10.50');
    const matchEmpty2 = MATCH_A.replace(
      '<wsa:EndpointReference><wsa:Address>urn:uuid:aaaa-1111</wsa:Address></wsa:EndpointReference>',
      '<wsa:EndpointReference><wsa:Address></wsa:Address></wsa:EndpointReference>',
    ).replace('192.168.10.51', '192.168.10.51');
    const observations = parseProbeMatches(
      probeMatch(matchEmpty1 + matchEmpty2),
      'eth1',
    );
    expect(observations).toHaveLength(2);
    expect(observations[0]).not.toHaveProperty('endpointReference');
    expect(observations[1]).not.toHaveProperty('endpointReference');
    expect(observations.map((o) => o.ipAddress)).toEqual([
      '192.168.10.50',
      '192.168.10.51',
    ]);
  });
});

describe('nameFromScopes', () => {
  it('decodes the ONVIF name scope', () => {
    expect(
      nameFromScopes(['onvif://www.onvif.org/name/Front%20Door']),
    ).toBe('Front Door');
  });

  it('returns undefined when no name scope is present', () => {
    expect(nameFromScopes(['onvif://www.onvif.org/type/video_encoder'])).toBeUndefined();
    expect(nameFromScopes(undefined)).toBeUndefined();
  });
});
