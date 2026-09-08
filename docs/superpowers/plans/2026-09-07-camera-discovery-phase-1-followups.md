# Camera Discovery Phase 1 — deferred follow-ups

Findings raised during Phase 1 review that were deliberately NOT fixed, each with the reason.
Recorded so Phase 2/3 inherits the reasoning rather than rediscovering it.

Branch: `feat/camera-discovery-phase-1` (22 task commits + 5 final-fix commits).
State at close: 33 suites / 154 tests passing, `npm run build` exit 0.

## Should be done early in Phase 2

- **Consolidate the five XML leaf readers.** `fast-xml-parser` returns `{'#text': …, attr: …}`
  for a leaf carrying an attribute; a naive `typeof x === 'string'` check discards it silently.
  This bit three times independently and two more sites were found unguarded during the final
  review. Five sites now each carry their own unwrap, and they have already diverged (one
  returns `undefined` for `''`, another returns `''`, a third handles arrays). Suggested home:
  `src/modules/videoDevices/infra/xml/xmlText.ts` exporting `text()` and `asArray()` — it is
  about parser output shape, not about ONVIF or network scanning, so it belongs in neither.
  Note `asArray` currently lives in an `@Injectable` service file.
- **Build the canned-SOAP fake ONVIF device** (design spec §15.3). It is the one Phase-1 test
  asset the spec names and it does not exist. No test drives real XML through the real parser
  into the ONVIF services — every parser assumption is asserted by hand. This is the direct
  structural cause of the bug class above.
- **Testcontainers integration test for the repository.** The repository is tested only against
  a mocked Mongoose model, which structurally cannot catch: schema compilation (`streams`
  resolves to `Mixed`, so no validation on the field carrying RTSP paths), index semantics (the
  `partialFilterExpression` change is invisible to every test — E11000 is simulated, never
  produced), and `castUpdate` behaviour (the never-erase guarantee lives entirely in mongoose's
  cast layer, outside the mock).
- **Per-channel isolation in `CameraNetworkScannerService.scan()`.** Every other layer degrades
  gracefully — the lease channel, the merge, the repository writes, the probe — but the loop
  orchestrating them still aborts every network on any single channel failure.

## Correctness, lower urgency

- `hostname` is parsed from leases, merged, and tested, but never mapped into `DiscoveredCamera`.
  It is the only free `suggestedName` source for cameras that do not answer WS-Discovery — i.e.
  exactly the `ONVIF_UNREACHABLE`/`AUTH_FAILED` rows where `suggestedName` is always absent today.
- `findAllFresh` and `onvif.discoveryTtlMinutes` have no production caller. The ack publishes the
  in-memory scan, so a camera missing from *this* scan vanishes — the failure the cache exists to
  prevent. **Tie to:** the `lean()` cast omits `_id`/`__v`; harmless only while there is no caller,
  an unfiltered leak to cloud the moment one is wired.
- Stale conflict flags cannot be cleared. `castUpdate` drops `undefined` `$set` keys — the property
  that protects identity on a thinner re-scan — so once `conflictMacAddresses`,
  `conflictEndpointReferences` or `multiHomed` is written, no later scan can unset it. After
  Phase 2 re-addresses a colliding pair the rows still report the conflict. Needs `$unset` or `?? []`.
- `AUTH_FAILED` conflates credential rejection with transport failure. A camera that answers the
  unauthenticated `GetSystemDateAndTime` then times out is reported `AUTH_FAILED`, which is the
  signal that dispatches a human with a reset button. `OnvifFaultError` already distinguishes them.
- No timebox beyond the per-request timeout. No per-device or per-scan budget and `autoSearch()`
  passes no `AbortSignal`, so a busy /24 runs unbounded and uncancellable.
- `OFF_SUBNET` status (spec §5.4) is not produced — there is no alias concept in
  `PhysicalEthernetProvider`. A Phase-1 §5 requirement deliberately not delivered.
- Spec §6.5 gaps: `GetNetworkInterfaces` DHCP/static state not read (Phase 3 needs it);
  `hasPtz` not cross-checked against `GetServices`, so a camera with a PTZ service but no
  PTZ-bearing profile reports `hasPtz: false`.
- The Media2 (ver20) branch has no test — every `getServices` mock returns ver10. Profile-T
  cameras exposing only ver20 are common.
- `discoveredCameras` is never pruned: no TTL index, `findAllFresh` only filters reads.

## Operational / repo hygiene

- **`npm run lint` is broken repo-wide and predates this work.** `package.json` pins
  `eslint ^10.8.1`, which requires flat config, but the repo has `.eslintrc.js`. The `lint`
  script and `lint-staged` are both non-functional. The husky `pre-commit` hook is empty, so
  nothing was silently skipped during Phase 1.
- **`ONVIF_DEFAULT_CREDENTIALS` holds camera admin passwords as a plaintext `env_file` value**
  while this repo has an established `_FILE` + docker-secrets convention with a hard preflight
  in `docker-entrypoint.sh`. Phase 3 replaces this with the cloud catalog, but until then it is
  the weakest secret handling in the stack.
- No `ONVIF_*`, `NMAP_EXECUTABLE`, `DNSMASQ_LEASE_FILE`, `SCANNER_*` or `TENANT_ID` entry exists
  in `.env.production` or the deployment README.
- `configs/app.config.ts`: `candidatePorts.map(Number)` and `JSON.parse(defaultCredentials)` are
  unvalidated — malformed values degrade to `NaN` ports or per-credential exceptions rather than
  failing at startup.
- No test links a config key *name* to its consumer. Every consumer mocks `AppConfig()`, so
  renaming `networkScanner.nmapExecutable` leaves all 154 tests green while the container fails
  at runtime. One "real `AppConfig()` shape contains the keys the code reads" smoke test closes it.
- `cameraConfigsMqtt.service.ts` still uses `.js` extension imports and is therefore unloadable
  under jest (jest's `moduleNameMapper` does not strip the extension). Whoever writes its tests
  will hit this wall.
- `CameraNetworkScannerService.scan()` and `OnvifDiscoveryService.discover()` have no tests of
  their own — only their extracted pure functions are covered. The DI wiring, per-network
  filtering, nmap argv and socket lifecycle are untested.

## Accepted, with a caveat worth remembering

- The `partialFilterExpression` index fix is correct but **unverified locally** — no Mongo server
  in the dev environment. Needs a real check before a site with multiple non-ONVIF cameras.
- `AppConfig().onvif.defaultCredentials` defaults to `[]`, so a stock deployment marks every
  camera `AUTH_FAILED`. Deliberate Phase-1 stand-in for the Phase-3 product catalog.
- The cloud counterpart has not been updated to consume `discoveredCameras` (it expects
  `macAddresses`). The ack is fire-and-forget inside a try/catch, so fog degrades quietly rather
  than breaking — but the inventory goes nowhere until the cloud handler lands.
