# Automated camera discovery, commissioning and NVR-stack registration

**Date:** 2026-09-07
**Repos touched:** `fog-surveillance-camera` (primary), `cloud-surveillance-camera` (MQTT contract, product catalog, CVE matching, relay deployment)
**Builds on:** `src/modules/videoDevices/infra/networkScanner/` (existing), `NvrConfigs.SEARCH` / `NvrConfigs.REGISTER` (stubs)

## 1. Context

`nvrConfigsMqtt.service.ts` has two placeholders that this spec fills in:

- `autoSearch()` acks with `{ macAddresses: [] }` and a `//TODO`.
- `autoRegister()` persists whatever cloud sends via `CreateCameraCommand` +
  `ActiveCameraCommand`, but nothing ever *produces* that payload, nothing touches the
  camera itself, and nothing wires the camera into a recording or streaming stack.

The scanner underneath `autoSearch` is real but incomplete: it finds *hosts* (MAC + IP via
`ip neigh`, WS-Discovery, and an nmap ARP sweep) and stops there. It does not identify what
a host is, cannot read capabilities, and — see §5.2 — aborts the entire scan when two
devices share an IP.

**The goal is zero manual per-installation configuration**: an installer racks the fog
node, cables the cameras, and everything from discovery to recording happens without a
person touching a camera. §14 states exactly where that holds and where it does not.

## 2. Goals

- `nvrConfig.search` returns a complete, capability-resolved camera inventory to cloud.
- `nvrConfig.register` commissions each selected camera end to end: activation if needed,
  ONVIF enablement, forced password change, hardening, verification, persistence, and
  registration into Frigate + MediaMTX.
- Cameras are cut off from the internet by construction and take time and configuration
  from the fog.
- Firmware versions reach the cloud so it can raise CVE alerts.
- Every step is reported as applied, failed, unsupported, or manual-required — never
  silently claimed.
- Adding a new camera brand is a new adapter class plus catalog rows; adding a new *model*
  of a supported brand is catalog rows only.

## 3. Decisions taken during design

| Decision | Choice |
|---|---|
| Camera network | **Fog owns a dedicated camera NIC and runs DHCP on it.** The router serves the fog's uplink only. |
| Vendor support | **Generic ONVIF core + pluggable vendor adapters.** Hikvision (ISAPI) and Dahua (CGI) ship first; the interface is the extension point. |
| Hardware selection | **We choose the models** — §4 defines a required camera profile. |
| `CAP_NET_ADMIN` | **Not granted, and not needed** — vendor set-IP by MAC solves duplicate addressing without it. |
| Frigate / MediaMTX | **Not yet deployed.** Added to the compose stacks by this spec (§10). |
| Recording flow | camera → RTSP → **Frigate** (direct). |
| Live flow | camera → RTSP → **MediaMTX (fog)** → **MediaMTX (cloud)**. |
| Search ack | **Contract extended on both sides** to carry full discovery records. |
| Camera password | **Cloud generates, fog applies and verifies.** |
| Product catalog | **Cloud-managed, synced to fog**, cached in Mongo. |
| CVE + checklist | **Fog reports facts; cloud matches CVEs and renders the checklist.** |

### 3.1 Fog appliance networking

The fog node has two interfaces:

```
router ──uplink NIC──> fog ──camera NIC──> PoE switch ──> cameras
                        │
                        └── dnsmasq: DHCP + DNS, camera segment only
```

The router serves the uplink and never sees the camera segment. On the camera side fog
controls addressing completely:

```
interface=<camera-nic>
dhcp-range=<start>,<end>,12h
dhcp-option=3                  # no router — cameras get NO default route
dhcp-option=6,<fog-ip>         # DNS = fog
dhcp-option=42,<fog-ip>        # NTP = fog
dhcp-host=<mac>,<ip>           # per-camera reservation, written at commissioning
```

Three consequences, all load-bearing:

1. **Cameras have no route off the segment.** P2P, vendor cloud and firmware phone-home are
   dead by construction, before any camera setting is touched. The vendor adapters also
   switch the settings off (§6.3), so the checklist can claim both.
2. **Addressing is a DHCP reservation, not a camera-side static IP.** Fog writes
   `dhcp-host=<mac>,<ip>` and the camera keeps DHCP enabled. This is strictly better than
   ONVIF `SetNetworkInterfaces`: fog stays authoritative, the address survives a camera
   factory reset, and commissioning never has to chase a device that moved mid-sequence.
3. **The lease file is a discovery channel** — `/var/lib/misc/dnsmasq.leases`, authoritative
   MAC↔IP with no network traffic.

A camera that arrives with a factory static address is switched to DHCP during
commissioning (ONVIF `SetNetworkInterfaces` or the vendor adapter), after which its
reservation applies.

### 3.2 Cameras are not all on `192.168.1.0/24`

Three default behaviours exist: DHCP-first (the majority since ~2016 — Hikvision, Dahua,
Uniview, Hanwha, Axis, Vivotek, Bosch); static fallback when no DHCP answers (Hikvision
`192.168.1.64`, Dahua `192.168.1.108`, Uniview `192.168.1.13`, Hanwha `192.168.1.200`,
Bosch `192.168.0.1` — note not all in `192.168.1.x`); and link-local `169.254.0.0/16`
fallback (Axis, Vivotek).

Because fog serves DHCP on the camera segment, the first case is the normal path. The other
two only occur for cameras explicitly configured static by a previous installation, and are
handled by the commissioning aliases in §11.2 plus vendor L2 discovery (§6.2), which does
not depend on IP reachability at all.

## 4. Required camera profile (procurement)

Since model selection is ours, the cheapest automation lever is specifying hardware rather
than coding around it. Cameras approved for these installations must:

- Implement **ONVIF Profile S** (Profile T preferred) with **Media ver10 or ver20**.
- Ship with **ONVIF enabled**, or be a brand with an adapter that can enable it (§6.3).
- Ship **DHCP-enabled** by default.
- Have **published default credentials**, or support programmatic activation (§6.3).
- Expose a **main and a sub stream**, H.264 or H.265, RTSP over TCP.
- Support password change via ONVIF `SetUser` **or** a vendor adapter equivalent.
- Tolerate at least **3 concurrent RTSP sessions** (§9).

A model meeting this profile commissions with no manual step whatsoever. Models outside it
still work as far as they are able, and report the gap rather than failing silently.

## 5. Discovery

### 5.1 Five evidence channels, merged by MAC

| Channel | Source | Yields | Status |
|---|---|---|---|
| dnsmasq leases | `/var/lib/misc/dnsmasq.leases` | MAC, IP, hostname | **new** |
| Neighbour table | `ip -j neigh show dev <if>` | MAC, IP | existing |
| WS-Discovery | multicast `239.255.255.250:3702` | XAddrs, scopes, EPR UUID | **extended** |
| ARP sweep | `nmap -sn -PR` over the NIC CIDR | MAC, IP | existing |
| **Vendor L2 discovery** | SADP / Dahua UDP broadcast (§6.2) | MAC, serial, model, firmware, activation state | **new** |

The lease file is the most authoritative and costs no traffic, so it is read first and its
MAC↔IP pairing wins ties.

The fifth channel is what makes full automation possible. WS-Discovery only sees cameras
that already speak ONVIF; vendor L2 discovery sees cameras that are **un-activated, have
ONVIF switched off, or hold an off-subnet static address**, because it is a broadcast
protocol answered by broadcast and needs no IP-level reachability. Those are precisely the
cameras that would otherwise require someone with a laptop.

`OnvifDiscoveryService` currently regexes IPv4 addresses out of the ProbeMatch body and
discards everything else. It must parse the SOAP response and retain `XAddrs` (the ONVIF
service URL, removing the need to port-probe), `Scopes` (`/name/` and `/hardware/` give a
free default camera name), and `EndpointReference/Address` (a stable per-device UUID — see
§5.3).

### 5.2 Conflict-tolerant merge (fixes existing behaviour)

`mergeObservations()` in `cameraNetworkScanner.service.ts` currently does this:

```ts
if (existingMac && existingMac !== observation.macAddress) {
  throw new Error(`ambiguous MAC addresses for ${observation.ipAddress}`);
}
```

That is the duplicate-IP scenario, and today it aborts the whole scan — one misconfigured
pair of cameras makes an entire site undiscoverable. Replace the throws with
classification: emit `status: 'IP_CONFLICT'` carrying every MAC and EPR UUID seen at that
address, let the scan complete, and resolve it in commissioning (§5.3). Same treatment for
one MAC on several IPs (`MULTI_HOMED`).

### 5.3 Cameras sharing an address — detected, then resolved

Three cameras at `192.168.1.21` make ARP ambiguous, so no IP-level conversation is reliable.
What each channel returns:

| Channel | Behaviour |
|---|---|
| ARP sweep | All three reply, but nmap dedups by target IP → one host, one MAC. **Under-counts.** |
| `ip neigh` | The kernel holds one entry per IP; three replies make it flap, last-writer-wins. **Under-counts.** |
| WS-Discovery | Probe is **multicast, so no ARP is involved inbound.** All three answer with distinct `EndpointReference` UUIDs. **Counts correctly**, but yields no MAC. |
| **Vendor L2 discovery** | Broadcast request, broadcast reply. **Returns all three with MAC, serial, model and firmware.** ✅ |

Resolution is then automatic: the vendor adapter's `setIpByMac()` (SADP set-IP, Dahua
equivalent) addresses each device **by MAC over broadcast**, so it never needs to unicast
the contested address. Fog re-addresses two of the three, the conflict clears, and normal
commissioning proceeds.

This is why adapters make `CAP_NET_ADMIN` unnecessary. The alternative — pinning the ARP
entry with `ip neigh replace` to hold a stable session with one colliding device — needs
that capability and is strictly worse: it only works for brands whose cameras are already
reachable by IP.

A conflict among cameras with **no** adapter remains detectable but not automatically
resolvable (§14.1).

### 5.4 Off-subnet coverage needs no fog code

`PhysicalEthernetProvider.listNetworks()` already iterates **every** IPv4 address on each
eligible NIC, deriving a network per address. So when the appliance provisioning adds
commissioning aliases to the camera NIC (§11.2), the existing scan loop covers those
subnets unchanged. Addresses reached only through an alias are marked `OFF_SUBNET`; they
are moved onto the DHCP range during commissioning.

## 6. Device access layer

### 6.1 Adapter architecture

Generic ONVIF is the base and always present. Vendor adapters add only what ONVIF has no
call for. Everything is resolved through one interface so the core never learns a brand
name:

```ts
interface CameraVendorAdapter {
  readonly id: string;                    // 'onvif' | 'hikvision' | 'dahua' | ...
  discoverL2?(nic: string): Promise<L2Device[]>;
  activate?(d: L2Device, password: string): Promise<void>;
  enableOnvif?(d: Device, creds: Credentials): Promise<void>;
  setIpByMac?(mac: string, ip: string): Promise<void>;
  enableDhcp?(d: Device, creds: Credentials): Promise<void>;
  changePassword?(d: Device, creds: Credentials, next: string): Promise<void>;
  disableCloudServices?(d: Device, creds: Credentials): Promise<HardeningOutcome[]>;
  getDeviceInfo?(d: Device, creds: Credentials): Promise<DeviceInfo>;
}
```

Every method is optional. A missing method is reported `NOT_SUPPORTED` for that step, not
an error — which is exactly how the generic-ONVIF-only path behaves for a brand with no
adapter. Adapter selection comes from the catalog row matched to the device
(`adapterId`), never from hardcoded brand detection in the core.

**Extension cost:** a new brand is one class implementing whichever methods it can, one
registry entry, and catalog rows. No core change, no change to discovery, commissioning or
the NVR stack.

### 6.2 Vendor L2 discovery

| Brand | Protocol |
|---|---|
| Hikvision | SADP, UDP `37020` |
| Dahua | UDP `37810` |
| *(others)* | adapter-defined, or absent |

Both are broadcast request / broadcast reply, so they reach devices that are un-activated,
have ONVIF disabled, or sit on a foreign subnet. Results merge into the same
`discoveredCameras` records as the other channels, keyed by MAC.

### 6.3 What adapters do that ONVIF cannot

| Capability | ONVIF | Hikvision | Dahua |
|---|---|---|---|
| Activate an un-activated unit | ✗ | SADP / `System/activate` | n/a (ships with defaults) |
| Enable ONVIF when shipped off | ✗ | Integration-protocol endpoint + ONVIF user | config endpoint |
| Disable P2P / vendor cloud | ✗ | EZVIZ / Hik-Connect endpoint | `Nat`/`T2UServer` config |
| Disable UPnP | ✗ | UPnP endpoint | `UPnP` config |
| Disable telnet / SSH | ✗ | SSH + telnet endpoints | `Telnet` config |
| Password change fallback | `SetUser` | user endpoint | `userManager` |
| Set IP addressed by MAC | ✗ | SADP set-IP | discovery-protocol set-IP |

Both vendors use HTTP digest auth, so the adapters are thin `axios` clients over the
existing dependency set.

> **Implementation note:** exact ISAPI and CGI paths vary by firmware generation. The
> adapter *interface* is stable; the endpoint constants are per-model data and must be
> confirmed against the actual approved models (§4) during phase 2 rather than trusted from
> documentation. Treat every endpoint above as a family, not a literal path.

### 6.4 ONVIF client

Hand-rolled over `axios` + `fast-xml-parser`, both already dependencies. Roughly eight fixed
SOAP envelopes, in the same style as the WS-Discovery probe this codebase already builds by
hand. The `onvif` npm package is callback-era, unevenly maintained, and brings its own XML
and discovery stack to do less than is needed here.

Two things decide whether this works:

**Parse by local name.** Vendors vary SOAP prefixes freely (`tds:`, `ns2:`, `wsdl:`). The
parser is configured `removeNSPrefix: true` and no lookup ever matches a prefixed tag.

**Clock skew is the most common ONVIF auth failure.** WS-Security UsernameToken digest is
`Base64(SHA1(nonce ++ created ++ password))`, where `created` must be within the device's
tolerance of *device* time. Cameras arrive with clocks years out. So `GetSystemDateAndTime`
— unauthenticated by spec — leads every probe: it confirms the endpoint, proves liveness,
and yields the offset used for every subsequent authenticated call.

### 6.5 Capability probe order

1. `GetSystemDateAndTime` — unauthenticated. Endpoint confirmation + clock offset.
2. **Endpoint resolution** — XAddrs from WS-Discovery; else probe
   `http://<ip>:{80,8000,8899,2020}/onvif/device_service` with the same unauthenticated call.
3. **Authentication** — credential resolution order per §8.2.
4. `GetDeviceInformation` — manufacturer, model, **firmware version**, serial, hardware id.
5. `GetServices` — which services exist; decides Media ver10 vs ver20.
6. `GetNetworkInterfaces` — authoritative MAC and current DHCP/static state.
7. `GetProfiles` — encoder configs, resolutions, framerates; audio encoder → `hasAudio`;
   PTZ config → `hasPtz` (cross-checked with `GetServices`).
8. `GetStreamUri` per profile — `StreamSetup{ Stream: RTP-Unicast, Transport{ Protocol:
   RTSP } }`. Highest-resolution profile → `recordStream`, lowest → `liveStream`, mapping
   onto the existing `StreamsProps { token, path, resolutions }`.

Every step is timeboxed; a device failing at step *n* is reported with what steps 1..*n-1*
produced rather than dropped from the inventory.

## 7. Product catalog

Cloud owns the catalog and pushes it to fog over the existing config channel (new
`NvrConfigs.SYNC_CAMERA_PRODUCTS`); fog caches it in Mongo and reads only from Mongo, so
commissioning works during a cloud outage. A new model of a supported brand is a cloud row,
not a fog release.

```ts
interface CameraProduct {
  manufacturerPattern: string;   // matched against GetDeviceInformation / L2 discovery
  modelPattern: string;
  adapterId: string;             // 'onvif' | 'hikvision' | 'dahua' | ...
  defaultUsername: string;
  defaultPassword: string;
  onvifPorts: number[];
  approvedProfile: boolean;      // meets §4
  notes?: string;
  catalogVersion: number;
}
```

Credentials are stored as delivered, consistent with how `CameraEntity` already handles
`Password` — fog devices are trusted infrastructure in this platform.

A device that authenticates with no catalog match is `UNKNOWN_PRODUCT`; one that matches but
rejects the defaults is `AUTH_FAILED`. Both are reported for operator credential entry, and
cloud folds the answer back into the catalog.

## 8. Commissioning — `nvrConfig.register`

### 8.1 Sequence per camera

1. **Resolve** by MAC from `discoveredCameras`. A record older than `discoveryTtlMinutes`
   (default 60) triggers a **targeted re-probe of that MAC alone** — not a full rescan and
   not a rejection, since an operator may take longer than an hour between reviewing the
   search result and confirming it.
2. **Reach a usable state** — the steps that make an uncooperative camera cooperative,
   each skipped when unnecessary:
   - `IP_CONFLICT` → `setIpByMac()` for all but one contender (§5.3).
   - Un-activated → `activate()` with the cloud-supplied password.
   - ONVIF disabled → `enableOnvif()`.
   - Static addressing → `enableDhcp()`, then write the `dhcp-host` reservation.
3. **Authenticate** (§8.2).
4. **Harden**, each step recording `APPLIED` / `VERIFIED` / `FAILED` / `NOT_SUPPORTED` /
   `MANUAL_REQUIRED`:
   - Password → ONVIF `SetUser`, falling back to the adapter's `changePassword()` when the
     device refuses. **Then re-authenticate to verify.** If verification fails, abort this
     camera and create no record — otherwise fog holds a credential the camera does not have.
   - `disableCloudServices()` → P2P, vendor cloud, UPnP, telnet, SSH.
   - `SetNTP` → fog. `SetDNS` → fog. `SetNetworkProtocols` → disable what is unused.
   - `SetDiscoveryMode` → **left enabled**, recorded as an accepted exception: re-discovery
     depends on it.
5. **Verify** by re-reading device info, network interfaces, NTP and gateway with the new
   credentials.
6. **Persist** via the existing `CreateCameraCommand` + `ActiveCameraCommand`.
7. **Register into the NVR stack** (§9).
8. **Report** the per-camera outcome in the ack.

Step 2 is what removes the manual laptop visit. It is also the only step that can change a
camera's address, and because addressing is a DHCP reservation (§3.1) the device returns on
the address fog chose rather than one it picked for itself.

### 8.2 Idempotency without a lock manager

`register` arrives over at-least-once MQTT, and the password change is one-way. The failure
mode is concrete: register succeeds, the ack is lost, cloud redelivers, the retry
authenticates with catalog *defaults* which no longer work, and a fully commissioned camera
is reported `AUTH_FAILED`.

The fix is a credential resolution order, not claim tokens:

1. The password in the register payload (the intended new one)
2. Stored credentials for that MAC, if fog already holds a record
3. Catalog defaults for the matched model

First success wins, and which one succeeded tells you where the camera sits in the sequence.
Every step in §8.1 is likewise written to be a no-op when already applied — an activated
camera reports activation `NOT_SUPPORTED`-or-already-done rather than failing. Combined with
an existence check through the `FindCameraBySerialNumberQuery` / MAC query handlers that
already exist, redelivery is safe.

This deliberately does **not** resurrect the removed `AutoProvisioningOperationService`
(claim tokens, lock windows, replay store). That machinery is heavier than the problem.

## 9. Stream topology

```
camera ──RTSP main──> Frigate      (record)
camera ──RTSP sub───> Frigate      (detect)
camera ──RTSP sub───> MediaMTX fog ──push──> MediaMTX cloud
```

Three concurrent RTSP sessions per camera, which is why §4 requires cameras to tolerate at
least three. If a model proves tighter, the one-line mitigation is pointing Frigate's
`detect` role at `rtsp://127.0.0.1:8554/<cameraId>` to read the sub-stream from MediaMTX,
taking it to two sessions without changing either flow.

Recording and live are deliberately independent: a Frigate restart (which every camera
registration triggers, §9.2) does not touch the fog→cloud live path.

### 9.1 MediaMTX registration (live)

Control API on `127.0.0.1:9997`. One path per camera, named `<cameraId>`, sourced from the
camera's sub-stream:

```
POST /v3/config/paths/add/<cameraId>
{ "source": "rtsp://<user>:<pass>@<camera-ip>:554/<sub-path>", "sourceOnDemand": false }
```

Removed with `POST /v3/config/paths/delete/<cameraId>`. Runtime — no restart. Cloud push is
configured on the path:

```yaml
runOnReady: ffmpeg -i rtsp://127.0.0.1:8554/$MTX_PATH -c copy -f rtsp rtsp://<cloud-relay>/$MTX_PATH
runOnReadyRestart: yes
```

Push, not pull, so fog egress needs only an outbound rule and the cloud relay needs no
inbound path to the fog.

### 9.2 Frigate registration (recording)

Frigate has no runtime camera-add API and does not support YAML includes, so fog **renders
the whole `config.yml`** from its own camera collection, writes it atomically, and calls
`POST /api/restart`. **No Docker socket is required**, preserving the fog container's
`cap_drop: ALL` posture.

```yaml
cameras:
  <cameraId>:
    ffmpeg:
      inputs:
        - path: rtsp://<user>:<pass>@<camera-ip>:554/<main-path>
          roles: [record]
        - path: rtsp://<user>:<pass>@<camera-ip>:554/<sub-path>
          roles: [detect]
    record:
      enabled: true
      retain: { days: <retainDays>, mode: <all|motion> }
```

Recording mode maps to `record.retain.mode`. Key names moved between Frigate 0.14 and 0.15
(`record.events` → `record.alerts` / `record.detections`), so the implementation targets
**one pinned version**, stated in the compose file, and the renderer is tested against it.

A restart interrupts recording on all cameras for a few seconds, so registrations are
applied in one batch per `register` message rather than one restart per camera.

## 10. Deployment

Each side gets a `deployment/dev/` directory mirroring its established sibling, with the
streaming services added.

| New | Mirrors | Adds |
|---|---|---|
| `fog-surveillance-camera/deployment/dev/` | `platform-sanaw/gateway-backend-v2/deployment/dev/` | `mediamtx-fog`, `frigate` + configs |
| `cloud-surveillance-camera/deployment/dev/` | `platform-sanaw/workspace-backend-v2/deployment/dev/` | `mediamtx-cloud` + config |

The two reference bootstraps are **not** interchangeable and each is copied from its own
side: gateway's refuses to run under sudo, resolves `scriptDir`/`repoRoot` rather than
assuming cwd, checks `mongoexport` and the TDengine native driver, uses `/fog_shared_backups`
and `-p fog`. Workspace's *requires* root, checks `mongoimport`, uses `/cloud_shared_backups`
and `-p cloud`, and ends with the manual EMQX dashboard steps.

### 10.1 Fog — `fog-surveillance-camera/deployment/dev/`

```
bootstrap.sh              from gateway-backend-v2, -p fog, /fog_shared_backups
docker-compose-dev.yml    tdengine-fog + mongo-fog + redis-fog (as gateway)
                          + mediamtx-fog + frigate
.env.development          fog app config incl. the new §15.2 variables
mediamtx/mediamtx.yml     fog relay config
frigate/config.yml        base config; the fog app renders cameras into this file
```

`bootstrap.sh` gains `nmap` to its prerequisite list — the scanner shells out to it and in
dev the app runs on the host, so it is a host prerequisite exactly like `taosdump`.

**dnsmasq is deliberately not in the dev compose.** Running a DHCP server on a developer
machine would fight the local network. It belongs to the appliance provisioning (§11.1);
in dev, discovery is exercised against whatever is on the LAN, and the lease-file channel
degrades to "file absent" rather than failing.

**Frigate** service notes:

- `shm_size` must be raised from the 64 MB default — Frigate's formula is roughly
  `(width × height × 1.5 × 9 + 270480) / 1048576` MB **per camera**, so it scales with camera
  count and resolution.
- Detector passthrough (`/dev/dri`, Coral, CPU) is per-machine — a documented dev-setup
  choice, not something the compose file can pick (§14.2).
- Config is a **bind mount** of `./frigate/`, not a named volume: in dev the app runs on the
  host and writes `deployment/dev/frigate/config.yml` directly, so the rendered config is
  visible in the working tree.
- Recordings go to a named volume `fog-frigate-media`, matching the existing `fog-*` naming.

### 10.2 Cloud — `cloud-surveillance-camera/deployment/dev/`

```
bootstrap.sh              from workspace-backend-v2, -p cloud, /cloud_shared_backups
docker-compose-dev.yml    tdengine-cloud + mongo-cloud + emqx + redis-cloud (as workspace)
                          + mediamtx-cloud
env.development           cloud app config
mediamtx/mediamtx.yml     relay config: authenticated publish, one path per camera id
```

Publish credentials are per-fog-node, issued alongside the existing NVR access token, and
expressed as `authInternalUsers` entries restricted to `publish` on that node's path prefix
— a fog node must not be able to publish over another node's cameras.

### 10.3 Port allocation (both stacks on one dev machine)

The cloud compose runs on `network_mode: host`; the fog compose deliberately does not,
publishing remapped ports (`27018:27017`, `6378:6379`, `60410:6041`) so both coexist. The
streaming services must respect that split or collide on 8554/9997:

| Service | Network | RTSP | API |
|---|---|---|---|
| `mediamtx-cloud` | host | 8554 | 127.0.0.1:9997 |
| `mediamtx-fog` | bridge, published | `8555:8554` | `9998:9997` |
| `frigate` | bridge, published | — | `5000:5000` |

**Gotcha:** MediaMTX defaults `apiAddress` to `127.0.0.1:9997`, unreachable through a
published port because it binds only the container loopback. The fog config must set
`apiAddress: :9997`. The cloud config, on host networking, keeps the loopback bind.

Frigate's bundled go2rtc also defaults to 8554; this design does not use go2rtc, so its
ports are left unpublished.

### 10.4 Production

`fog-surveillance-camera/deployment/prod/docker-compose.yml` gains the same two services
plus dnsmasq; `cloud-surveillance-camera/deployment/prod/` — today only a `Dockerfile` and
entrypoint — gains a compose file with `mediamtx-cloud`. Prod keeps the existing fog
conventions: host networking, Docker secrets, hardened container settings.

The fog app container keeps `read_only: true`. It gains one writable named volume,
`fog-frigate-config`, mounted where it renders `config.yml` and mounted into Frigate at
`/config`; a read-only root filesystem does not prevent writes to mounted volumes. This is
the one structural dev/prod difference — dev bind-mounts for developer visibility, prod uses
a named volume.

## 11. Appliance provisioning

### 11.1 dnsmasq

Serves DHCP and DNS on the camera NIC per §3.1. Fog writes `dhcp-host` reservations at
commissioning and reloads dnsmasq. Since the fog app has no `CAP_NET_ADMIN` and cannot
signal a host process, reservations are written to a directory dnsmasq watches
(`--conf-dir` with `addn-hosts`-style reload), or dnsmasq runs as a compose service fog can
restart through the same mechanism it uses for Frigate. **The exact reload mechanism is an
implementation decision for phase 3** — both work; the choice depends on whether dnsmasq
ends up containerised.

### 11.2 Commissioning aliases

Added to the camera NIC so cameras holding a foreign static address are reachable by IP
before they are moved onto DHCP, and consumed automatically by the existing interface
provider (§5.4):

```
ip addr add 192.168.1.250/24  dev <camera-nic>
ip addr add 192.168.0.250/24  dev <camera-nic>
ip addr add 169.254.1.250/16  dev <camera-nic>
```

Vendor L2 discovery (§6.2) finds these cameras without the aliases; the aliases are what
let the *generic ONVIF* path reach a brand with no adapter.

### 11.3 Fog egress allowlist

`deployment/prod/nftables/fog-egress.nft`, applied by provisioning: `OUTPUT` default drop;
allow established/related, cloud MQTT, cloud HTTPS, the cloud RTSP relay, upstream NTP, and
fog→camera traffic. `FORWARD` default drop, so fog cannot become a path to the internet for
cameras even if one is manually given a gateway.

### 11.4 NTP

Fog runs chrony and serves the camera segment, advertised by DHCP option 42 and set
explicitly by ONVIF `SetNTP`, verified by `GetNTP`.

## 12. Compliance reporting

### 12.1 Egress verification

An unprivileged container cannot read `nft list ruleset`, so provisioning writes a read-only
manifest:

```json
{ "policyVersion": 3, "appliedAt": "...", "contentHash": "sha256:...", "rules": ["..."] }
```

Fog reads `/etc/sanaw/egress-policy.json`, reports it, and performs one active negative probe
against a configured canary destination the policy must block.

For cameras, fog can assert more than a manifest: it *is* the DHCP server, so it can state
directly that no camera was offered a default route, and the adapters confirm P2P/UPnP are
off in the device's own configuration. That is a genuine two-layer claim rather than an
inference.

### 12.2 Inventory for CVE matching

Fog publishes manufacturer, model, firmware version, hardware id and serial at commissioning,
daily, and whenever a firmware version changes. Cloud matches against its CVE feed. Fog never
reaches the internet.

### 12.3 Delivery-checklist facts

Fog emits per-commissioning facts; cloud renders the signable document. With adapters in
place the checklist can state P2P/UPnP as *disabled in the device* **and** *unreachable by
routing*, rather than the weaker network-only claim.

## 13. Contracts

### 13.1 `search` ack (extended, both repos)

```ts
interface DiscoveredCameraDto {
  macAddress?: string;
  ipAddress?: string;
  endpointReference?: string;      // WS-Discovery UUID
  status: 'ONVIF_READY' | 'NEEDS_ACTIVATION' | 'ONVIF_DISABLED' | 'AUTH_FAILED'
        | 'UNKNOWN_PRODUCT' | 'ONVIF_UNREACHABLE' | 'IP_CONFLICT' | 'OFF_SUBNET';
  multiHomed?: boolean;              // answering on two addresses; still probeable
  discoveredVia: ('lease' | 'neighbor' | 'onvif' | 'nmap' | 'vendorL2')[];
  adapterId?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  onvifPort?: number;
  suggestedName?: string;
  approvedProfile?: boolean;       // meets §4
  hasPtz?: boolean;
  hasAudio?: boolean;
  streams?: StreamsProps;
  conflictMacAddresses?: string[];
}
```

`NEEDS_ACTIVATION` and `ONVIF_DISABLED` are not failures — they are states commissioning
resolves automatically when an adapter exists, and the ack says which. `discoveredVia` lets
cloud show why a camera is known at all.

### 13.2 `register` payload (extended)

`FogRegisterCameraDto` gains `recordingMode: 'motion' | 'continuous'` and `retainDays: number`.

### 13.3 `register` ack (extended)

Replaces the flat `failedRegisteredCameraSerialNumbers` with a per-camera outcome carrying
every step result from §8.1 and the assigned reservation address.

### 13.4 New config types

`NvrConfigs.SYNC_CAMERA_PRODUCTS` (cloud → fog) and a fog-initiated
`NvrConfigs.CAMERA_INVENTORY` report. Both require a cloud-side handler.

## 14. What cannot be automated

With fog owning the camera network, adapters for the brands in use, and models meeting §4,
discovery and registration are **fully automatic for factory-fresh approved cameras**. What
remains:

### 14.1 Genuinely irreducible

- **A camera with unknown, non-default credentials** — used or previously-configured units.
  No protocol recovers from this; it needs the physical reset button. Fog detects it
  (`AUTH_FAILED`) and reports it precisely.
- **A brand with no adapter that also ships ONVIF-disabled or un-activated.** Invisible to
  every automated channel. §4 procurement is what prevents this from ever occurring; writing
  an adapter is what fixes it if it does.
- **Physical work** — cabling, PoE budget, mounting, aiming, focus.

### 14.2 One-time appliance build, not per-installation

- Detector hardware (Coral / GPU / CPU), storage sizing, retention policy.
- Second NIC and camera-segment cabling.
- Cloud relay credentials, issued with the NVR access token.

These are part of building a fog node, not of installing cameras at a site — which is the
distinction that matters for "no manual config".

### 14.3 Accepted transients

- Adding a camera restarts Frigate, interrupting recording for a few seconds. Batching
  limits it; nothing removes it.
- CVE *remediation* is a firmware upgrade. Alerting is automatic; applying is not, and
  ONVIF `StartFirmwareUpgrade` support is too patchy to rely on.
- Delivery-checklist signature is a human step by definition.

## 15. Data model, layout and testing

### 15.1 Collections

- **`discoveredCameras`** — the cache `register` resolves against. Scoped
  `{tenantId, nvrId, macAddress}` unique, with `endpointReference` as fallback key. Records
  are never deleted by a scan — a camera absent from the latest scan keeps its capabilities
  and is aged by `lastSeenAt` (§8.1), so a transient scan failure cannot erase an inventory.
- **`cameraProducts`** — the synced catalog (§7).
- **`commissioningReports`** — per-run step outcomes, published to cloud and retained locally
  for offline sign-off.

### 15.2 File layout

```
src/modules/videoDevices/
  infra/networkScanner/
    dnsmasqLease.provider.ts          NEW
    onvifDiscovery.service.ts         EXT  parse XAddrs + scopes + EPR
    cameraNetworkScanner.service.ts   EXT  conflict-tolerant merge
    networkScanner.types.ts           EXT
  infra/deviceAccess/                 NEW
    cameraVendorAdapter.interface.ts       the extension point (§6.1)
    adapterRegistry.ts                     catalog-driven selection
    onvif/                                 base adapter + SOAP client
      onvifSoap.client.ts                  envelopes, WS-Security, skew
      onvifEndpoint.resolver.ts
      onvifDevice.service.ts
      onvifMedia.service.ts
      onvifHardening.service.ts
    hikvision/hikvision.adapter.ts         SADP + ISAPI
    dahua/dahua.adapter.ts                 UDP discovery + CGI
  infra/productCatalog/               NEW
  infra/dhcpReservations/             NEW  writes dhcp-host entries, reloads dnsmasq
  infra/nvrStack/                     NEW  mediamtx.client, frigateConfig.writer, frigate.client
  infra/egressPolicy/                 NEW
  applicationService/services/discovery/
    cameraDiscovery.service.ts        NEW  scan + probe → DiscoveredCamera[]
    cameraCommissioning.service.ts    NEW  §8.1 sequence
  applicationService/services/mqtt/nvrConfigsMqtt.service.ts   EXT
  contracts/mqtt/videoDeviceConfig.Mqttdto.ts                  EXT
```

Config additions in `configs/app.config.ts`: ONVIF timeouts and candidate ports,
`discoveryTtlMinutes`, camera NIC name, DHCP range and reservation path, MediaMTX API URL,
cloud relay URL, Frigate API URL and config path, egress manifest path, canary destination.

### 15.3 Testing

Per the Sanaw testing standard:

- **Unit** — lease parsing, ProbeMatch parsing (including three responses from one IP),
  conflict-tolerant merge, WS-Security digest, SOAP envelope building, SADP/Dahua frame
  encode-decode, `dhcp-host` rendering, Frigate config rendering, stream→profile mapping.
- **Fake devices** — a canned-SOAP ONVIF server (skewed clocks, auth rejection, Media2-only,
  `SetUser` refusal, failure at `GetProfiles`) and UDP responders for SADP and Dahua
  discovery. These carry most of the device-access coverage.
- **Adapter contract tests** — one shared suite every adapter must satisfy, so a new brand
  is proven against the same expectations without new test infrastructure.
- **Integration (Testcontainers)** — Mongo-backed discovery cache, catalog sync, register
  flow through to `CreateCameraCommand`.
- **Not tested against real nmap, real multicast, or real Frigate** in CI.

## 16. Out of scope

- Managed-switch PoE port sequencing.
- Firmware distribution from fog to camera.
- Cloud-side CVE feed ingestion, catalog UI, checklist rendering.
- Brands beyond Hikvision and Dahua — the interface accepts them; no adapter ships here.
- Orphaned specs left by the auto-provisioning removal
  (`nvrAutoProvisioning.service.spec.ts`, `autoProvisioningOperation.service.spec.ts`)
  reference deleted services and need deleting or rewriting — noted, not fixed here.

## 17. Phasing

1. **Discovery core** — lease provider, ONVIF client and capability probe, EPR parsing,
   conflict-tolerant merge, enriched `search` ack. Generic ONVIF only.
2. **Device access layer** — adapter interface and registry, Hikvision and Dahua adapters,
   vendor L2 discovery as a fifth channel, adapter contract test suite. This is the phase
   that verifies the real ISAPI/CGI endpoints against the approved models (§6.3).
3. **Commissioning** — catalog sync, the §8.1 sequence, DHCP reservations, extended ack.
4. **NVR stack** — Frigate + MediaMTX compose additions (fog and cloud) and registration.
5. **Compliance** — egress provisioning and verifier, inventory publish, checklist facts.

**Ship phase 1 alone and run it against real hardware before phase 2.** Discovery against
real cameras reliably surprises: multicast that does not traverse the switch as expected,
devices that answer WS-Discovery but reject `GetProfiles`, clocks years out of date. Phase 1
also tells you empirically how many of the approved models actually need the adapter path,
which is exactly the input phase 2 needs.
