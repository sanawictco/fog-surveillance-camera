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
    expect(header).toContain(`<Created>${CREATED}</Created>`);
  });

  it('shifts Created by the device clock offset', () => {
    const header = buildSecurityHeader(
      { username: 'admin', password: 'secret' },
      { nonce: NONCE, now, deviceTimeOffsetMs: 3_600_000 },
    );
    expect(header).toContain('<Created>2026-09-07T11:00:00.000Z</Created>');
  });

  it('escapes XML metacharacters in the username', () => {
    const header = buildSecurityHeader(
      { username: 'a<&b', password: 'secret' },
      { nonce: NONCE, now },
    );
    expect(header).toContain('<Username>a&lt;&amp;b</Username>');
  });
});
