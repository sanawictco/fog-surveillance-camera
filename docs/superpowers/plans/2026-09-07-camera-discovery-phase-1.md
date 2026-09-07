# Camera Discovery Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nvrConfig.search` return a complete, capability-resolved camera inventory to cloud — every camera on the segment identified by MAC, manufacturer, model, firmware, serial, streams, PTZ and audio, with address conflicts reported rather than crashing the scan.

**Architecture:** The existing `CameraNetworkScannerService` gains a fourth evidence channel (dnsmasq leases) and stops throwing on duplicate IPs. A new hand-rolled ONVIF client (SOAP over `axios` + `fast-xml-parser`, both already dependencies) probes each discovered host for capabilities. Results are cached in a new `discoveredCameras` Mongo collection so `register` can later resolve a MAC without re-scanning, and published to cloud in an enriched `search` ack.

**Tech Stack:** NestJS 11, TypeScript, Mongoose, `axios`, `fast-xml-parser`, `node:crypto`, Jest + ts-jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-camera-discovery-and-registration-design.md`

## Global Constraints

- **No new npm dependencies.** The ONVIF client is hand-rolled over `axios` and `fast-xml-parser` (spec §6.4). Adding the `onvif` package is explicitly rejected.
- **Parse SOAP by local name.** Every `XMLParser` used for ONVIF responses must set `removeNSPrefix: true`. Never match a namespace-prefixed tag — vendors vary prefixes freely (`tds:`, `ns2:`, `wsdl:`).
- **`GetSystemDateAndTime` is unauthenticated and always runs first.** It confirms the endpoint and yields the device clock offset used to build the WS-Security `Created` timestamp. Skipping it causes auth failures on cameras with skewed clocks (spec §6.4).
- **Discovery is read-only.** Phase 1 never writes to a camera. No `SetUser`, no `SetNetworkInterfaces`, no hardening.
- **Nothing throws out of a per-device probe.** A device that fails at any step is reported with a status and whatever earlier steps produced. Only genuine programmer errors propagate.
- **Generic ONVIF only.** No vendor adapters, no SADP, no ISAPI/CGI in this phase.
- **Existing test conventions:** specs live under `src/modules/videoDevices/tests/**` mirroring the source path; `configs/app.config` is mocked with `jest.mock('configs/app.config', () => ({ __esModule: true, default: () => ({ ... }) }))`.
- **Commit style:** conventional commits (`commitlint` runs on `commit-msg`). Header ≤ 100 chars.
- **Run tests with:** `npm test` (which is `cross-env NODE_ENV=test jest`). Single file: `npm test -- <path>`.

## Phase 1 credential stand-in

The product catalog (model → default credentials) is **phase 3**. Phase 1 needs credentials to exercise the authenticated probe chain against real hardware, which is the whole point of shipping it first. So phase 1 reads an ordered candidate list from config:

```
ONVIF_DEFAULT_CREDENTIALS=[{"username":"admin","password":"admin"},{"username":"admin","password":"12345"}]
```

`OnvifCapabilityProbe` tries each in order and records which succeeded. In phase 3 the *source* of the list changes to the catalog; the probe's interface does not. Do not build catalog matching here.

## File Structure

| File | Responsibility |
|---|---|
| `infra/networkScanner/networkScanner.types.ts` (modify) | Shared discovery types; gains evidence union, merged-observation and status types |
| `infra/networkScanner/dnsmasqLease.provider.ts` (create) | Reads and parses the dnsmasq lease file into observations |
| `infra/networkScanner/onvifDiscovery.service.ts` (modify) | WS-Discovery probe; gains real ProbeMatch parsing (XAddrs, scopes, EPR) |
| `infra/networkScanner/cameraNetworkScanner.service.ts` (modify) | Runs all channels; conflict-tolerant merge |
| `infra/deviceAccess/onvif/onvifSecurity.ts` (create) | WS-Security UsernameToken digest and header (pure) |
| `infra/deviceAccess/onvif/onvifSoap.client.ts` (create) | Envelope build, HTTP transport, fault detection, response parsing |
| `infra/deviceAccess/onvif/onvifEndpoint.resolver.ts` (create) | Finds the device service URL and clock offset |
| `infra/deviceAccess/onvif/onvifDevice.service.ts` (create) | `GetDeviceInformation`, `GetServices`, `GetNetworkInterfaces` |
| `infra/deviceAccess/onvif/onvifMedia.service.ts` (create) | `GetProfiles`, `GetStreamUri`, profile → `StreamsProps` mapping |
| `infra/deviceAccess/onvif/onvif.types.ts` (create) | ONVIF DTOs shared by the services above |
| `infra/discoveredCamera/discoveredCamera.schema.ts` (create) | Mongo model for the discovery cache |
| `infra/discoveredCamera/discoveredCamera.repository.ts` (create) | Upsert-by-MAC, age-based reads; never deletes on scan |
| `applicationService/services/discovery/onvifCapabilityProbe.service.ts` (create) | Per-device probe sequence producing one `DiscoveredCamera` |
| `applicationService/services/discovery/cameraDiscovery.service.ts` (create) | Orchestrates scan → probe → cache → result |
| `contracts/mqtt/videoDeviceConfig.Mqttdto.ts` (modify) | `DiscoveredCameraDto` for the search ack |
| `shared/cloudConfig/baseCloudCommunication.service.ts` (modify) | `mqttData` union gains `discoveredCameras` |
| `applicationService/services/mqtt/nvrConfigsMqtt.service.ts` (modify) | Real `autoSearch()` |
| `configs/app.config.ts` (modify) | Lease path, ONVIF timeouts/ports, candidate credentials, discovery TTL |
| `videoDevices.module.ts` (modify) | Provider wiring, `MongooseModule.forFeature` for the new model |

---

### Task 1: Discovery types and dnsmasq lease provider

**Files:**
- Modify: `src/modules/videoDevices/infra/networkScanner/networkScanner.types.ts`
- Create: `src/modules/videoDevices/infra/networkScanner/dnsmasqLease.provider.ts`
- Modify: `configs/app.config.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/infra/networkScanner/dnsmasqLease.provider.spec.ts`

**Interfaces:**
- Consumes: `normalizeMacAddress`, `assertIpv4` from `./cidr`
- Produces: `DiscoveryEvidence`, `NetworkObservation` (extended), `MergedObservation`, `DiscoveredCameraStatus` types; `DnsmasqLeaseProvider.read(): Promise<NetworkObservation[]>`

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/networkScanner/dnsmasqLease.provider.spec.ts`:

```ts
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

describe('DnsmasqLeaseProvider', () => {
  it('parses a lease line into a normalized observation', async () => {
    await writeLeaseFile(
      '1757251200 aa:bb:cc:dd:ee:ff 192.168.10.51 cam-lobby 01:aa:bb:cc:dd:ee:ff\n',
    );
    expect(await new DnsmasqLeaseProvider().read('eth1')).toEqual([
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
    const [observation] = await new DnsmasqLeaseProvider().read('eth1');
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
    const observations = await new DnsmasqLeaseProvider().read('eth1');
    expect(observations).toHaveLength(1);
    expect(observations[0].ipAddress).toBe('192.168.10.53');
  });

  it('returns no observations when the lease file is absent', async () => {
    leasePath = '/nonexistent/dnsmasq.leases';
    expect(await new DnsmasqLeaseProvider().read('eth1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dnsmasqLease.provider.spec`
Expected: FAIL — `Cannot find module '../../../infra/networkScanner/dnsmasqLease.provider'`

- [ ] **Step 3: Extend the shared types**

Replace the `NetworkObservation` interface in `src/modules/videoDevices/infra/networkScanner/networkScanner.types.ts` and add the new types below it. Leave `PhysicalEthernetNetwork`, `CameraNetworkObservation` and `ProcessResult` unchanged:

```ts
export type DiscoveryEvidence = 'lease' | 'neighbor' | 'onvif' | 'nmap';

export interface NetworkObservation {
  ipAddress: string;
  macAddress?: string;
  interfaceName: string;
  evidence: DiscoveryEvidence;
  hostname?: string;
  endpointReference?: string;
  onvifXaddr?: string;
  scopes?: string[];
}

export type DiscoveredCameraStatus =
  | 'ONVIF_READY'
  | 'AUTH_FAILED'
  | 'ONVIF_UNREACHABLE'
  | 'IP_CONFLICT';

export interface MergedObservation {
  ipAddress: string;
  macAddress?: string;
  interfaceName: string;
  evidence: DiscoveryEvidence[];
  hostname?: string;
  endpointReference?: string;
  onvifXaddr?: string;
  scopes?: string[];
  // A device answering on two addresses is an anomaly worth surfacing, but it
  // is still probeable — so it is a flag, not a terminal status.
  multiHomed?: boolean;
  conflictMacAddresses?: string[];
  conflictEndpointReferences?: string[];
}
```

- [ ] **Step 4: Add the config entry**

In `configs/app.config.ts`, inside the existing `networkScanner` object, add:

```ts
    dnsmasqLeaseFile: env
      .get('DNSMASQ_LEASE_FILE')
      .default('/var/lib/misc/dnsmasq.leases')
      .asString(),
```

- [ ] **Step 5: Write the provider**

Create `src/modules/videoDevices/infra/networkScanner/dnsmasqLease.provider.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import AppConfig from 'configs/app.config';
import { assertIpv4, normalizeMacAddress } from './cidr';
import { NetworkObservation } from './networkScanner.types';

@Injectable()
export class DnsmasqLeaseProvider {
  async read(interfaceName: string): Promise<NetworkObservation[]> {
    let contents: string;
    try {
      contents = await readFile(AppConfig().networkScanner.dnsmasqLeaseFile, 'utf8');
    } catch {
      // dnsmasq is absent in development (spec §10.1); degrade to no leases.
      return [];
    }
    const observations: NetworkObservation[] = [];
    for (const line of contents.split('\n')) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 3) continue;
      const [, rawMac, rawIp, rawHostname] = fields;
      try {
        observations.push({
          ipAddress: assertIpv4(rawIp),
          macAddress: normalizeMacAddress(rawMac),
          interfaceName,
          evidence: 'lease',
          ...(rawHostname && rawHostname !== '*' ? { hostname: rawHostname } : {}),
        });
      } catch {
        // A malformed line must not discard the leases that parsed cleanly.
      }
    }
    return observations;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- dnsmasqLease.provider.spec`
Expected: PASS, 4 tests

- [ ] **Step 7: Wire the provider into the module**

In `src/modules/videoDevices/videoDevices.module.ts`, add the import and add `DnsmasqLeaseProvider` to the `services` array next to `PassiveNeighborService`:

```ts
import { DnsmasqLeaseProvider } from './infra/networkScanner/dnsmasqLease.provider';
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, all suites (baseline is 22 suites / 83 tests; this adds 4 tests)

- [ ] **Step 9: Commit**

```bash
git add src/modules/videoDevices/infra/networkScanner/networkScanner.types.ts \
        src/modules/videoDevices/infra/networkScanner/dnsmasqLease.provider.ts \
        src/modules/videoDevices/tests/infra/networkScanner/dnsmasqLease.provider.spec.ts \
        configs/app.config.ts \
        src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(discovery): add dnsmasq lease provider as a discovery channel"
```

---

### Task 2: WS-Security UsernameToken digest

**Files:**
- Create: `src/modules/videoDevices/infra/deviceAccess/onvif/onvifSecurity.ts`
- Test: `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifSecurity.spec.ts`

**Interfaces:**
- Produces: `OnvifCredentials { username: string; password: string }`; `passwordDigest(nonce: Buffer, created: string, password: string): string`; `buildSecurityHeader(credentials: OnvifCredentials, options?: { deviceTimeOffsetMs?: number; nonce?: Buffer; now?: number }): string`

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifSecurity.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifSecurity.spec`
Expected: FAIL — `Cannot find module '.../onvifSecurity'`

- [ ] **Step 3: Write the implementation**

Create `src/modules/videoDevices/infra/deviceAccess/onvif/onvifSecurity.ts`:

```ts
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
    `<Security s:mustUnderstand="1" xmlns="${WSSE}">` +
    `<UsernameToken>` +
    `<Username>${escapeXml(credentials.username)}</Username>` +
    `<Password Type="${PASSWORD_DIGEST}">${digest}</Password>` +
    `<Nonce EncodingType="${BASE64_BINARY}">${nonce.toString('base64')}</Nonce>` +
    `<Created xmlns="${WSU}">${created}</Created>` +
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onvifSecurity.spec`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/modules/videoDevices/infra/deviceAccess/onvif/onvifSecurity.ts \
        src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifSecurity.spec.ts
git commit -m "feat(onvif): add WS-Security UsernameToken digest"
```

---

### Task 3: ONVIF SOAP client

**Files:**
- Create: `src/modules/videoDevices/infra/deviceAccess/onvif/onvifSoap.client.ts`
- Modify: `configs/app.config.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifSoap.client.spec.ts`

**Interfaces:**
- Consumes: `buildSecurityHeader`, `OnvifCredentials` from `./onvifSecurity`
- Produces: `OnvifFaultError` (class, has `.reason: string`); `OnvifSoapClient.call(endpoint: string, bodyXml: string, options?: { credentials?: OnvifCredentials; deviceTimeOffsetMs?: number; timeoutMs?: number }): Promise<Record<string, any>>` — resolves the **parsed `Body` element**, namespace prefixes already stripped

- [ ] **Step 1: Write the failing test**

The client is tested against a real `node:http` server returning canned SOAP. Later tasks mock `OnvifSoapClient.call` directly instead, so this harness stays local to this spec.

Create `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifSoap.client.spec.ts`:

```ts
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  OnvifFaultError,
  OnvifSoapClient,
} from '../../../../infra/deviceAccess/onvif/onvifSoap.client';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ onvif: { requestTimeoutMs: 2000 } }),
}));

function soapResponse(innerXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">' +
    `<SOAP-ENV:Body>${innerXml}</SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

let server: Server;
let baseUrl = '';
let lastBody = '';
let handler: () => { status: number; body: string };

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      lastBody = Buffer.concat(chunks).toString('utf8');
      const { status, body } = handler();
      res.writeHead(status, { 'content-type': 'application/soap+xml' });
      res.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/onvif/device_service`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('OnvifSoapClient', () => {
  it('returns the parsed body with namespace prefixes stripped', async () => {
    handler = () => ({
      status: 200,
      body: soapResponse(
        '<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">' +
          '<tds:Manufacturer>ACME</tds:Manufacturer>' +
          '</tds:GetDeviceInformationResponse>',
      ),
    });
    const body = await new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>');
    expect(body.GetDeviceInformationResponse.Manufacturer).toBe('ACME');
  });

  it('omits the Security header when no credentials are given', async () => {
    handler = () => ({ status: 200, body: soapResponse('<Ok/>') });
    await new OnvifSoapClient().call(baseUrl, '<GetSystemDateAndTime/>');
    expect(lastBody).not.toContain('Security');
  });

  it('includes a Security header when credentials are given', async () => {
    handler = () => ({ status: 200, body: soapResponse('<Ok/>') });
    await new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>', {
      credentials: { username: 'admin', password: 'secret' },
    });
    expect(lastBody).toContain('<Username>admin</Username>');
    expect(lastBody).toContain('PasswordDigest');
  });

  it('raises OnvifFaultError carrying the fault reason', async () => {
    handler = () => ({
      status: 400,
      body: soapResponse(
        '<SOAP-ENV:Fault xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">' +
          '<SOAP-ENV:Reason><SOAP-ENV:Text>Sender not authorized</SOAP-ENV:Text></SOAP-ENV:Reason>' +
          '</SOAP-ENV:Fault>',
      ),
    });
    await expect(
      new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>'),
    ).rejects.toThrow(OnvifFaultError);
    await expect(
      new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>'),
    ).rejects.toThrow('Sender not authorized');
  });

  it('rejects a non-SOAP response body', async () => {
    handler = () => ({ status: 200, body: '<html>login page</html>' });
    await expect(
      new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>'),
    ).rejects.toThrow('not a SOAP envelope');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifSoap.client.spec`
Expected: FAIL — `Cannot find module '.../onvifSoap.client'`

- [ ] **Step 3: Add the config block**

In `configs/app.config.ts`, add a new top-level `onvif` key next to `networkScanner`:

```ts
  onvif: {
    requestTimeoutMs: env
      .get('ONVIF_REQUEST_TIMEOUT_MS')
      .default('5000')
      .asIntPositive(),
    candidatePorts: env
      .get('ONVIF_CANDIDATE_PORTS')
      .default('80,8000,8899,2020')
      .asArray(',')
      .map(Number),
    defaultCredentials: JSON.parse(
      env.get('ONVIF_DEFAULT_CREDENTIALS').default('[]').asString(),
    ) as { username: string; password: string }[],
    discoveryTtlMinutes: env
      .get('ONVIF_DISCOVERY_TTL_MINUTES')
      .default('60')
      .asIntPositive(),
  },
```

- [ ] **Step 4: Write the client**

Create `src/modules/videoDevices/infra/deviceAccess/onvif/onvifSoap.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import AppConfig from 'configs/app.config';
import { buildSecurityHeader, OnvifCredentials } from './onvifSecurity';

export class OnvifFaultError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'OnvifFaultError';
  }
}

@Injectable()
export class OnvifSoapClient {
  // removeNSPrefix is mandatory: vendors vary SOAP prefixes freely, so every
  // lookup in this module matches on local name only.
  private readonly parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
  });

  async call(
    endpoint: string,
    bodyXml: string,
    options: {
      credentials?: OnvifCredentials;
      deviceTimeOffsetMs?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<Record<string, any>> {
    const header = options.credentials
      ? `<s:Header>${buildSecurityHeader(options.credentials, {
          deviceTimeOffsetMs: options.deviceTimeOffsetMs,
        })}</s:Header>`
      : '';
    const envelope =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">' +
      `${header}<s:Body>${bodyXml}</s:Body></s:Envelope>`;

    const response = await axios.post(endpoint, envelope, {
      headers: { 'content-type': 'application/soap+xml; charset=utf-8' },
      timeout: options.timeoutMs ?? AppConfig().onvif.requestTimeoutMs,
      responseType: 'text',
      transformResponse: [(data: string) => data],
      // A SOAP fault arrives with a 4xx/5xx status and a body worth parsing,
      // so every status is accepted here and classified below.
      validateStatus: () => true,
      maxRedirects: 0,
    });

    const parsed = this.parser.parse(response.data as string) as Record<string, any>;
    const body = parsed?.Envelope?.Body;
    if (!body || typeof body !== 'object') {
      throw new Error(`ONVIF response from ${endpoint} is not a SOAP envelope`);
    }
    if (body.Fault) {
      throw new OnvifFaultError(faultReason(body.Fault));
    }
    return body as Record<string, any>;
  }
}

function faultReason(fault: Record<string, any>): string {
  const text = fault?.Reason?.Text;
  if (typeof text === 'string' && text) return text;
  if (typeof text === 'object' && typeof text?.['#text'] === 'string') {
    return text['#text'];
  }
  if (typeof fault?.faultstring === 'string') return fault.faultstring;
  return 'unspecified ONVIF fault';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- onvifSoap.client.spec`
Expected: PASS, 5 tests

- [ ] **Step 6: Wire into the module**

In `src/modules/videoDevices/videoDevices.module.ts` add the import and add `OnvifSoapClient` to the `services` array:

```ts
import { OnvifSoapClient } from './infra/deviceAccess/onvif/onvifSoap.client';
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/videoDevices/infra/deviceAccess/onvif/onvifSoap.client.ts \
        src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifSoap.client.spec.ts \
        configs/app.config.ts src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(onvif): add SOAP client with fault handling"
```

---

### Task 4: Endpoint resolver and device clock offset

**Files:**
- Create: `src/modules/videoDevices/infra/deviceAccess/onvif/onvif.types.ts`
- Create: `src/modules/videoDevices/infra/deviceAccess/onvif/onvifEndpoint.resolver.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifEndpoint.resolver.spec.ts`

**Interfaces:**
- Consumes: `OnvifSoapClient.call`
- Produces: `OnvifEndpoint { xaddr: string; deviceTimeOffsetMs: number }`; `OnvifEndpointResolver.resolve(ipAddress: string, knownXaddr?: string): Promise<OnvifEndpoint | undefined>`

**Why the clock offset lives here:** `GetSystemDateAndTime` is unauthenticated, so it is both the liveness probe and the only way to learn the device clock before any authenticated call. Resolving the endpoint and measuring the offset is one operation.

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifEndpoint.resolver.spec.ts`:

```ts
import { OnvifEndpointResolver } from '../../../../infra/deviceAccess/onvif/onvifEndpoint.resolver';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ onvif: { candidatePorts: [80, 8000], requestTimeoutMs: 500 } }),
}));

function dateTimeResponse(iso: string) {
  const d = new Date(iso);
  return {
    GetSystemDateAndTimeResponse: {
      SystemDateAndTime: {
        UTCDateTime: {
          Date: {
            Year: String(d.getUTCFullYear()),
            Month: String(d.getUTCMonth() + 1),
            Day: String(d.getUTCDate()),
          },
          Time: {
            Hour: String(d.getUTCHours()),
            Minute: String(d.getUTCMinutes()),
            Second: String(d.getUTCSeconds()),
          },
        },
      },
    },
  };
}

describe('OnvifEndpointResolver', () => {
  const now = Date.parse('2026-09-07T10:00:00.000Z');
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => jest.restoreAllMocks());

  it('uses the XAddr from WS-Discovery without probing ports', async () => {
    const call = jest.fn().mockResolvedValue(dateTimeResponse('2026-09-07T10:00:00.000Z'));
    const endpoint = await new OnvifEndpointResolver({ call } as never).resolve(
      '192.168.10.51',
      'http://192.168.10.51:8899/onvif/device_service',
    );
    expect(endpoint?.xaddr).toBe('http://192.168.10.51:8899/onvif/device_service');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('reports the device clock offset when the camera clock is skewed', async () => {
    const call = jest.fn().mockResolvedValue(dateTimeResponse('2026-09-07T11:00:00.000Z'));
    const endpoint = await new OnvifEndpointResolver({ call } as never).resolve(
      '192.168.10.51',
      'http://192.168.10.51/onvif/device_service',
    );
    expect(endpoint?.deviceTimeOffsetMs).toBe(3_600_000);
  });

  it('falls back to the candidate ports and returns the first that answers', async () => {
    const call = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(dateTimeResponse('2026-09-07T10:00:00.000Z'));
    const endpoint = await new OnvifEndpointResolver({ call } as never).resolve(
      '192.168.10.51',
    );
    expect(endpoint?.xaddr).toBe('http://192.168.10.51:8000/onvif/device_service');
  });

  it('returns undefined when nothing answers', async () => {
    const call = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(
      await new OnvifEndpointResolver({ call } as never).resolve('192.168.10.51'),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifEndpoint.resolver.spec`
Expected: FAIL — module not found

- [ ] **Step 3: Create the shared ONVIF types**

Create `src/modules/videoDevices/infra/deviceAccess/onvif/onvif.types.ts`:

```ts
export interface OnvifEndpoint {
  xaddr: string;
  deviceTimeOffsetMs: number;
}

export interface OnvifDeviceInformation {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface OnvifService {
  namespace: string;
  xaddr: string;
}

export interface OnvifResolution {
  width: number;
  height: number;
}

export interface OnvifProfile {
  token: string;
  name?: string;
  resolution?: OnvifResolution;
  hasAudio: boolean;
  hasPtz: boolean;
  streamUri?: string;
}
```

- [ ] **Step 4: Write the resolver**

Create `src/modules/videoDevices/infra/deviceAccess/onvif/onvifEndpoint.resolver.ts`:

```ts
import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { OnvifSoapClient } from './onvifSoap.client';
import { OnvifEndpoint } from './onvif.types';

const GET_SYSTEM_DATE_AND_TIME =
  '<GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>';

@Injectable()
export class OnvifEndpointResolver {
  constructor(private readonly soap: OnvifSoapClient) {}

  async resolve(
    ipAddress: string,
    knownXaddr?: string,
  ): Promise<OnvifEndpoint | undefined> {
    const candidates = knownXaddr
      ? [knownXaddr]
      : AppConfig().onvif.candidatePorts.map(
          (port: number) =>
            `http://${ipAddress}:${port}/onvif/device_service`.replace(':80/', '/'),
        );
    for (const xaddr of candidates) {
      try {
        // Unauthenticated by ONVIF spec: proves the endpoint and yields the
        // device clock needed to build a valid Created timestamp later.
        const body = await this.soap.call(xaddr, GET_SYSTEM_DATE_AND_TIME);
        const deviceTime = readUtcDateTime(body);
        if (deviceTime === undefined) continue;
        return { xaddr, deviceTimeOffsetMs: deviceTime - Date.now() };
      } catch {
        // Try the next candidate; an unreachable port is expected.
      }
    }
    return undefined;
  }
}

function readUtcDateTime(body: Record<string, any>): number | undefined {
  const utc =
    body?.GetSystemDateAndTimeResponse?.SystemDateAndTime?.UTCDateTime;
  const date = utc?.Date;
  const time = utc?.Time;
  if (!date || !time) return undefined;
  const value = Date.UTC(
    Number(date.Year),
    Number(date.Month) - 1,
    Number(date.Day),
    Number(time.Hour),
    Number(time.Minute),
    Number(time.Second ?? 0),
  );
  return Number.isNaN(value) ? undefined : value;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- onvifEndpoint.resolver.spec`
Expected: PASS, 4 tests

- [ ] **Step 6: Wire into the module**

Add `OnvifEndpointResolver` to the `services` array in `videoDevices.module.ts` with its import.

- [ ] **Step 7: Commit**

```bash
git add src/modules/videoDevices/infra/deviceAccess/onvif/onvif.types.ts \
        src/modules/videoDevices/infra/deviceAccess/onvif/onvifEndpoint.resolver.ts \
        src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifEndpoint.resolver.spec.ts \
        src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(onvif): resolve device endpoint and measure clock offset"
```

---

### Task 5: ONVIF device service

**Files:**
- Create: `src/modules/videoDevices/infra/deviceAccess/onvif/onvifDevice.service.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifDevice.service.spec.ts`

**Interfaces:**
- Consumes: `OnvifSoapClient.call`, `OnvifCredentials`, `OnvifEndpoint`, `OnvifDeviceInformation`, `OnvifService`
- Produces: `OnvifDeviceService.getDeviceInformation(endpoint, credentials): Promise<OnvifDeviceInformation>`; `.getServices(endpoint, credentials): Promise<OnvifService[]>`; `.getMacAddress(endpoint, credentials): Promise<string | undefined>`

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifDevice.service.spec.ts`:

```ts
import { OnvifDeviceService } from '../../../../infra/deviceAccess/onvif/onvifDevice.service';

const ENDPOINT = { xaddr: 'http://192.168.10.51/onvif/device_service', deviceTimeOffsetMs: 0 };
const CREDS = { username: 'admin', password: 'secret' };

describe('OnvifDeviceService', () => {
  it('maps GetDeviceInformation into a device information record', async () => {
    const call = jest.fn().mockResolvedValue({
      GetDeviceInformationResponse: {
        Manufacturer: 'ACME',
        Model: 'IPC-1234',
        FirmwareVersion: 'V5.7.3',
        SerialNumber: 'SN12345678',
        HardwareId: 'HW-9',
      },
    });
    expect(
      await new OnvifDeviceService({ call } as never).getDeviceInformation(ENDPOINT, CREDS),
    ).toEqual({
      manufacturer: 'ACME',
      model: 'IPC-1234',
      firmwareVersion: 'V5.7.3',
      serialNumber: 'SN12345678',
      hardwareId: 'HW-9',
    });
  });

  it('normalizes a single service into an array', async () => {
    const call = jest.fn().mockResolvedValue({
      GetServicesResponse: {
        Service: {
          Namespace: 'http://www.onvif.org/ver20/media/wsdl',
          XAddr: 'http://192.168.10.51/onvif/media2',
        },
      },
    });
    const services = await new OnvifDeviceService({ call } as never).getServices(ENDPOINT, CREDS);
    expect(services).toEqual([
      {
        namespace: 'http://www.onvif.org/ver20/media/wsdl',
        xaddr: 'http://192.168.10.51/onvif/media2',
      },
    ]);
  });

  it('returns the first non-empty hardware address, normalized', async () => {
    const call = jest.fn().mockResolvedValue({
      GetNetworkInterfacesResponse: {
        NetworkInterfaces: [
          { Info: { HwAddress: '' } },
          { Info: { HwAddress: 'aa-bb-cc-dd-ee-ff' } },
        ],
      },
    });
    expect(
      await new OnvifDeviceService({ call } as never).getMacAddress(ENDPOINT, CREDS),
    ).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('returns undefined when no interface reports a usable address', async () => {
    const call = jest.fn().mockResolvedValue({
      GetNetworkInterfacesResponse: { NetworkInterfaces: { Info: { HwAddress: 'nonsense' } } },
    });
    expect(
      await new OnvifDeviceService({ call } as never).getMacAddress(ENDPOINT, CREDS),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifDevice.service.spec`
Expected: FAIL — module not found

- [ ] **Step 3: Write the service**

Create `src/modules/videoDevices/infra/deviceAccess/onvif/onvifDevice.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { normalizeMacAddress } from '../../networkScanner/cidr';
import { OnvifSoapClient } from './onvifSoap.client';
import { OnvifCredentials } from './onvifSecurity';
import {
  OnvifDeviceInformation,
  OnvifEndpoint,
  OnvifService,
} from './onvif.types';

const DEVICE_NS = 'http://www.onvif.org/ver10/device/wsdl';

@Injectable()
export class OnvifDeviceService {
  constructor(private readonly soap: OnvifSoapClient) {}

  async getDeviceInformation(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
  ): Promise<OnvifDeviceInformation> {
    const body = await this.request(
      endpoint,
      credentials,
      `<GetDeviceInformation xmlns="${DEVICE_NS}"/>`,
    );
    const response = body?.GetDeviceInformationResponse ?? {};
    return {
      manufacturer: text(response.Manufacturer),
      model: text(response.Model),
      firmwareVersion: text(response.FirmwareVersion),
      serialNumber: text(response.SerialNumber),
      hardwareId: text(response.HardwareId),
    };
  }

  async getServices(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
  ): Promise<OnvifService[]> {
    const body = await this.request(
      endpoint,
      credentials,
      `<GetServices xmlns="${DEVICE_NS}"><IncludeCapability>false</IncludeCapability></GetServices>`,
    );
    return asArray(body?.GetServicesResponse?.Service)
      .map((service) => ({
        namespace: text(service?.Namespace) ?? '',
        xaddr: text(service?.XAddr) ?? '',
      }))
      .filter((service) => service.namespace && service.xaddr);
  }

  async getMacAddress(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
  ): Promise<string | undefined> {
    const body = await this.request(
      endpoint,
      credentials,
      `<GetNetworkInterfaces xmlns="${DEVICE_NS}"/>`,
    );
    for (const item of asArray(body?.GetNetworkInterfacesResponse?.NetworkInterfaces)) {
      const raw = text(item?.Info?.HwAddress);
      if (!raw) continue;
      try {
        return normalizeMacAddress(raw);
      } catch {
        // Some devices report a placeholder here; keep looking.
      }
    }
    return undefined;
  }

  private request(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
    bodyXml: string,
  ): Promise<Record<string, any>> {
    return this.soap.call(endpoint.xaddr, bodyXml, {
      credentials,
      deviceTimeOffsetMs: endpoint.deviceTimeOffsetMs,
    });
  }
}

export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onvifDevice.service.spec`
Expected: PASS, 4 tests

- [ ] **Step 5: Wire into the module and commit**

Add `OnvifDeviceService` to the `services` array with its import, then:

```bash
git add src/modules/videoDevices/infra/deviceAccess/onvif/onvifDevice.service.ts \
        src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifDevice.service.spec.ts \
        src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(onvif): read device information, services and MAC address"
```

---

### Task 6: ONVIF media service and stream mapping

**Files:**
- Create: `src/modules/videoDevices/infra/deviceAccess/onvif/onvifMedia.service.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifMedia.service.spec.ts`

**Interfaces:**
- Consumes: `OnvifSoapClient.call`, `asArray`, `text` from `./onvifDevice.service`, `OnvifProfile`
- Produces: `OnvifMediaService.getProfiles(endpoint, credentials, mediaXaddr, useMedia2): Promise<OnvifProfile[]>`; `toStreams(profiles: OnvifProfile[]): StreamsProps | undefined`

**Stream URI convention (decide once, used by every later phase):** `StreamsProps.*.path` stores the **full RTSP URI with any embedded credentials stripped**, e.g. `rtsp://192.168.10.51:554/Streaming/Channels/101`. Not the path component — vendors return non-standard RTSP ports, and the camera's `port` field is the ONVIF port, not the RTSP one. Credentials are injected by consumers (Frigate, MediaMTX) at use time.

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifMedia.service.spec.ts`:

```ts
import {
  OnvifMediaService,
  toStreams,
} from '../../../../infra/deviceAccess/onvif/onvifMedia.service';

const ENDPOINT = { xaddr: 'http://192.168.10.51/onvif/device_service', deviceTimeOffsetMs: 0 };
const CREDS = { username: 'admin', password: 'secret' };
const MEDIA = 'http://192.168.10.51/onvif/media';

describe('OnvifMediaService.getProfiles', () => {
  it('maps profiles, detecting audio and PTZ, and attaches stream URIs', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({
        GetProfilesResponse: {
          Profiles: [
            {
              token: 'main',
              Name: 'MainStream',
              VideoEncoderConfiguration: { Resolution: { Width: '2560', Height: '1440' } },
              AudioEncoderConfiguration: { Name: 'A' },
              PTZConfiguration: { Name: 'P' },
            },
            {
              token: 'sub',
              Name: 'SubStream',
              VideoEncoderConfiguration: { Resolution: { Width: '640', Height: '360' } },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        GetStreamUriResponse: {
          MediaUri: { Uri: 'rtsp://admin:secret@192.168.10.51:554/Streaming/Channels/101' },
        },
      })
      .mockResolvedValueOnce({
        GetStreamUriResponse: {
          MediaUri: { Uri: 'rtsp://192.168.10.51:554/Streaming/Channels/102' },
        },
      });

    const profiles = await new OnvifMediaService({ call } as never).getProfiles(
      ENDPOINT,
      CREDS,
      MEDIA,
      false,
    );

    expect(profiles).toEqual([
      {
        token: 'main',
        name: 'MainStream',
        resolution: { width: 2560, height: 1440 },
        hasAudio: true,
        hasPtz: true,
        streamUri: 'rtsp://192.168.10.51:554/Streaming/Channels/101',
      },
      {
        token: 'sub',
        name: 'SubStream',
        resolution: { width: 640, height: 360 },
        hasAudio: false,
        hasPtz: false,
        streamUri: 'rtsp://192.168.10.51:554/Streaming/Channels/102',
      },
    ]);
  });

  it('keeps a profile whose stream URI cannot be read', async () => {
    const call = jest
      .fn()
      .mockResolvedValueOnce({
        GetProfilesResponse: { Profiles: { token: 'only', Name: 'Only' } },
      })
      .mockRejectedValueOnce(new Error('not supported'));
    const profiles = await new OnvifMediaService({ call } as never).getProfiles(
      ENDPOINT,
      CREDS,
      MEDIA,
      false,
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].streamUri).toBeUndefined();
  });
});

describe('toStreams', () => {
  const main = {
    token: 'main',
    resolution: { width: 2560, height: 1440 },
    hasAudio: true,
    hasPtz: false,
    streamUri: 'rtsp://cam/main',
  };
  const sub = {
    token: 'sub',
    resolution: { width: 640, height: 360 },
    hasAudio: false,
    hasPtz: false,
    streamUri: 'rtsp://cam/sub',
  };

  it('maps the largest profile to record and the smallest to live', () => {
    expect(toStreams([sub, main])).toEqual({
      recordStream: {
        token: 'main',
        path: 'rtsp://cam/main',
        resolutions: [{ width: 2560, height: 1440 }],
      },
      liveStream: {
        token: 'sub',
        path: 'rtsp://cam/sub',
        resolutions: [{ width: 640, height: 360 }],
      },
    });
  });

  it('uses the single profile for both roles when only one exists', () => {
    const streams = toStreams([main]);
    expect(streams?.recordStream.token).toBe('main');
    expect(streams?.liveStream.token).toBe('main');
  });

  it('returns undefined when no profile has a stream URI', () => {
    expect(toStreams([{ ...main, streamUri: undefined }])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifMedia.service.spec`
Expected: FAIL — module not found

- [ ] **Step 3: Write the service**

Create `src/modules/videoDevices/infra/deviceAccess/onvif/onvifMedia.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { StreamsProps } from '../../../domain/camera/valueObjects/streams.vo';
import { OnvifSoapClient } from './onvifSoap.client';
import { OnvifCredentials } from './onvifSecurity';
import { OnvifEndpoint, OnvifProfile } from './onvif.types';
import { asArray, text } from './onvifDevice.service';

const MEDIA10 = 'http://www.onvif.org/ver10/media/wsdl';
const MEDIA20 = 'http://www.onvif.org/ver20/media/wsdl';
const SCHEMA = 'http://www.onvif.org/ver10/schema';

@Injectable()
export class OnvifMediaService {
  constructor(private readonly soap: OnvifSoapClient) {}

  async getProfiles(
    endpoint: OnvifEndpoint,
    credentials: OnvifCredentials,
    mediaXaddr: string,
    useMedia2: boolean,
  ): Promise<OnvifProfile[]> {
    const ns = useMedia2 ? MEDIA20 : MEDIA10;
    const body = await this.call(
      mediaXaddr,
      credentials,
      endpoint,
      useMedia2
        ? `<GetProfiles xmlns="${ns}"><Type>All</Type></GetProfiles>`
        : `<GetProfiles xmlns="${ns}"/>`,
    );
    const raw = asArray(
      body?.GetProfilesResponse?.Profiles ?? body?.GetProfilesResponse?.Profile,
    );
    const profiles: OnvifProfile[] = [];
    for (const item of raw) {
      const token = text(item?.token);
      if (!token) continue;
      const resolution =
        item?.VideoEncoderConfiguration?.Resolution ??
        item?.Configurations?.VideoEncoder?.Resolution;
      profiles.push({
        token,
        name: text(item?.Name),
        ...(resolution
          ? {
              resolution: {
                width: Number(resolution.Width),
                height: Number(resolution.Height),
              },
            }
          : {}),
        hasAudio: Boolean(
          item?.AudioEncoderConfiguration ?? item?.Configurations?.AudioEncoder,
        ),
        hasPtz: Boolean(item?.PTZConfiguration ?? item?.Configurations?.PTZ),
        streamUri: await this.getStreamUri(
          mediaXaddr,
          credentials,
          endpoint,
          token,
          useMedia2,
        ),
      });
    }
    return profiles;
  }

  private async getStreamUri(
    mediaXaddr: string,
    credentials: OnvifCredentials,
    endpoint: OnvifEndpoint,
    profileToken: string,
    useMedia2: boolean,
  ): Promise<string | undefined> {
    const bodyXml = useMedia2
      ? `<GetStreamUri xmlns="${MEDIA20}"><Protocol>RTSP</Protocol>` +
        `<ProfileToken>${profileToken}</ProfileToken></GetStreamUri>`
      : `<GetStreamUri xmlns="${MEDIA10}"><StreamSetup>` +
        `<Stream xmlns="${SCHEMA}">RTP-Unicast</Stream>` +
        `<Transport xmlns="${SCHEMA}"><Protocol>RTSP</Protocol></Transport>` +
        `</StreamSetup><ProfileToken>${profileToken}</ProfileToken></GetStreamUri>`;
    try {
      const body = await this.call(mediaXaddr, credentials, endpoint, bodyXml);
      const uri =
        text(body?.GetStreamUriResponse?.MediaUri?.Uri) ??
        text(body?.GetStreamUriResponse?.Uri);
      return uri ? stripCredentials(uri) : undefined;
    } catch {
      // A profile without a readable stream URI is still worth reporting.
      return undefined;
    }
  }

  private call(
    xaddr: string,
    credentials: OnvifCredentials,
    endpoint: OnvifEndpoint,
    bodyXml: string,
  ): Promise<Record<string, any>> {
    return this.soap.call(xaddr, bodyXml, {
      credentials,
      deviceTimeOffsetMs: endpoint.deviceTimeOffsetMs,
    });
  }
}

// Some devices echo the credentials back inside the stream URI. Storing them
// would duplicate secrets into every consumer's config file.
export function stripCredentials(uri: string): string {
  return uri.replace(/^(rtsps?:\/\/)[^/@]*@/i, '$1');
}

export function toStreams(profiles: OnvifProfile[]): StreamsProps | undefined {
  const usable = profiles.filter((profile) => profile.streamUri);
  if (usable.length === 0) return undefined;
  const sorted = [...usable].sort((a, b) => area(b) - area(a));
  const record = sorted[0];
  const live = sorted[sorted.length - 1];
  return {
    recordStream: {
      token: record.token,
      path: record.streamUri!,
      resolutions: record.resolution ? [record.resolution] : [],
    },
    liveStream: {
      token: live.token,
      path: live.streamUri!,
      resolutions: live.resolution ? [live.resolution] : [],
    },
  } as StreamsProps;
}

function area(profile: OnvifProfile): number {
  if (!profile.resolution) return 0;
  return profile.resolution.width * profile.resolution.height;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onvifMedia.service.spec`
Expected: PASS, 5 tests

- [ ] **Step 5: Wire into the module and commit**

Add `OnvifMediaService` to the `services` array with its import, then:

```bash
git add src/modules/videoDevices/infra/deviceAccess/onvif/onvifMedia.service.ts \
        src/modules/videoDevices/tests/infra/deviceAccess/onvif/onvifMedia.service.spec.ts \
        src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(onvif): read media profiles and map them to camera streams"
```

---

### Task 7: Parse WS-Discovery ProbeMatch responses

**Files:**
- Modify: `src/modules/videoDevices/infra/networkScanner/onvifDiscovery.service.ts`
- Test: `src/modules/videoDevices/tests/infra/networkScanner/onvifDiscovery.parse.spec.ts`

**Interfaces:**
- Produces: `parseProbeMatches(xml: string, interfaceName: string): NetworkObservation[]`; `nameFromScopes(scopes: string[] | undefined): string | undefined`

**Why a pure function:** the current service regexes IPs out of the datagram inside the socket handler, which cannot be tested without a socket. Extracting parsing into an exported pure function makes every branch testable and leaves the socket code trivial.

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/networkScanner/onvifDiscovery.parse.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifDiscovery.parse.spec`
Expected: FAIL — `parseProbeMatches` is not exported

- [ ] **Step 3: Add the parser to the discovery service**

In `src/modules/videoDevices/infra/networkScanner/onvifDiscovery.service.ts`, add these imports at the top:

```ts
import { XMLParser } from 'fast-xml-parser';
```

and append these exports at the end of the file:

```ts
const probeParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
});

export function parseProbeMatches(
  xml: string,
  interfaceName: string,
): NetworkObservation[] {
  let parsed: Record<string, any>;
  try {
    parsed = probeParser.parse(xml) as Record<string, any>;
  } catch {
    return [];
  }
  const matches = parsed?.Envelope?.Body?.ProbeMatches?.ProbeMatch;
  if (!matches) return [];
  const observations: NetworkObservation[] = [];
  for (const match of Array.isArray(matches) ? matches : [matches]) {
    const xaddr = firstHttpXaddr(match?.XAddrs);
    if (!xaddr) continue;
    let ipAddress: string;
    try {
      ipAddress = assertIpv4(new URL(xaddr).hostname);
    } catch {
      continue;
    }
    const scopes =
      typeof match?.Scopes === 'string'
        ? match.Scopes.split(/\s+/).filter(Boolean)
        : undefined;
    const endpointReference = match?.EndpointReference?.Address;
    observations.push({
      ipAddress,
      interfaceName,
      evidence: 'onvif',
      ...(typeof endpointReference === 'string' ? { endpointReference } : {}),
      onvifXaddr: xaddr,
      ...(scopes?.length ? { scopes } : {}),
    });
  }
  return observations;
}

export function nameFromScopes(scopes: string[] | undefined): string | undefined {
  const scope = scopes?.find((entry) => entry.includes('/name/'));
  if (!scope) return undefined;
  const value = scope.slice(scope.indexOf('/name/') + '/name/'.length);
  try {
    return decodeURIComponent(value) || undefined;
  } catch {
    return value || undefined;
  }
}

function firstHttpXaddr(xaddrs: unknown): string | undefined {
  if (typeof xaddrs !== 'string') return undefined;
  for (const candidate of xaddrs.split(/\s+/).filter(Boolean)) {
    if (!/^https?:\/\//i.test(candidate)) continue;
    try {
      // IPv6 literals and hostnames are skipped: this pipeline is IPv4-only.
      assertIpv4(new URL(candidate).hostname);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Replace the socket message handler**

In the same file, replace the whole `socket.on('message', ...)` callback body with:

```ts
      socket.on('message', (message) => {
        for (const observation of parseProbeMatches(
          message.toString('utf8'),
          interfaceName,
        )) {
          // Key by endpoint reference so two devices sharing one IP are both
          // kept — that is the only channel that sees an address conflict.
          observations.set(
            observation.endpointReference ?? observation.ipAddress,
            observation,
          );
        }
      });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- onvifDiscovery.parse.spec`
Expected: PASS, 6 tests

Run: `npm test`
Expected: PASS, all suites

- [ ] **Step 6: Commit**

```bash
git add src/modules/videoDevices/infra/networkScanner/onvifDiscovery.service.ts \
        src/modules/videoDevices/tests/infra/networkScanner/onvifDiscovery.parse.spec.ts
git commit -m "feat(discovery): parse WS-Discovery scopes, XAddrs and endpoint references"
```

---

### Task 8: Conflict-tolerant merge

**Files:**
- Modify: `src/modules/videoDevices/infra/networkScanner/cameraNetworkScanner.service.ts`
- Modify: `src/modules/videoDevices/tests/infra/networkScanner/cameraNetworkScanner.service.spec.ts`

**Interfaces:**
- Consumes: `NetworkObservation`, `MergedObservation`, `DnsmasqLeaseProvider.read`
- Produces: `mergeObservations(observations: NetworkObservation[]): MergedObservation[]`; `CameraNetworkScannerService.scan(signal?): Promise<MergedObservation[]>`

**Behaviour change:** `mergeObservations` currently **throws** on an ambiguous MAC or IP. One pair of misconfigured cameras therefore makes an entire site undiscoverable (spec §5.2). It must classify instead. The existing spec asserts the throw and is rewritten here.

**Merge key:** `macAddress ?? endpointReference ?? ipAddress`. That single rule covers both conflict shapes — several MACs at one IP (ARP/lease channels) and several endpoint references at one IP (WS-Discovery, the only channel that sees colliding devices).

- [ ] **Step 1: Rewrite the existing spec**

Replace the whole contents of `src/modules/videoDevices/tests/infra/networkScanner/cameraNetworkScanner.service.spec.ts` with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cameraNetworkScanner.service.spec`
Expected: FAIL — the conflict cases throw `ambiguous MAC addresses for 192.168.1.21`

- [ ] **Step 3: Replace mergeObservations**

In `src/modules/videoDevices/infra/networkScanner/cameraNetworkScanner.service.ts`, replace the entire exported `mergeObservations` function with:

```ts
export function mergeObservations(
  observations: NetworkObservation[],
): MergedObservation[] {
  const byKey = new Map<string, MergedObservation>();
  for (const observation of observations) {
    // One rule covers both conflict shapes: several MACs at one address, and
    // several ONVIF endpoint references at one address.
    const key =
      observation.macAddress ??
      observation.endpointReference ??
      observation.ipAddress;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ipAddress: observation.ipAddress,
        interfaceName: observation.interfaceName,
        evidence: [observation.evidence],
        ...(observation.macAddress ? { macAddress: observation.macAddress } : {}),
        ...(observation.endpointReference
          ? { endpointReference: observation.endpointReference }
          : {}),
        ...(observation.onvifXaddr ? { onvifXaddr: observation.onvifXaddr } : {}),
        ...(observation.hostname ? { hostname: observation.hostname } : {}),
        ...(observation.scopes ? { scopes: observation.scopes } : {}),
      });
      continue;
    }
    if (!existing.evidence.includes(observation.evidence)) {
      existing.evidence.push(observation.evidence);
    }
    existing.macAddress ??= observation.macAddress;
    existing.endpointReference ??= observation.endpointReference;
    existing.onvifXaddr ??= observation.onvifXaddr;
    existing.hostname ??= observation.hostname;
    existing.scopes ??= observation.scopes;
    if (existing.ipAddress !== observation.ipAddress) {
      // The lease file is authoritative; anything else may be a stale entry.
      existing.multiHomed = true;
      if (observation.evidence === 'lease') existing.ipAddress = observation.ipAddress;
    }
  }

  const merged = [...byKey.values()];
  joinOnvifOnlyEntries(merged);
  markAddressConflicts(merged);
  return merged;
}

// A WS-Discovery observation carries no MAC, so it lands under its endpoint
// reference. When exactly one MAC-keyed device holds that address, they are the
// same device and the ONVIF details belong to it.
function joinOnvifOnlyEntries(merged: MergedObservation[]): void {
  for (const entry of [...merged]) {
    if (entry.macAddress || !entry.endpointReference) continue;
    const withMac = merged.filter(
      (other) => other.ipAddress === entry.ipAddress && other.macAddress,
    );
    if (withMac.length !== 1) continue;
    const target = withMac[0];
    target.endpointReference ??= entry.endpointReference;
    target.onvifXaddr ??= entry.onvifXaddr;
    target.scopes ??= entry.scopes;
    for (const evidence of entry.evidence) {
      if (!target.evidence.includes(evidence)) target.evidence.push(evidence);
    }
    merged.splice(merged.indexOf(entry), 1);
  }
}

function markAddressConflicts(merged: MergedObservation[]): void {
  const byAddress = new Map<string, MergedObservation[]>();
  for (const entry of merged) {
    const group = byAddress.get(entry.ipAddress) ?? [];
    group.push(entry);
    byAddress.set(entry.ipAddress, group);
  }
  for (const group of byAddress.values()) {
    if (group.length < 2) continue;
    const macAddresses = group
      .map((entry) => entry.macAddress)
      .filter((mac): mac is string => Boolean(mac))
      .sort();
    const endpointReferences = group
      .map((entry) => entry.endpointReference)
      .filter((epr): epr is string => Boolean(epr))
      .sort();
    for (const entry of group) {
      if (macAddresses.length) entry.conflictMacAddresses = [...macAddresses];
      if (endpointReferences.length) {
        entry.conflictEndpointReferences = [...endpointReferences];
      }
    }
  }
}
```

- [ ] **Step 4: Update the scan method**

In the same file: change the `scan` return type to `Promise<MergedObservation[]>`, update the imports to pull `MergedObservation` instead of `CameraNetworkObservation`, and add the lease channel as the first source inside the per-network loop, before the neighbour read:

```ts
      const leaseObservations = await this.leaseProvider.read(network.interfaceName);
      observations.push(
        ...leaseObservations.filter((observation) =>
          isUsableAddressOnNetwork(observation.ipAddress, network),
        ),
      );
```

Add `DnsmasqLeaseProvider` as the first constructor parameter:

```ts
    private readonly leaseProvider: DnsmasqLeaseProvider,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- cameraNetworkScanner.service.spec`
Expected: PASS, 5 tests

Run: `npm test`
Expected: PASS, all suites

- [ ] **Step 6: Commit**

```bash
git add src/modules/videoDevices/infra/networkScanner/cameraNetworkScanner.service.ts \
        src/modules/videoDevices/tests/infra/networkScanner/cameraNetworkScanner.service.spec.ts
git commit -m "fix(discovery): report address conflicts instead of aborting the scan"
```

---

### Task 9: `discoveredCameras` cache

**Files:**
- Create: `src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.types.ts`
- Create: `src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.schema.ts`
- Create: `src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.repository.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/infra/discoveredCamera/discoveredCamera.repository.spec.ts`

**Interfaces:**
- Consumes: `DiscoveredCameraStatus`, `DiscoveryEvidence` from `networkScanner.types`; `StreamsProps`
- Produces: `DiscoveredCamera` interface; `DiscoveredCameraRepository.upsertMany(cameras: DiscoveredCamera[]): Promise<void>`; `.findAllFresh(): Promise<DiscoveredCamera[]>`

**Never deletes on scan.** A camera missing from one scan keeps its last known capabilities and is aged by `lastSeenAt` (spec §16.1). A transient scan failure must not erase a site's inventory.

**Test approach:** the repository is thin, and neither Testcontainers nor `mongodb-memory-server` is a dependency of this repo. Unit-test it against a mocked Mongoose model, matching the collaborator-mocking style used by the existing specs. An integration test belongs with phase 3, where `register` actually reads this collection.

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/infra/discoveredCamera/discoveredCamera.repository.spec.ts`:

```ts
import { DiscoveredCameraRepository } from '../../../infra/discoveredCamera/discoveredCamera.repository';
import { DiscoveredCamera } from '../../../infra/discoveredCamera/discoveredCamera.types';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    tenantId: 'tenant-1',
    nvrId: 'nvr-1',
    onvif: { discoveryTtlMinutes: 60 },
  }),
}));

const camera: DiscoveredCamera = {
  macAddress: 'AA:BB:CC:DD:EE:FF',
  ipAddress: '192.168.10.51',
  interfaceName: 'eth1',
  status: 'ONVIF_READY',
  discoveredVia: ['lease', 'onvif'],
  manufacturer: 'ACME',
};

describe('DiscoveredCameraRepository', () => {
  it('upserts scoped by tenant, nvr and MAC address', async () => {
    const updateOne = jest.fn().mockResolvedValue(undefined);
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([camera]);

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({
      tenantId: 'tenant-1',
      nvrId: 'nvr-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
    });
    expect(update.$set.manufacturer).toBe('ACME');
    expect(update.$set.lastSeenAt).toBeInstanceOf(Date);
    expect(options).toEqual({ upsert: true });
  });

  it('falls back to the endpoint reference when no MAC is known', async () => {
    const updateOne = jest.fn().mockResolvedValue(undefined);
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([
      { ...camera, macAddress: undefined, endpointReference: 'urn:uuid:a' },
    ]);
    expect(updateOne.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-1',
      nvrId: 'nvr-1',
      endpointReference: 'urn:uuid:a',
    });
  });

  it('reads only records seen inside the freshness window', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ lean });
    await new DiscoveredCameraRepository({ find } as never).findAllFresh();

    const filter = find.mock.calls[0][0];
    expect(filter.tenantId).toBe('tenant-1');
    expect(filter.nvrId).toBe('nvr-1');
    expect(filter.lastSeenAt.$gte).toBeInstanceOf(Date);
  });

  it('skips a record with neither MAC nor endpoint reference', async () => {
    const updateOne = jest.fn();
    await new DiscoveredCameraRepository({ updateOne } as never).upsertMany([
      { ...camera, macAddress: undefined },
    ]);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- discoveredCamera.repository.spec`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types**

Create `src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.types.ts`:

```ts
import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';
import {
  DiscoveredCameraStatus,
  DiscoveryEvidence,
} from '../networkScanner/networkScanner.types';

export interface DiscoveredCamera {
  macAddress?: string;
  endpointReference?: string;
  ipAddress: string;
  interfaceName: string;
  status: DiscoveredCameraStatus;
  discoveredVia: DiscoveryEvidence[];
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  onvifXaddr?: string;
  suggestedName?: string;
  hasPtz?: boolean;
  hasAudio?: boolean;
  streams?: StreamsProps;
  multiHomed?: boolean;
  conflictMacAddresses?: string[];
  conflictEndpointReferences?: string[];
}
```

- [ ] **Step 4: Write the schema**

Create `src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.schema.ts`:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { StreamsProps } from '../../domain/camera/valueObjects/streams.vo';

@Schema({ collection: 'discoveredCameras' })
export class DiscoveredCameraModel {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  nvrId!: string;

  @Prop()
  macAddress?: string;

  @Prop()
  endpointReference?: string;

  @Prop({ required: true })
  ipAddress!: string;

  @Prop({ required: true })
  interfaceName!: string;

  @Prop({ required: true })
  status!: string;

  @Prop({ type: [String], default: [] })
  discoveredVia!: string[];

  @Prop() manufacturer?: string;
  @Prop() model?: string;
  @Prop() firmwareVersion?: string;
  @Prop() serialNumber?: string;
  @Prop() hardwareId?: string;
  @Prop() onvifXaddr?: string;
  @Prop() suggestedName?: string;
  @Prop() hasPtz?: boolean;
  @Prop() hasAudio?: boolean;
  @Prop() multiHomed?: boolean;

  @Prop({ type: StreamsProps })
  streams?: StreamsProps;

  @Prop({ type: [String], default: [] })
  conflictMacAddresses!: string[];

  @Prop({ type: [String], default: [] })
  conflictEndpointReferences!: string[];

  @Prop({ required: true })
  lastSeenAt!: Date;
}

export const DiscoveredCameraSchema = SchemaFactory.createForClass(
  DiscoveredCameraModel,
);
// Sparse: a colliding device has no resolvable MAC and is keyed by endpoint
// reference instead, so several such records legitimately have no macAddress.
DiscoveredCameraSchema.index(
  { tenantId: 1, nvrId: 1, macAddress: 1 },
  { unique: true, sparse: true },
);
DiscoveredCameraSchema.index(
  { tenantId: 1, nvrId: 1, endpointReference: 1 },
  { unique: true, sparse: true },
);
```

- [ ] **Step 5: Write the repository**

Create `src/modules/videoDevices/infra/discoveredCamera/discoveredCamera.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import AppConfig from 'configs/app.config';
import { DiscoveredCameraModel } from './discoveredCamera.schema';
import { DiscoveredCamera } from './discoveredCamera.types';

@Injectable()
export class DiscoveredCameraRepository {
  constructor(
    @InjectModel(DiscoveredCameraModel.name)
    private readonly model: Model<DiscoveredCameraModel>,
  ) {}

  async upsertMany(cameras: DiscoveredCamera[]): Promise<void> {
    for (const camera of cameras) {
      const key = this.identityFilter(camera);
      if (!key) continue;
      await this.model.updateOne(
        key,
        { $set: { ...camera, ...key, lastSeenAt: new Date() } },
        { upsert: true },
      );
    }
  }

  async findAllFresh(): Promise<DiscoveredCamera[]> {
    const since = new Date(
      Date.now() - AppConfig().onvif.discoveryTtlMinutes * 60_000,
    );
    return (await this.model
      .find({ ...this.scope(), lastSeenAt: { $gte: since } })
      .lean()) as unknown as DiscoveredCamera[];
  }

  private identityFilter(
    camera: DiscoveredCamera,
  ): Record<string, string> | undefined {
    if (camera.macAddress) {
      return { ...this.scope(), macAddress: camera.macAddress };
    }
    if (camera.endpointReference) {
      return { ...this.scope(), endpointReference: camera.endpointReference };
    }
    // Nothing stable to key on; a record we could never resolve later is worse
    // than no record.
    return undefined;
  }

  private scope(): { tenantId: string; nvrId: string } {
    return { tenantId: AppConfig().tenantId, nvrId: AppConfig().nvrId };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- discoveredCamera.repository.spec`
Expected: PASS, 4 tests

- [ ] **Step 7: Wire into the module**

In `videoDevices.module.ts` add the model to the existing `MongooseModule.forFeature` array and `DiscoveredCameraRepository` to `services`:

```ts
      { name: DiscoveredCameraModel.name, schema: DiscoveredCameraSchema },
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/videoDevices/infra/discoveredCamera \
        src/modules/videoDevices/tests/infra/discoveredCamera \
        src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(discovery): add discoveredCameras cache"
```

---

### Task 10: Capability probe and discovery orchestrator

**Files:**
- Create: `src/modules/videoDevices/applicationService/services/discovery/onvifCapabilityProbe.service.ts`
- Create: `src/modules/videoDevices/applicationService/services/discovery/cameraDiscovery.service.ts`
- Modify: `src/modules/videoDevices/videoDevices.module.ts`
- Test: `src/modules/videoDevices/tests/applicationService/services/discovery/onvifCapabilityProbe.service.spec.ts`

**Interfaces:**
- Consumes: `OnvifEndpointResolver.resolve`, `OnvifDeviceService.*`, `OnvifMediaService.getProfiles`, `toStreams`, `nameFromScopes`, `CameraNetworkScannerService.scan`, `DiscoveredCameraRepository.upsertMany`
- Produces: `OnvifCapabilityProbe.probe(observation: MergedObservation): Promise<DiscoveredCamera>`; `CameraDiscoveryService.discover(signal?: AbortSignal): Promise<DiscoveredCamera[]>`

**Never throws per device.** Every failure becomes a status. A conflicted address is returned without probing at all — ONVIF calls are unicast TCP to an ambiguous address and would reach an arbitrary device (spec §5.3).

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/applicationService/services/discovery/onvifCapabilityProbe.service.spec.ts`:

```ts
import { OnvifCapabilityProbe } from '../../../../applicationService/services/discovery/onvifCapabilityProbe.service';
import { MergedObservation } from '../../../../infra/networkScanner/networkScanner.types';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({
    onvif: {
      defaultCredentials: [
        { username: 'admin', password: 'wrong' },
        { username: 'admin', password: 'right' },
      ],
    },
  }),
}));

const observation: MergedObservation = {
  ipAddress: '192.168.10.51',
  macAddress: 'AA:BB:CC:DD:EE:FF',
  interfaceName: 'eth1',
  evidence: ['lease', 'onvif'],
  onvifXaddr: 'http://192.168.10.51/onvif/device_service',
  scopes: ['onvif://www.onvif.org/name/Lobby'],
};

const endpoint = { xaddr: observation.onvifXaddr!, deviceTimeOffsetMs: 0 };

function build(overrides: {
  resolve?: jest.Mock;
  device?: Partial<Record<string, jest.Mock>>;
  media?: jest.Mock;
}) {
  return new OnvifCapabilityProbe(
    { resolve: overrides.resolve ?? jest.fn().mockResolvedValue(endpoint) } as never,
    {
      getDeviceInformation:
        overrides.device?.getDeviceInformation ??
        jest.fn().mockResolvedValue({ manufacturer: 'ACME', model: 'IPC-1234' }),
      getServices:
        overrides.device?.getServices ??
        jest.fn().mockResolvedValue([
          { namespace: 'http://www.onvif.org/ver10/media/wsdl', xaddr: 'http://cam/media' },
        ]),
      getMacAddress:
        overrides.device?.getMacAddress ?? jest.fn().mockResolvedValue('AA:BB:CC:DD:EE:FF'),
    } as never,
    { getProfiles: overrides.media ?? jest.fn().mockResolvedValue([]) } as never,
  );
}

describe('OnvifCapabilityProbe', () => {
  it('reports a conflicted address without probing it', async () => {
    const resolve = jest.fn();
    const result = await build({ resolve }).probe({
      ...observation,
      conflictMacAddresses: ['AA:BB:CC:00:00:01', 'AA:BB:CC:00:00:02'],
    });
    expect(result.status).toBe('IP_CONFLICT');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('reports ONVIF_UNREACHABLE when no endpoint answers', async () => {
    const result = await build({ resolve: jest.fn().mockResolvedValue(undefined) }).probe(
      observation,
    );
    expect(result.status).toBe('ONVIF_UNREACHABLE');
  });

  it('tries each credential in order and records success', async () => {
    const getDeviceInformation = jest
      .fn()
      .mockRejectedValueOnce(new Error('not authorized'))
      .mockResolvedValueOnce({ manufacturer: 'ACME', firmwareVersion: 'V5.7.3' });
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(getDeviceInformation).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ONVIF_READY');
    expect(result.firmwareVersion).toBe('V5.7.3');
  });

  it('reports AUTH_FAILED when no credential works', async () => {
    const getDeviceInformation = jest.fn().mockRejectedValue(new Error('not authorized'));
    const result = await build({ device: { getDeviceInformation } }).probe(observation);
    expect(result.status).toBe('AUTH_FAILED');
    expect(result.macAddress).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('derives name, PTZ, audio and streams from the media profiles', async () => {
    const media = jest.fn().mockResolvedValue([
      {
        token: 'main',
        resolution: { width: 2560, height: 1440 },
        hasAudio: true,
        hasPtz: true,
        streamUri: 'rtsp://cam/main',
      },
      {
        token: 'sub',
        resolution: { width: 640, height: 360 },
        hasAudio: false,
        hasPtz: false,
        streamUri: 'rtsp://cam/sub',
      },
    ]);
    const result = await build({ media }).probe(observation);
    expect(result.suggestedName).toBe('Lobby');
    expect(result.hasPtz).toBe(true);
    expect(result.hasAudio).toBe(true);
    expect(result.streams?.recordStream.token).toBe('main');
    expect(result.streams?.liveStream.token).toBe('sub');
  });

  it('still returns a record when the media service fails', async () => {
    const media = jest.fn().mockRejectedValue(new Error('media unavailable'));
    const result = await build({ media }).probe(observation);
    expect(result.status).toBe('ONVIF_READY');
    expect(result.streams).toBeUndefined();
    expect(result.manufacturer).toBe('ACME');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onvifCapabilityProbe.service.spec`
Expected: FAIL — module not found

- [ ] **Step 3: Write the probe**

Create `src/modules/videoDevices/applicationService/services/discovery/onvifCapabilityProbe.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { OnvifEndpointResolver } from '../../../infra/deviceAccess/onvif/onvifEndpoint.resolver';
import { OnvifDeviceService } from '../../../infra/deviceAccess/onvif/onvifDevice.service';
import {
  OnvifMediaService,
  toStreams,
} from '../../../infra/deviceAccess/onvif/onvifMedia.service';
import { OnvifCredentials } from '../../../infra/deviceAccess/onvif/onvifSecurity';
import {
  OnvifDeviceInformation,
  OnvifEndpoint,
} from '../../../infra/deviceAccess/onvif/onvif.types';
import { nameFromScopes } from '../../../infra/networkScanner/onvifDiscovery.service';
import { MergedObservation } from '../../../infra/networkScanner/networkScanner.types';
import { DiscoveredCamera } from '../../../infra/discoveredCamera/discoveredCamera.types';

const MEDIA10 = 'http://www.onvif.org/ver10/media/wsdl';
const MEDIA20 = 'http://www.onvif.org/ver20/media/wsdl';

@Injectable()
export class OnvifCapabilityProbe {
  constructor(
    private readonly endpointResolver: OnvifEndpointResolver,
    private readonly device: OnvifDeviceService,
    private readonly media: OnvifMediaService,
  ) {}

  async probe(observation: MergedObservation): Promise<DiscoveredCamera> {
    const base = this.baseRecord(observation);

    // Unicast ONVIF against a contested address reaches an arbitrary device,
    // so a conflict is reported rather than probed (spec §5.3).
    if (observation.conflictMacAddresses || observation.conflictEndpointReferences) {
      return { ...base, status: 'IP_CONFLICT' };
    }

    const endpoint = await this.endpointResolver.resolve(
      observation.ipAddress,
      observation.onvifXaddr,
    );
    if (!endpoint) return { ...base, status: 'ONVIF_UNREACHABLE' };

    const authenticated = await this.authenticate(endpoint);
    if (!authenticated) return { ...base, status: 'AUTH_FAILED' };

    const { credentials, information } = authenticated;
    const record: DiscoveredCamera = {
      ...base,
      status: 'ONVIF_READY',
      onvifXaddr: endpoint.xaddr,
      ...information,
    };

    try {
      record.macAddress =
        (await this.device.getMacAddress(endpoint, credentials)) ?? record.macAddress;
    } catch {
      // The scan-derived MAC stands.
    }

    try {
      const services = await this.device.getServices(endpoint, credentials);
      const media2 = services.find((service) => service.namespace === MEDIA20);
      const media1 = services.find((service) => service.namespace === MEDIA10);
      const chosen = media1 ?? media2;
      if (chosen) {
        const profiles = await this.media.getProfiles(
          endpoint,
          credentials,
          chosen.xaddr,
          chosen === media2,
        );
        record.hasPtz = profiles.some((profile) => profile.hasPtz);
        record.hasAudio = profiles.some((profile) => profile.hasAudio);
        record.streams = toStreams(profiles);
      }
    } catch {
      // Capabilities are best-effort: identity is still worth reporting.
    }

    return record;
  }

  private async authenticate(
    endpoint: OnvifEndpoint,
  ): Promise<
    { credentials: OnvifCredentials; information: OnvifDeviceInformation } | undefined
  > {
    // Phase 1 stand-in for the phase 3 product catalog. Same interface, different source.
    for (const credentials of AppConfig().onvif.defaultCredentials) {
      try {
        const information = await this.device.getDeviceInformation(endpoint, credentials);
        return { credentials, information };
      } catch {
        // Wrong credentials for this model; try the next candidate.
      }
    }
    return undefined;
  }

  private baseRecord(observation: MergedObservation): DiscoveredCamera {
    return {
      ipAddress: observation.ipAddress,
      interfaceName: observation.interfaceName,
      discoveredVia: observation.evidence,
      status: 'ONVIF_UNREACHABLE',
      ...(observation.macAddress ? { macAddress: observation.macAddress } : {}),
      ...(observation.endpointReference
        ? { endpointReference: observation.endpointReference }
        : {}),
      ...(observation.onvifXaddr ? { onvifXaddr: observation.onvifXaddr } : {}),
      ...(observation.multiHomed ? { multiHomed: true } : {}),
      ...(observation.conflictMacAddresses
        ? { conflictMacAddresses: observation.conflictMacAddresses }
        : {}),
      ...(observation.conflictEndpointReferences
        ? { conflictEndpointReferences: observation.conflictEndpointReferences }
        : {}),
      ...(nameFromScopes(observation.scopes)
        ? { suggestedName: nameFromScopes(observation.scopes) }
        : {}),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onvifCapabilityProbe.service.spec`
Expected: PASS, 6 tests

- [ ] **Step 5: Write the orchestrator**

Create `src/modules/videoDevices/applicationService/services/discovery/cameraDiscovery.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CameraNetworkScannerService } from '../../../infra/networkScanner/cameraNetworkScanner.service';
import { DiscoveredCameraRepository } from '../../../infra/discoveredCamera/discoveredCamera.repository';
import { DiscoveredCamera } from '../../../infra/discoveredCamera/discoveredCamera.types';
import { OnvifCapabilityProbe } from './onvifCapabilityProbe.service';

@Injectable()
export class CameraDiscoveryService {
  constructor(
    private readonly scanner: CameraNetworkScannerService,
    private readonly probe: OnvifCapabilityProbe,
    private readonly repository: DiscoveredCameraRepository,
    private readonly serviceProvider: ServiceProvider,
  ) {}

  async discover(signal?: AbortSignal): Promise<DiscoveredCamera[]> {
    const observations = await this.scanner.scan(signal);
    const cameras: DiscoveredCamera[] = [];
    for (const observation of observations) {
      signal?.throwIfAborted();
      try {
        cameras.push(await this.probe.probe(observation));
      } catch (error) {
        // The probe is written not to throw; if it ever does, one bad device
        // must not cost the whole inventory.
        this.serviceProvider.logger.error(
          'camera discovery: probe failed unexpectedly',
          { ipAddress: observation.ipAddress, error },
        );
      }
    }
    await this.repository.upsertMany(cameras);
    return cameras;
  }
}
```

- [ ] **Step 6: Write the orchestrator test**

Create `src/modules/videoDevices/tests/applicationService/services/discovery/cameraDiscovery.service.spec.ts`:

```ts
import { CameraDiscoveryService } from '../../../../applicationService/services/discovery/cameraDiscovery.service';

const observation = {
  ipAddress: '192.168.10.51',
  interfaceName: 'eth1',
  evidence: ['lease'] as const,
};

function logger() {
  return { logger: { error: jest.fn(), debug: jest.fn() } };
}

describe('CameraDiscoveryService', () => {
  it('probes every observation and caches the results', async () => {
    const upsertMany = jest.fn().mockResolvedValue(undefined);
    const probe = jest
      .fn()
      .mockResolvedValue({ ipAddress: '192.168.10.51', status: 'ONVIF_READY' });
    const cameras = await new CameraDiscoveryService(
      { scan: jest.fn().mockResolvedValue([observation, observation]) } as never,
      { probe } as never,
      { upsertMany } as never,
      logger() as never,
    ).discover();

    expect(probe).toHaveBeenCalledTimes(2);
    expect(cameras).toHaveLength(2);
    expect(upsertMany).toHaveBeenCalledWith(cameras);
  });

  it('keeps the inventory when one device probe throws unexpectedly', async () => {
    const upsertMany = jest.fn().mockResolvedValue(undefined);
    const probe = jest
      .fn()
      .mockRejectedValueOnce(new Error('unexpected'))
      .mockResolvedValueOnce({ ipAddress: '192.168.10.52', status: 'ONVIF_READY' });
    const cameras = await new CameraDiscoveryService(
      { scan: jest.fn().mockResolvedValue([observation, observation]) } as never,
      { probe } as never,
      { upsertMany } as never,
      logger() as never,
    ).discover();

    expect(cameras).toHaveLength(1);
    expect(upsertMany).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Run the orchestrator test**

Run: `npm test -- cameraDiscovery.service.spec`
Expected: PASS, 2 tests

- [ ] **Step 8: Wire both into the module and run the suite**

Add `OnvifCapabilityProbe` and `CameraDiscoveryService` to the `services` array with their imports.

Run: `npm test`
Expected: PASS, all suites

- [ ] **Step 9: Commit**

```bash
git add src/modules/videoDevices/applicationService/services/discovery \
        src/modules/videoDevices/tests/applicationService/services/discovery \
        src/modules/videoDevices/videoDevices.module.ts
git commit -m "feat(discovery): probe ONVIF capabilities and orchestrate discovery"
```

---

### Task 11: Enriched `search` ack

**Files:**
- Modify: `src/modules/videoDevices/contracts/mqtt/videoDeviceConfig.Mqttdto.ts`
- Modify: `src/modules/shared/cloudConfig/baseCloudCommunication.service.ts`
- Modify: `src/modules/videoDevices/applicationService/services/mqtt/nvrConfigsMqtt.service.ts`
- Test: `src/modules/videoDevices/tests/applicationService/services/mqtt/nvrConfigsMqtt.autoSearch.spec.ts`

**Interfaces:**
- Consumes: `CameraDiscoveryService.discover`, `DiscoveredCamera`
- Produces: `DiscoveredCameraDto`; `NvrConfigsMqttService.autoSearch(): Promise<void>` publishing `{ msgId: 'search', discoveredCameras: DiscoveredCameraDto[] }`

**Cloud-side note:** this changes the fog→cloud contract. `cloud-surveillance-camera` needs a matching handler that accepts `discoveredCameras` in place of `macAddresses`. That change is out of scope for this plan but must land before the ack is useful.

- [ ] **Step 1: Write the failing test**

Create `src/modules/videoDevices/tests/applicationService/services/mqtt/nvrConfigsMqtt.autoSearch.spec.ts`:

```ts
import { NvrConfigsMqttService } from '../../../../applicationService/services/mqtt/nvrConfigsMqtt.service';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-1', nvrId: 'nvr-1' }),
}));

describe('NvrConfigsMqttService.autoSearch', () => {
  it('publishes every discovered camera in the search ack', async () => {
    const sendSoftwareConfigMsgId = jest.fn().mockResolvedValue(undefined);
    const discover = jest.fn().mockResolvedValue([
      {
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ipAddress: '192.168.10.51',
        interfaceName: 'eth1',
        status: 'ONVIF_READY',
        discoveredVia: ['lease', 'onvif'],
        manufacturer: 'ACME',
        model: 'IPC-1234',
        firmwareVersion: 'V5.7.3',
        suggestedName: 'Lobby',
        hasPtz: true,
        hasAudio: false,
      },
    ]);

    await new NvrConfigsMqttService(
      { logger: { error: jest.fn(), debug: jest.fn() } } as never,
      { sendSoftwareConfigMsgId } as never,
      { discover } as never,
    ).autoSearch();

    expect(sendSoftwareConfigMsgId).toHaveBeenCalledWith({
      msgId: 'search',
      mqttData: {
        discoveredCameras: [
          {
            macAddress: 'AA:BB:CC:DD:EE:FF',
            ipAddress: '192.168.10.51',
            status: 'ONVIF_READY',
            discoveredVia: ['lease', 'onvif'],
            manufacturer: 'ACME',
            model: 'IPC-1234',
            firmwareVersion: 'V5.7.3',
            suggestedName: 'Lobby',
            hasPtz: true,
            hasAudio: false,
          },
        ],
      },
    });
  });

  it('acks with an empty list when discovery finds nothing', async () => {
    const sendSoftwareConfigMsgId = jest.fn().mockResolvedValue(undefined);
    await new NvrConfigsMqttService(
      { logger: { error: jest.fn(), debug: jest.fn() } } as never,
      { sendSoftwareConfigMsgId } as never,
      { discover: jest.fn().mockResolvedValue([]) } as never,
    ).autoSearch();

    expect(sendSoftwareConfigMsgId).toHaveBeenCalledWith({
      msgId: 'search',
      mqttData: { discoveredCameras: [] },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- nvrConfigsMqtt.autoSearch.spec`
Expected: FAIL — `autoSearch` publishes `{ macAddresses: [] }`, and the constructor takes two arguments

- [ ] **Step 3: Add the DTO**

Append to `src/modules/videoDevices/contracts/mqtt/videoDeviceConfig.Mqttdto.ts`:

```ts
export class DiscoveredCameraDto {
  macAddress?: string;
  endpointReference?: string;
  ipAddress!: string;
  status!: string;
  discoveredVia!: string[];
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  onvifPort?: number;
  suggestedName?: string;
  hasPtz?: boolean;
  hasAudio?: boolean;
  streams?: StreamsProps;
  multiHomed?: boolean;
  conflictMacAddresses?: string[];
  conflictEndpointReferences?: string[];
}
```

- [ ] **Step 4: Extend the ack payload union**

In `src/modules/shared/cloudConfig/baseCloudCommunication.service.ts`, add to the `mqttData` object type in `sendSoftwareConfigMsgId`:

```ts
      discoveredCameras?: unknown[];
```

- [ ] **Step 5: Implement autoSearch**

In `nvrConfigsMqtt.service.ts`, add `CameraDiscoveryService` as a constructor parameter after `videoDevicesCloudCommunicationService`, import `DiscoveredCamera` and `NvrConfigs`, and replace `autoSearch` with:

```ts
  async autoSearch() {
    const cameras = await this.cameraDiscoveryService.discover();
    await this.videoDevicesCloudCommunicationService.sendSoftwareConfigMsgId({
      msgId: NvrConfigs.SEARCH,
      mqttData: { discoveredCameras: cameras.map(toDiscoveredCameraDto) },
    });
  }
```

and add at the end of the file:

```ts
// interfaceName is deliberately not published: it is a fog-local detail and
// means nothing to cloud.
function toDiscoveredCameraDto(camera: DiscoveredCamera): Record<string, unknown> {
  const { interfaceName, ...rest } = camera;
  return Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- nvrConfigsMqtt.autoSearch.spec`
Expected: PASS, 2 tests

Run: `npm test`
Expected: PASS, all suites

- [ ] **Step 7: Verify the app still boots**

Run: `npm run build`
Expected: no TypeScript errors — this catches module wiring mistakes the unit tests cannot.

- [ ] **Step 8: Commit**

```bash
git add src/modules/videoDevices/contracts/mqtt/videoDeviceConfig.Mqttdto.ts \
        src/modules/shared/cloudConfig/baseCloudCommunication.service.ts \
        src/modules/videoDevices/applicationService/services/mqtt/nvrConfigsMqtt.service.ts \
        src/modules/videoDevices/tests/applicationService/services/mqtt
git commit -m "feat(discovery): return a full camera inventory from nvrConfig.search"
```

---

## After the plan

Phase 1 is done when `npm test` and `npm run build` both pass and `nvrConfig.search` returns real cameras.

**Then run it against real hardware before starting phase 2.** Spec §17 gives the reason: discovery against real cameras reliably surprises — multicast that does not traverse the switch as expected, devices that answer WS-Discovery but reject `GetProfiles`, clocks years out of date, ONVIF switched off at the factory. The empirical result also tells you how many approved models actually need the vendor-adapter path, which is exactly the input phase 2 needs.
