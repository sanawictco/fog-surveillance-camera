# Camera Discovery Phase 1 — hardware trial runbook

Design spec §17: **"Ship phase 1 alone and run it against real hardware before phase 2."**
The trial's job is not to prove the code works — 154 tests already assert that against mocks.
It is to find the things mocks cannot produce, and to answer the one question Phase 2 needs:
**how many of the approved camera models actually need the vendor adapter path?**

State entering the trial: `develop` @ d451672, 33 suites / 154 tests green, `npm run build` exit 0.
Never executed against a real camera, a real nmap, or real multicast.

## Prerequisites

The prod image already covers the scanner's hard requirements — `deployment/prod/Dockerfile`
installs `nmap`, `iproute2` and `mongosh`, and `docker-compose.yml` grants `network_mode: host`
plus `cap_add: NET_RAW`. `ScannerPreflightService` enforces all of it at boot and throws rather
than degrading, so a misprovisioned appliance fails loudly.

Check on the appliance before travelling:

1. `ls -l /sys/class/net/` — see "NIC eligibility" below. This is the most likely silent failure.
2. dnsmasq is serving the camera segment — see "The camera segment" below. If it is not,
   `test -f /var/lib/misc/dnsmasq.leases || sudo touch /var/lib/misc/dnsmasq.leases`: the compose
   file bind-mounts this path, and if it does not exist Docker creates a **directory** there.
   The lease channel then degrades to nothing, visible only as a `warn` line ("dnsmasq lease
   file could not be read"), not an error.
3. Confirm `SCANNER_MAX_HOSTS=1024` covers the camera subnet (a /24 is 254 hosts; a /21 exceeds it).
4. Confirm `ONVIF_DEFAULT_CREDENTIALS` is populated (d451672). If it were empty, every camera
   would report `AUTH_FAILED` and the trial would tell you nothing.

## The camera segment: fog serves DHCP and DNS

Per spec §3.1 fog is not merely attached to the camera segment, it **owns** it — dnsmasq on the
camera NIC serving DHCP *and* DNS, with the router never seeing the segment at all. Three
consequences the trial depends on:

- Cameras get **no default route** (`dhcp-option=3` sent empty), so vendor cloud and firmware
  phone-home are dead by construction rather than by camera configuration.
- Addressing is a **DHCP reservation**, not a camera-side static IP, so fog stays authoritative
  and the address survives a camera factory reset.
- **The lease file is a discovery channel** — authoritative MAC↔IP with no network traffic. It is
  one of the four Phase 1 evidence channels, so a trial run without dnsmasq exercises only three
  of them and never touches the one the spec calls authoritative.

§3.2 is the reason this is the normal path and not a convenience: DHCP-first has been the majority
camera behaviour since ~2016, and vendor static fallbacks are *not* all on `192.168.1.x`
(Hikvision `.1.64`, Dahua `.1.108`, Uniview `.1.13`, Hanwha `.1.200`, Bosch `192.168.0.1`), with
Axis and Vivotek falling back to link-local instead. Serving DHCP means not guessing which.

Spec §10.1 deliberately keeps dnsmasq out of the dev compose because a DHCP server on a developer
machine would fight the local network. That objection is about the *shared* LAN; it does not apply
to a dedicated NIC on an isolated segment, provided dnsmasq is pinned to that NIC:

```
interface=<camera-nic>
bind-interfaces
```

`bind-interfaces` is what stops dnsmasq binding the wildcard address and answering DHCP on the
real LAN. Do not omit it.

`scripts/discoveryTrialSegment.sh` and `scripts/dnsmasq-trial.conf` do this. The subnet is
`192.168.50.0/24`, chosen so it collides with neither the docker bridges nor any vendor static
fallback — a camera that appears there provably took a lease rather than falling back. The script
re-applies the same three eligibility checks `PhysicalEthernetProvider.isEligible()` uses (not
virtual, `type == 1`, `carrier == 1`), so a NIC the scanner would silently skip fails here instead
of mid-trial.

Run it in the foreground, in a real terminal — sudo needs a TTY for its password prompt:

```sh
sudo scripts/discoveryTrialSegment.sh          # or: sudo NIC=eth0 scripts/discoveryTrialSegment.sh
```

**NetworkManager will fight you for the camera NIC.** If NM manages the interface — a
netplan-generated `netplan-<nic>` connection is the default on Ubuntu — it runs its own DHCP
*client* there. Fog is the DHCP *server* on that segment, so nothing ever answers, NM times out
after 45s with `ip-config-unavailable`, **flushes every address off the interface**, and retries
forever. The static address disappears roughly a minute after you add it, `os.networkInterfaces()`
then omits the interface entirely, and `listNetworks()` throws `no active physical Ethernet IPv4
network is available`. dnsmasq is left holding a socket bound to an address that no longer exists,
so the camera gets no answer either. The script now runs `nmcli device set <nic> managed no` first
and verifies the address survives two seconds. This applies to the real appliance too: the camera
NIC must be unmanaged or statically configured in netplan, or NM and dnsmasq will fight over it.

Then power-cycle the camera and watch it take a lease. `log-queries` is enabled, so every name the
camera resolves is printed — vendor cloud phone-home attempts appear by name, which is free
evidence for the §12.1 egress story.

Cameras holding a foreign static address from a previous installation will not take a lease. Those
need the §11.2 commissioning aliases on the same NIC:

```sh
sudo ip addr add 192.168.1.250/24 dev <camera-nic>
sudo ip addr add 192.168.0.250/24 dev <camera-nic>
sudo ip addr add 169.254.1.250/16 dev <camera-nic>
```

Note that fog advertises itself as NTP (`dhcp-option=42`), but chrony is not running on a bench
box. The camera's clock therefore stays wherever it was, which is a realistic production-like
condition — and the direct cause of the WS-Security digest failures that surface as `AUTH_FAILED`.
If a camera reports `AUTH_FAILED`, check its clock before concluding the credentials are wrong.

## Running it

Production triggers discovery only from a cloud `nvrConfig.search` message, which is not
available on a bench. `src/scripts/discoveryTrial.ts` drives the same
`CameraDiscoveryService.discover()` the MQTT path calls — same DI graph, same preflight.

**Stop the app container first.** `MQTT_CLIENT_ID` (`configs/app.config.ts:51`) is a single
shared value, so a second process reading `.env.production` takes the broker session from the
running app and the two fight in a takeover loop.

```sh
cd deployment/prod
docker compose down
docker compose run --rm fog-surveillance-camera node dist/src/scripts/discoveryTrial.js
```

`docker compose run` reuses the service definition, so host networking, `NET_RAW` and the
`docker-entrypoint.sh` secret preflight all still apply. The report is written to
`/fog_shared_backups/discovery-trial.json` (the container is `read_only:` — that bind mount and
`/tmp` are the only writable paths). Pass a different path as the first argument to override.

Capture the container logs alongside the JSON; the per-channel warnings are where the
interesting failures show up, and they are not in the report.

The same rows are persisted to the `discoveredCameras` Mongo collection:

```sh
docker compose run --rm fog-surveillance-camera sh -c \
  'mongosh "mongodb://$MONGO_DB_HOST:$MONGO_DB_PORT/$MONGO_DB_NAME" --quiet --eval "db.discoveredCameras.find({}, {_id: 0}).toArray()"'
```

(The connection string is composed from those three variables — `configs/app.config.ts:25` — and
they live in the container's environment, hence `sh -c` with outer single quotes.)

## What to record

For each camera, from the report: `status`, `discoveredVia`, `manufacturer`, `model`,
`firmwareVersion`, and whether `streams` came back. Status is one of `ONVIF_READY`,
`AUTH_FAILED`, `ONVIF_UNREACHABLE`, `IP_CONFLICT`; evidence is one of `lease`, `neighbor`,
`onvif`, `nmap` (the fifth channel, vendor L2, is Phase 2).

The Phase 2 input is the count: **how many approved models reached `ONVIF_READY` with usable
`streams`, and how many needed a human.** Everything that did not reach `ONVIF_READY` is a
candidate for the adapter path, and the split decides how much §6.3 work Phase 2 really is.

## Known traps, watch for these specifically

**NIC eligibility is the big one.** `PhysicalEthernetProvider.isEligible()` rejects any interface
whose `/sys/class/net/<name>` realpath contains `/virtual/`, and requires `type == 1` and
`carrier == 1`. VLAN sub-interfaces (`eth0.10`), bonds and bridges all resolve under
`/sys/devices/virtual/net/` and are therefore **skipped silently**. Spec §3.2 explicitly expects
cameras off `192.168.1.0/24`, so a VLAN-tagged camera network is a live risk: discovery would
return an empty inventory with no error at all, unless *every* interface is ineligible, which is
the only case that throws ("no active physical Ethernet IPv4 network is available").

**A network yielding zero rows may not mean zero cameras.** `CameraNetworkScannerService.scan()`
has no per-channel isolation (recorded in the Phase 1 follow-ups, accepted for this trial): one
channel throwing aborts that network's whole scan, including the channels that already succeeded.
Read the logs for a channel exception before concluding a subnet is empty.

**`AUTH_FAILED` is ambiguous.** It conflates credential rejection with a device that answered the
unauthenticated `GetSystemDateAndTime` and then timed out. It is also the signal that dispatches a
human with a reset button, so verify by hand before acting on it.

**There is no timebox.** No per-device or per-scan budget, and the script passes no `AbortSignal`,
so a busy or large subnet runs unbounded and uncancellable short of killing the container.

**The three surprises the spec predicts** (§17), worth checking explicitly: multicast not
traversing the switch as expected (an empty `onvif` evidence channel while `nmap`/`neighbor` find
devices); cameras that answer WS-Discovery but reject `GetProfiles`; camera clocks years out of
date, which breaks WS-Security digest auth and surfaces as `AUTH_FAILED`.

**Unverified index.** The `partialFilterExpression` fix on `discoveredCameras` has never run
against a real Mongo server (no Mongo in the dev environment). A site with two or more non-ONVIF
cameras — the rows with no MAC — is the case that exercises it. Watch for E11000.

## Findings so far (2026-09-12, bench: one camera on an unmanaged switch)

- **NetworkManager flushes the camera NIC.** See "The camera segment" above. Environmental, but
  it applies to the appliance: the camera NIC must be unmanaged or statically configured in
  netplan, or NM's DHCP client fights fog's own dnsmasq. Spec §11.1 does not mention this.
- **Spec §11.2's link-local alias would break discovery.** §11.2 prescribes
  `ip addr add 169.254.1.250/16`. A /16 is 65533 hosts; `deriveNetwork()` (`cidr.ts:18`) THROWS
  when a network exceeds `SCANNER_MAX_HOSTS` — 256 by default, 1024 in `.env.production`. Neither
  covers it. `listNetworks()` does not catch the throw, so it propagates out of `scan()` and
  `discover()` and aborts the entire inventory. Following the spec's own provisioning step would
  therefore disable discovery completely. **This is a spec/implementation conflict to resolve
  before phase 3**, and it needs per-network isolation in `listNetworks()` regardless — the same
  missing-isolation problem already recorded for channels, one level up. `discoveryTrialSegment.sh`
  adds only the two /24 aliases and documents the omission.
- **The first real camera was statically addressed, not DHCP.** MAC `c8:22:02:5e:0e:71` at
  `192.168.1.21`, announcing by gratuitous ARP every ~12s and ARPing for an absent `192.168.1.1`
  gateway. It never sent a `DHCPDISCOVER`. `192.168.1.21` is **not** any vendor factory default
  from §3.2 — it was configured by a previous installation. Worth noting for §3.2's estimate that
  DHCP-first is "the normal path": the very first camera tried was not.

### The first camera: a real bug, not a camera fault

Camera: ONVIF / **IPC6515F-K**, MAC `c8:22:02:5e:0e:71`, static `192.168.1.21`, ONVIF on port
**8088**. Reported `AUTH_FAILED`. It is not an auth problem — correct credentials are present and
work by hand in 5 ms.

**Defect 1 — `OnvifSoapClient` must not pool connections.** Node's global HTTP agent has
`keepAlive: true` by default since Node 19. This camera closes the TCP connection after each
response, so every *second* axios request reuses a dead socket and fails `socket hang up`.
Measured, six identical requests:

```
axios default:            ok  HANG ok  HANG ok  HANG
Connection: close header: ok  HANG ok  HANG ok  HANG
agent keepAlive=false:    ok  ok   ok  ok   ok  ok
```

The `Connection: close` request header does **not** fix it; only an explicit
`new http.Agent({ keepAlive: false })` does. Needs an `https.Agent` too for TLS xaddrs.

**Defect 2 — `authenticate()` misclassifies transport errors as wrong credentials.**
`onvifCapabilityProbe.service.ts` catches every exception in the credential loop and moves to the
next pair. With defect 1 present the loop read:

```
creds[0] admin   -> AxiosError: socket hang up            <- the CORRECT pair, discarded
creds[1] admin   -> OnvifFaultError: Sender not Authorized
creds[2] admin   -> AxiosError: socket hang up
...
```

The correct credential was thrown away because of a transport error and the camera was reported
`AUTH_FAILED` — the status that dispatches a human with a reset button. This is the follow-ups
item "AUTH_FAILED conflates credential rejection with transport failure", now confirmed on
hardware and **worse than recorded**: it produces a false `AUTH_FAILED` even when correct
credentials are configured. `OnvifFaultError` already distinguishes the two cases.

**Also noted:** the ONVIF service is on port 8088, which is not in `ONVIF_CANDIDATE_PORTS`
(`80,8000,8899,2020`). It was only found because WS-Discovery supplied the xaddr. A camera that
does not answer WS-Discovery on this port would be missed entirely.

Device clock is 6.74 days slow, but this device does not enforce the WS-Security timestamp window
— auth succeeds with and without the offset. The §17 clock prediction held; the consequence did not.

### Result after the two fixes: ONVIF_READY

```
IPC6515F-K  C8:22:02:5E:0E:D1  192.168.1.21  status ONVIF_READY  discoveredVia [neighbor, onvif]
firmware 1.03.0470046f.02n46279.T107.2 · hasPtz true · hasAudio true · 21965 ms
record 3840x2160 rtsp://192.168.1.21:554/avstream/channel=1/stream=0.sdp
live    704x576  rtsp://192.168.1.21:554/avstream/channel=1/stream=1.sdp
```

**Phase 2 input:** this camera needs no adapter for *discovery* — generic ONVIF yielded identity,
capabilities and both stream URLs. But it reports `Manufacturer` as the literal string **"ONVIF"**,
not a brand. Adapter selection in §6.2/§6.3 cannot key off the manufacturer string for this device;
the OUI (`c8:22:02`) or `HardwareId` would have to drive it. Worth confirming across the approved
models before phase 2 designs the registry lookup.

**Still unvalidated after this run:**

- **The `nmap` channel has never worked on hardware.** Both successful runs were launched without
  `sudo`, so `nmap -sn -PR` had no raw-socket privileges. `discoveredVia` shows `neighbor` only
  because an unrelated ping sweep had just populated the ARP table — remove that accident and this
  camera is found by `onvif` alone. Two of the four evidence channels remain unproven.
- **The `lease` channel** — no camera has taken a DHCP lease yet; the lease file is still empty.
- **`IP_CONFLICT` (§5.3)** — never exercised. Note two different devices have now answered at
  `192.168.1.21` (`c8:22:02:5e:0e:71` earlier, `...:0e:d1` now); if both are present at once this
  becomes reproducible on the bench.

## After the trial

Feed the outcome back into `2026-09-07-camera-discovery-phase-1-followups.md`: anything the trial
proves harmless can be downgraded, and anything it bites on moves to "should be done early in
Phase 2". The `ONVIF_READY` / needs-adapter split is the input to Phase 2 scoping (§6.3).
