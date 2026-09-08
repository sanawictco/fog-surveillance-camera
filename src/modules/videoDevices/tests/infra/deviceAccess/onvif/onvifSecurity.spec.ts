import {
  buildSecurityHeader,
  passwordDigest,
} from '../../../../infra/deviceAccess/onvif/onvifSecurity';

const NONCE = Buffer.from('0123456789abcdef', 'utf8');
const CREATED = '2026-09-07T10:00:00.000Z';

describe('passwordDigest', () => {
  it('matches the ONVIF reference digest for known inputs', () => {
    // Base64(SHA1(nonce ++ created ++ password)) — golden value, not recomputed
    // by the test, so a change in the algorithm fails here.
    expect(passwordDigest(NONCE, CREATED, 'secret')).toBe(
      'ACo8I3STgqZll/Pu4NqAIM/ztgA=',
    );
  });

  it('changes when the password changes', () => {
    expect(passwordDigest(NONCE, CREATED, 'other')).not.toBe(
      passwordDigest(NONCE, CREATED, 'secret'),
    );
  });
});

describe('buildSecurityHeader', () => {
  const now = Date.parse(CREATED);

  it('embeds username, digest, base64 nonce and created', () => {
    const header = buildSecurityHeader(
      { username: 'admin', password: 'secret' },
      { nonce: NONCE, now },
    );
    expect(header).toContain('<Username>admin</Username>');
    expect(header).toContain('ACo8I3STgqZll/Pu4NqAIM/ztgA=');
    expect(header).toContain('MDEyMzQ1Njc4OWFiY2RlZg==');
    expect(header).toContain(`<u:Created>${CREATED}</u:Created>`);
    // Guard against URI typos: verify namespace and type declarations
    expect(header).toContain(
      'xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"',
    );
    expect(header).toContain(
      'xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"',
    );
    expect(header).toContain(
      'Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest"',
    );
    expect(header).toContain(
      'EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary"',
    );
  });

  it('shifts Created by the device clock offset', () => {
    const header = buildSecurityHeader(
      { username: 'admin', password: 'secret' },
      { nonce: NONCE, now, deviceTimeOffsetMs: 3_600_000 },
    );
    expect(header).toContain('<u:Created>2026-09-07T11:00:00.000Z</u:Created>');
  });

  it('escapes XML metacharacters in the username', () => {
    const header = buildSecurityHeader(
      { username: 'a<&b', password: 'secret' },
      { nonce: NONCE, now },
    );
    expect(header).toContain('<Username>a&lt;&amp;b</Username>');
  });

  it('generates random nonce and current timestamp when not provided', () => {
    const beforeCall = Date.now();
    const header = buildSecurityHeader(
      { username: 'admin', password: 'secret' },
      { deviceTimeOffsetMs: 0 },
    );
    const afterCall = Date.now();

    // Verify nonce is present with 24-character base64 body (16 bytes -> 24 chars)
    const nonceMatch = header.match(
      /<Nonce EncodingType="[^"]*">([A-Za-z0-9+/=]+)<\/Nonce>/,
    );
    expect(nonceMatch).toBeTruthy();
    expect(nonceMatch![1]).toMatch(/^[A-Za-z0-9+/=]{24}$/);

    // Verify Created is a valid ISO-8601 date close to now
    const createdMatch = header.match(/<u:Created>([^<]+)<\/u:Created>/);
    expect(createdMatch).toBeTruthy();
    const createdTime = Date.parse(createdMatch![1]);
    expect(createdTime).toBeGreaterThanOrEqual(beforeCall);
    expect(createdTime).toBeLessThanOrEqual(afterCall + 1000);
  });
});
