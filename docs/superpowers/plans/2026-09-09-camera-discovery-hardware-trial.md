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
2. `test -f /var/lib/misc/dnsmasq.leases || sudo touch /var/lib/misc/dnsmasq.leases`
   The compose file bind-mounts this path. If it does not exist, Docker creates a **directory**
   there and the lease channel degrades to nothing — visible only as a `warn` line
   ("dnsmasq lease file could not be read"), not an error.
3. Confirm `SCANNER_MAX_HOSTS=1024` covers the camera subnet (a /24 is 254 hosts; a /21 exceeds it).
4. Confirm `ONVIF_DEFAULT_CREDENTIALS` is populated (d451672). If it were empty, every camera
   would report `AUTH_FAILED` and the trial would tell you nothing.

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

## After the trial

Feed the outcome back into `2026-09-07-camera-discovery-phase-1-followups.md`: anything the trial
proves harmless can be downgraded, and anything it bites on moves to "should be done early in
Phase 2". The `ONVIF_READY` / needs-adapter split is the input to Phase 2 scoping (§6.3).
