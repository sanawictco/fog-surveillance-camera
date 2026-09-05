# Fog cloud-connection module, baseCloudCommunication, and recovery reliability

**Date:** 2026-09-02
**Repos touched:** `fog-surveillance-camera` (primary), `cloud-surveillance-camera` (one scoped addition)
**Reference implementation:** `platform-sanaw/gateway-backend-v2` (fog layer for `workspace-backend-v2`)

## 1. Context

`fog-surveillance-camera` is the fog layer for `cloud-surveillance-camera`, the same
relationship `gateway-backend-v2` has with `workspace-backend-v2`. A prior session
already ported most of gateway's `cloudConnection` module into this repo
(`src/modules/cloudConnection/`), adapted for NVR/camera instead of
Gateway/ruleChains. This spec covers what's still missing, and fixes discovered by
diffing the fog implementation against both the gateway reference and the actual
`cloud-surveillance-camera` counterpart (not just gateway's counterpart, since fog's
real peer is a different, independently-built project).

Two facts drove the scope here:

1. `cloud-surveillance-camera`'s own MQTT topic module states outright: *"The fog
   client is not deployed yet, so this is the only topic hierarchy."* Fog's topic
   getters predate that contract and use a different shape entirely. Nothing over
   MQTT between fog and cloud works today, independent of anything else in this
   spec.
2. Fog's `CloudRecoveryService` already exports the offline TDengine audit trail
   (actor/system logs) into the backup archive it uploads, but
   `cloud-surveillance-camera`'s restore handler only consumes the `mongo/` half of
   that archive. The `tdengine/dbs.sql` member is uploaded and silently discarded.

## 2. Goals

- Add `BaseCloudCommunicationService`, the fog equivalent of gateway's
  `src/shared/baseCloudCommunication.service.ts`.
- Bring the existing `cloudConnection` module's reliability up to parity with
  gateway's (which has its own documented bug-fix history worth not re-introducing).
- Make cloud recovery actually reach a working end state: cloud must receive the
  heartbeat and the recovery ack over MQTT, and must actually import what fog backs
  up, before fog is allowed to start dropping its local copy of that data.

## 3. Explicitly out of scope (found, not fixed here)

- **`fogLiveSignal` MQTT ack payload** — cloud's `NvrLiveSignalMqttResponseDto`
  requires `disconnectedMacAddresses: string[]`; fog's
  `NvrAutoProvisioningService.processLifecycle()` currently acks with just
  `{msgId}`. This is a real bug but belongs to the video-device-config protocol,
  not cloud-connection/recovery. Noting it for a separate pass.
- **Live system-log MQTT streaming to cloud** — fog publishes on
  `NvrEntity.getFogPubToCloudMqttTopics().videoDeviceSystemLogs`; cloud has no
  topic, controller, or handler for it at all (only the offline/TDengine-backup
  path lands system logs in the cloud). Leaving fog's topic string as-is (nothing
  to align it to) and flagging this as a product decision: is live log streaming a
  real requirement, or is batch-via-recovery the only intended path?
- **`CameraEntity.getFogPubToCloudMqttTopics().cameraData`** (fog → cloud) has no
  receiving contract on the cloud side at all (cloud never parses a camera response
  topic) and no call site in fog either. Left as dead code; not invented a shape
  for it.
- Cloud's queue/lock/expiry bookkeeping for device-config responses
  (`VideoDeviceConfigQueueService`, `NvrRunningConfigService`, etc.) is cloud's own
  internal correlation mechanism — fog does not need to and will not replicate it.

## 4. `BaseCloudCommunicationService`

New file: `src/modules/shared/cloudConfig/baseCloudCommunication.service.ts`,
mirroring gateway's `src/shared/baseCloudCommunication.service.ts` almost 1:1,
adapted to fog's config/entity names (`nvrAccessToken`/`nvrSerialNumber` instead of
`gatewayAccessToken`/`gatewaySerialNumber`; `configType` union covers
`'videoDevice' | 'page'`, matching cloud's `FogVideoDeviceConfigRequestDto`).

```ts
@Injectable()
export abstract class BaseCloudCommunicationService {
  constructor(
    protected readonly mqttService: MqttService,
    protected readonly serviceProvider: ServiceProvider,
  ) {}

  protected abstract getConfigType(): 'videoDevice' | 'page';
  protected abstract getSoftwareConfigTopic(): string;

  protected async publishToMqtt(topic: string, msg: unknown): Promise<void> { ... }
  async sendSoftwareConfigMsgId(msg: { msgId: string; mqttData?: unknown }): Promise<void> { ... }
  async getSoftwareConfigFromCloud(msgId: string): Promise<CloudConfigResponse> { ... }
  private buildCloudConfigPayload(msgId: string, config): CloudConfigPayload { ... }
  private async handleCloudError(err: unknown, msgId: string): Promise<never> { ... }
  protected logCloudError(msgId: string, error: Error): void { ... }
}
```

`CloudConfigClientService` (`src/modules/shared/cloudConfig/cloudConfigClient.service.ts`)
stays as the standalone client `NvrAutoProvisioningService` already depends on and
has tests for — it is not refactored to extend the new base class, because its
`fetch()` contract (returning the full typed `FogVideoDeviceConfig` union) is
already correct and used by an already-tested call site. Instead,
`DashboardCloudCommunicationService` (`src/modules/dashboard/applicationService/services/dashboardCloudCommunicationService.ts`)
is refactored to **extend** `BaseCloudCommunicationService`. Confirmed (read the
current file): it already duplicates the exact legacy ad hoc pattern — same
constructor shape (`mqttService`, `serviceProvider`), same two method names
(`sendSoftwareConfigMsgId`, `getSoftwareConfigFromCloud`) the base class defines —
plus a real bug the refactor fixes as a side effect: it currently posts
`msgId: Number(msgId)`, while cloud's `FogVideoDeviceConfigRequestDto.msgId` is
validated as an opaque string (`@IsDeviceMsgId()`), the same leading-zero
corruption `CloudConfigClientService`'s existing test explicitly guards against.
The base class's `buildCloudConfigPayload` sends `msgId` as a string, so extending
it fixes this for free.

## 5. `cloudConnection` module fixes

All in `src/modules/cloudConnection/`, matching gateway's already-fixed behavior:

1. **Reset `cloudFailedAt` on successful ack.** `CloudRecoveryService.getCloudRecoveryAck()`
   adds `UpdateNvrCommand({ id: AppConfig().nvrId, cloudFailedAt: CloudFailedAt.init().unpack() })`
   before flipping `CLOUD_IS_AVAILABLE`, matching gateway's `getCloudRecovertAck()`.
   Without this, `checkCloudIsAvailableNow()`'s `cloudFailedAt !== 0` guard stays
   true forever after the first outage, and every future heartbeat re-triggers a
   full recovery cycle.
2. **Move the offline transition out of the `catch` block.** `CloudConnectionService.checkConnectionStatus()`
   currently only calls `CLOUD_IS_AVAILABLE = false` / `UpdateNvrCommand` inside the
   `catch` after `dns.lookup()` + `mqttReconnect()` — the exact bug gateway's own
   code comment documents fixing (`mqttReconnect()` swallows its own errors, so the
   catch is rarely reached). Fix: mark the NVR offline unconditionally once the
   missed-heartbeat threshold is hit, then attempt DNS lookup + reconnect as a
   best-effort nudge in its own try/catch that no longer gates the offline
   transition — matching gateway's `checkingConnectionStatusWithCloudAtRuntime()`.
3. **Structural:** move `cloudRecovery.service.ts` from `applicationService/` to
   `applicationService/services/`, matching gateway's layout and fog's own
   `cloudConnection.service.ts`. Update the four import sites
   (`cloudConnection.module.ts`, `cloudConnection.service.ts`,
   `checkAccessToFog.middleware.ts`, `mqtt.service.ts`).
4. **Do not add gateway's `clearData()`-on-ack calls yet.** Gateway's
   `getCloudRecovertAck()` clears local actor/ruleChain/system logs once cloud acks.
   Fog's currently doesn't. This stays deferred until the cloud-side TDengine
   import (§8) actually lands and is verified — then it's a one-line
   follow-up (inject `ActorLogApiForCloudConnectionService` /
   `SystemLogApiForCloudConnectionService`, call `.clearData()` in
   `getCloudRecoveryAck()`, matching gateway exactly). Doing it before §7 exists
   would silently destroy the only copy of the offline audit trail.

## 6. Middleware wiring

`AppModule` currently has no `configure()` at all — neither
`CheckAccessToFogMiddleware` (the recovery write-gate) nor `ProtectionMiddleware`
(JWT auth) is applied to any route, and no controller uses `@UseGuards` as an
alternative. Add `configure(consumer: MiddlewareConsumer)` to
`src/app.module.ts`, mirroring gateway's:

```ts
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(CheckAccessToFogMiddleware)
    .exclude({ path: '/system-monitor/health', method: RequestMethod.GET })
    .forRoutes('*');
  consumer
    .apply(ProtectionMiddleware)
    .exclude({ path: '/system-monitor/health', method: RequestMethod.GET })
    .forRoutes('*');
}
```

(Gateway also excludes `/user/login`; fog has no such route today — checked, there
is no login/auth controller in this repo yet, so no exclusion is added beyond
health. If a login route is added later it needs the same exclusion.)

## 7. MQTT topic alignment (fog ⇄ `cloud-surveillance-camera`)

Cloud's canonical, single topic contract lives in
`cloud-surveillance-camera/src/modules/videoDevices/shared/deviceMqttTopics.ts`.
Fog's `NvrEntity`/`CameraEntity`/`PageEntity` topic getters are rewritten to
produce exactly those strings (no new shared topic file in fog — gateway doesn't
have one either, and each entity already owns its own topic getters):

| Purpose | Direction | Old (fog) | New (matches cloud) |
|---|---|---|---|
| NVR config push | cloud→fog | `${tenantId}/${nvrId}/videoDevice/Config/pub` | `tenants/${tenantId}/nvrs/${nvrId}/config/to-fog` |
| NVR config ack | fog→cloud | `${tenantId}/${nvrId}/videoDevice/Config/sub` | `tenants/${tenantId}/nvrs/${nvrId}/config/to-cloud` |
| Cloud availability heartbeat | cloud→fog | `${tenantId}/${nvrId}/cloudIsAvailable/pub` | `tenants/${tenantId}/nvrs/${nvrId}/cloud-status/to-fog` |
| Cloud recovery ack | cloud→fog | `${tenantId}/${nvrId}/cloudRecoveryData/pub` | `tenants/${tenantId}/nvrs/${nvrId}/cloud-recovery/to-fog` |
| Page config push | cloud→fog | `${tenantId}/${nvrId}/page/config/pub` | `tenants/${tenantId}/nvrs/${nvrId}/pages/to-fog` |
| Page config ack | fog→cloud | `${tenantId}/${nvrId}/page/config/sub` | `tenants/${tenantId}/nvrs/${nvrId}/pages/to-cloud` |
| Camera data push | cloud→fog | `${nvrId}/+/camera/data/pub` (wildcard, no tenant) | `tenants/${tenantId}/nvrs/${nvrId}/cameras/to-fog` (single, per-NVR — cloud addresses camera commands to the NVR, not per-camera) |

Verified compatible without payload changes: `cloudIsAvailable` (payload is the
literal string `'1'`, unused by fog's handler) and `cloudRecoveryDataAck` (payload
`'cloud recovery finished'`, also unused/ignored by fog's handler) — so these two,
the ones cloud recovery actually depends on, are pure string renames.

Verified compatible: NVR config ack payloads. Cloud validates the fog response
against one of `NvrSearchMqttResponseDto` / `NvrRegisterMqttResponseDto` /
`NvrLifecycleMqttResponseDto` by structural discriminator (`macAddresses` /
`unRegisteredCameraSerialNumbers` / neither). Fog's `NvrAutoProvisioningService.publish()`
already produces matching shapes for search/register/update/active/inactive/delete
— confirmed field-for-field against the DTOs. (The one exception,
`fogLiveSignal`/`NvrLiveSignalMqttResponseDto`, is called out in §3 as deferred.)

`NvrEntity.getFogSubOnCloudMqttTopics()` also currently returns a `pageConfig` key
that duplicates `PageEntity`'s own `pageConfigs` topic and has no call site beyond
the object-values spread in `mqtt.service.ts` (i.e., fog subscribes to it but
nothing ever handles a message received there). Removing it as dead code while
touching this method.

`CameraEntity.getFogSubOnCloudMqttTopics().cameraData` is retained and renamed
(cloud does publish there), even though nothing in fog currently handles that event
either — that gap is pre-existing and out of scope (§3), but the topic string
itself is worth fixing so a future handler isn't built against a dead address.

## 8. Cloud-side TDengine import (`cloud-surveillance-camera`)

`FogCommunicationManagerService.restoreFogBackupToCloud()` currently:
`tar -tf` the archive → `selectMongoBackupMembers()` → extract `mongo/*.json` →
`mongo-restore.sh` → ack. It never looks at `tdengine/dbs.sql`.

Fog's export (`CloudRecoveryService.exportTimeSeriesInserts()`) already writes that
file as a sequence of tenant/nvr-scoped `INSERT INTO ... USING <stable> (tenantId, ...)
TAGS (...) VALUES (...)` statements against fog's own actor/system-log super
tables — not taosdump's binary dump format, so this is **not** the same shape as
`workspace-backend-v2`'s taosdump-based restore of gateway's backups; it's a plain
SQL script.

Plan, following the same "run the vetted tool locally, scoped, with a
tenant/nvr ownership check before executing" pattern the mongo restore already
uses:

1. Extract `tdengine/dbs.sql` from the archive alongside the existing mongo
   extraction (add it to `selectMongoBackupMembers` sibling logic, or a parallel
   `selectTdengineBackupMember`).
2. Add a `restoreTimeSeriesInserts(tenantId, nvrId, sqlFilePath)` step that:
   - Reads the file, splits into individual `INSERT` statements.
   - **Validates every statement references only that NVR's own scoped super
     tables** (`actorLogSuperTableName(tenantId)` / `systemLogSuperTableName(tenantId)`,
     the same helpers fog used to write them) before executing anything — an
     uploaded file is attacker-reachable input; this must never be able to write
     outside the calling NVR's own tenant scope, mirroring the identity checks
     `assertNvrOwnsTopic`/`assertCameraOwnsQueuedMessage` already apply elsewhere
     in this controller family.
   - Executes each statement through the existing `TDengineService` (`@tdengine/websocket`
     client already wired in `app.module.ts`), the same client `actorLog.timeseriesRepository.ts`
     / `systemLog.timeseriesRepository.ts` use.
   - Runs after the mongo restore succeeds, inside the same try/catch that calls
     `videoDevicesApiForFogCommunicationManagerService.completeFogCloudRecovery()` —
     i.e., the ack fires only once *both* imports succeed, making fog's existing
     code comment ("cloud completes recovery only after both the Mongo and
     TDengine imports succeed") actually true.
   - On failure, falls into the existing `resetFogCloudRecovery` catch path (no
     ack), so fog's `RECOVERY_PROCESS_INITIALIZED` stays set and — per fog's
     existing (unchanged) retry model — nothing currently re-drives a retry
     automatically; this matches gateway/workspace's same limitation and is not
     newly introduced here.
   - An empty `dbs.sql` (fog writes `''` when there were zero offline rows) is a
     no-op, not an error.
3. Once this lands and its own tests pass, come back to fog §5.4 and wire the
   `clearData()` calls.

## 9. Testing

- `BaseCloudCommunicationService`: unit test mirroring gateway's coverage
  (successful config fetch, HTTP error → `GLOBAL_ERROR_EVENT` + rethrow, error
  message logged without leaking the access token).
- `CloudConnectionService`: unit tests for the `cloudFailedAt` reset on ack, and
  for the offline transition firing even when `mqttReconnect()`'s internal catch
  swallows its error (i.e., assert `CLOUD_IS_AVAILABLE` flips to `false` and
  `UpdateNvrCommand` fires regardless of DNS/MQTT reconnect outcome).
- `CloudRecoveryService`: extend the existing gateway-style ordering test
  (clean → mongo → tdengine → compress → upload) for fog's version, which doesn't
  have one yet.
- `CheckAccessToFogMiddleware` / `AppModule.configure()`: a route-registration test
  (same style as cloud's own `fogCommunicationManager.controller.routes.spec.ts`)
  asserting both middlewares are applied to `'*'` with the health-check exclusion.
- Topic renames: update the existing topic-returning entity tests (if any) and add
  regression coverage asserting `NvrEntity.getFogSubOnCloudMqttTopics().cloudIsAvailable`
  etc. equal cloud's `deviceMqttTopics.ts` output for the same inputs — a golden
  reference so future drift is caught immediately rather than rediscovered by
  another full audit.
- Cloud-side TDengine import: unit test for the tenant/nvr-scope statement
  validator (rejects a statement targeting a foreign stable), and an integration
  test (Testcontainers TDengine) for the full extract→validate→execute path,
  following this repo's `testing` skill/standard.

## 10. Rollout order

1. `BaseCloudCommunicationService` + `DashboardCloudCommunicationService` refactor (§4)
2. `cloudConnection` module fixes (§5, minus 5.4) + middleware wiring (§6)
3. MQTT topic alignment (§7) — fog side
4. Cloud-side TDengine import (§8) — `cloud-surveillance-camera`
5. Fog `clearData()`-on-ack wiring (§5.4), only after §8 is verified

Steps 1-3 are independently useful even if §8 slips. Step 5 is explicitly gated on
step 4 to avoid a data-loss window.
