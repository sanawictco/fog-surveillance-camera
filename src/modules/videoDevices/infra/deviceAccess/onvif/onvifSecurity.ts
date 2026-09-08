import { createHash, randomBytes } from 'node:crypto';

// Spelled out in full deliberately: these four URIs differ in ways that are easy
// to get wrong by string-munging one from another (the token-profile URI has no
// "wssecurity-" segment). A wrong Type attribute is rejected by some devices.
const WSSE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSU =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const PASSWORD_DIGEST =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest';
const BASE64_BINARY =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';

export interface OnvifCredentials {
  username: string;
  password: string;
}

export function passwordDigest(
  nonce: Buffer,
  created: string,
  password: string,
): string {
  return createHash('sha1')
    .update(
      Buffer.concat([
        nonce,
        Buffer.from(created, 'utf8'),
        Buffer.from(password, 'utf8'),
      ]),
    )
    .digest('base64');
}

export function buildSecurityHeader(
  credentials: OnvifCredentials,
  options: {
    deviceTimeOffsetMs?: number;
    nonce?: Buffer;
    now?: number;
  } = {},
): string {
  const nonce = options.nonce ?? randomBytes(16);
  const created = new Date(
    (options.now ?? Date.now()) + (options.deviceTimeOffsetMs ?? 0),
  ).toISOString();
  const digest = passwordDigest(nonce, created, credentials.password);
  return (
    `<Security s:mustUnderstand="1" xmlns="${WSSE}" xmlns:u="${WSU}">` +
    `<UsernameToken>` +
    `<Username>${escapeXml(credentials.username)}</Username>` +
    `<Password Type="${PASSWORD_DIGEST}">${digest}</Password>` +
    `<Nonce EncodingType="${BASE64_BINARY}">${nonce.toString('base64')}</Nonce>` +
    `<Created>${created}</Created>` +
    `</UsernameToken></Security>`
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
