# Cloud-side TDengine restore, and fog's clearData()-on-ack wiring

**Date:** 2026-09-03
**Repos touched:** `cloud-surveillance-camera` (primary), `fog-surveillance-camera` (export fix + clearData wiring)
**Supersedes:** §8 and §5.4 of `docs/superpowers/specs/2026-09-02-fog-cloud-connection-and-recovery-design.md` (that spec's §1-7/§10 steps 1-3 are already implemented and merged; this spec covers steps 4-5, corrected against what was actually found in both repos' real code).

## 1. Context

The prior spec's §8 assumed fog's exported TDengine statements were already shaped correctly for cloud to replay. Reading both repos' real code (not assumed) found that's only true for system logs — actor logs have a genuine schema mismatch that would corrupt or reject every restored actor-log row. This spec corrects that assumption and specifies the cloud-side import precisely against the real `FogCommunicationManagerService`/`fogBackupArchive.ts`/`TimeseriesRepository` code, which the prior spec had only described from the outside.

## 2. Bug: fog's actor-log export is missing a required column value

> **This section's premise was wrong, and was reversed after implementation (2026-09-04).** It assumed cloud's schema was correct and fog's export had to conform to it. Verified against the live TDengine 3.3.6.3 both services run, the opposite is true: TDengine **rejects** a stable whose tag name duplicates a column name (`"Duplicated column names"`, code 9788), so cloud's `actorLogColumnNames` — which listed `actorId` alongside the `actorId` tag `ensureSuperTable` declares — could never have been created at all. Cloud's very first actor-log write for any tenant would have failed on `CREATE STABLE IF NOT EXISTS`. Fog's tag-only design (and its code comment citing this exact constraint) was right all along.
>
> **What actually shipped:** cloud's `actorLogColumnNames` dropped `actorId` (4 columns: `createdAt, actorLogType, messageKey, messageParams`), gained an `actorLogSelectedColumns` export for reads that need the tag — mirroring the `systemLogSelectedColumns`/`groupId` precedent that already existed for system logs — and fog's export emits `actorId` **only** in the TAGS clause. The explicit column lists this section introduces are still correct and still shipped; only `actorId`'s presence in them was wrong. Read the code blocks below with `actorId` removed from every actor-log column list and VALUES tuple.

Cloud's actor-log supertable (`cloud-surveillance-camera/src/modules/actorLogs/domain/actorLog.type.ts`) has **5** columns: `createdAt, actorLogType, actorId, messageKey, messageParams` — `actorId` is a real column there, in addition to being a tag (`ensureSuperTable`'s `tags: [tenantId, actorId]`). Fog's own local schema (`fog-surveillance-camera/src/modules/actorLogs/domain/actorLog.type.ts`) has only **4** columns — `actorId` lives tag-only, with an explicit comment: *"Actor id lives only as a tag — select it explicitly alongside columns."*

Fog's `CloudRecoveryService.exportTimeSeriesInserts()` (`fog-surveillance-camera/src/modules/cloudConnection/applicationService/services/cloudRecovery.service.ts`) selects `actorId` from fog's local table (needed for the TAGS clause) but never includes it in the VALUES clause, and the INSERT has no explicit column list:

```ts
// current (buggy for actor logs)
`INSERT INTO ${dbName}.\`${tbname}\` ` +
  `USING ${dbName}.${actorSuperTable} (tenantId, actorId) ` +
  `TAGS (${TimeSeriesDbExtension.getValuesInsertFormat([tenantId, actorId])}) ` +
  `VALUES (${this.actorLogValues(createdAt, actorLogType, messageKey, messageParams)});`,
```

With no column list, TDengine maps the 4 supplied values to the first 4 columns **in the supertable's definition order** on cloud's side: `createdAt, actorLogType, actorId, messageKey`. Replayed as-is, this either raises a column-count error (4 values, 5 columns) or, if TDengine tolerates a partial list positionally, corrupts data (fog's `messageKey` value lands in cloud's `actorId` column, `messageParams` is dropped entirely). System-log statements are unaffected: fog's `systemLogValues` order (`createdAt, messageKey, messageParams, section, entityId`) already matches cloud's `systemLogColumnNames` exactly, and neither side duplicates a tag as a column for system logs.

### 2.1 Fix (fog-side)

In `cloudRecovery.service.ts`:

1. ~~Add `actorId` to `actorLogValues`'s parameter list and output, in cloud's real column position (3rd)~~ — reversed, see §2's revision note. `actorId` stays out of the values entirely; it is emitted only in TAGS. What shipped:

```ts
private actorLogValues(
  createdAt: unknown,
  actorLogType: unknown,
  messageKey: unknown,
  messageParams: unknown,
): string {
  return TimeSeriesDbExtension.getValuesInsertFormat([
    this.exportTimestamp(createdAt),
    String(actorLogType ?? ''),
    String(messageKey ?? ''),
    String(messageParams ?? ''),
  ]);
}

/**
 * The draft used a bare `Number(createdAt)`. Verified against the live TDengine
 * 3.3.6.3: its REST API renders TIMESTAMP columns as RFC3339 strings
 * ("2025-01-01T00:00:00.000Z"), never numeric epoch millis — so `Number(...)`
 * yielded NaN for *every* exported row, emitting a bare `NaN` token that would
 * have failed the whole restore. TDengine accepts a quoted RFC3339 literal for a
 * TIMESTAMP column (round-trip verified), so non-numeric values are kept as
 * strings and quoted by getValuesInsertFormat.
 */
private exportTimestamp(value: unknown): number | string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value ?? '');
}
```

2. Update the call site and **add an explicit column list** to the INSERT (removes the positional-order footgun for both statement types, going forward — this is the actual fix; the added `actorId` value alone would still be silently fragile to the next schema change):

```ts
for (const row of actorRows) {
  const [tbname, createdAt, actorLogType, actorId, messageKey, messageParams] =
    row.map(this.exportCellValue);
  statements.push(
    `INSERT INTO ${dbName}.\`${tbname}\` ` +
      `USING ${dbName}.${actorSuperTable} (tenantId, actorId) ` +
      `TAGS (${TimeSeriesDbExtension.getValuesInsertFormat([tenantId, actorId])}) ` +
      `(createdAt, actorLogType, messageKey, messageParams) ` +
      `VALUES (${this.actorLogValues(createdAt, actorLogType, messageKey, messageParams)});`,
  );
}
```

3. Same for the system-log statement, for consistency and to defend the same way against future column-order drift (values unchanged, only the column list is new):

```ts
`(createdAt, messageKey, messageParams, section, entityId) ` +
  `VALUES (${this.systemLogValues(createdAt, messageKey, messageParams, section, entityId)});`,
```

The column names in both lists are the fixed literal names cloud's schema uses (`actorLogColumnNames`/`systemLogColumnNames` in cloud's domain type files) — not derived from anything dynamic on fog's side, since fog has no reason to know cloud's column list beyond this fixed, shared contract.

## 3. Cloud-side archive extraction

`fogBackupArchive.ts`'s `selectMongoBackupMembers` already recognizes a `tdengine` path segment but silently `continue`s past it — it neither selects nor rejects it. Extend it to capture and validate the member, mirroring the mongo branch's strictness:

```ts
export interface FogBackupMembers {
  nvrs?: string;
  cameras?: string;
  pages?: string;
  tdengine?: string;
}
```

(Rename `MongoBackupMembers` → `FogBackupMembers` since it now covers both halves of the archive; update the one import site in `fogCommunicationManager.service.ts`.)

```ts
const tdengineIndex = segments.indexOf('tdengine');
if (tdengineIndex >= 0) {
  if (segments.length !== tdengineIndex + 2) {
    throw new BadRequestException('Fog backup TDengine layout is invalid');
  }
  const fileName = segments[tdengineIndex + 1]!;
  if (fileName !== 'dbs.sql') {
    throw new BadRequestException(
      `Fog backup TDengine entry is not allowed: ${fileName}`,
    );
  }
  if (selected.tdengine) {
    throw new BadRequestException('Fog backup contains duplicate TDengine data');
  }
  selected.tdengine = name;
  continue;
}
```

This is a **behavior change**: an archive with a `tdengine/data.sql` (wrong filename) or a nested `tdengine/sub/dbs.sql` now throws, where it was previously silently ignored. This is intentional — the archive layout is fixed and known (fog always writes exactly `tdengine/dbs.sql`), and silently ignoring an unexpected member in what's about to become executable-SQL territory is the wrong default for attacker-reachable input. `fogBackupArchive.spec.ts`'s existing table-driven cases that currently list a tolerated `tdengine/data.sql`/`tdengine/` entry need updating to reflect the new strict behavior (see §7).

`tdengine` member absence is not an error (mirrors mongo's per-key optionality) — an archive with only mongo data (no TDengine backup step ever ran, or `dbs.sql` was empty and fog's own `createTimeSeriesBackup` still wrote a `tdengine/` directory containing an empty file that still gets listed by tar) is valid.

## 4. Cloud-side import execution

### 4.1 Extraction

In `restoreFogBackupToCloud`, alongside the existing mongo directory/extraction:

```ts
const tdengineDirectory = join(stagingRoot, 'tdengine');
...
await mkdir(tdengineDirectory, { recursive: true });
...
const members = selectMongoBackupMembers(listing); // now returns FogBackupMembers
for (const [collection, member] of Object.entries(members)) {
  if (!member || collection === 'tdengine') continue;
  await this.extractArchiveMember(file.path, member, join(mongoDirectory, `${collection}.json`));
}
if (members.tdengine) {
  await this.extractArchiveMember(file.path, members.tdengine, join(tdengineDirectory, 'dbs.sql'));
}
```

### 4.2 Restore step — parse, validate, rebuild, execute

New method `restoreTimeSeriesInserts(tenantId: string, nvrId: string, sqlFilePath: string): Promise<void>` on `FogCommunicationManagerService`, called **after** the existing mongo `mongo-restore.sh` step succeeds, inside the same inner `try` (so a TDengine failure hits the same `catch` → `resetFogCloudRecovery` path the mongo failure already does — the ack only fires once both succeed, matching the existing single-flow structure, no new branching needed).

**This section was revised after implementation.** The original draft here captured the VALUES clause with a greedy `(.*)` on the theory that "it's just data, already quoted identically on both sides." That was wrong and shipped as a real vulnerability, caught by task-level review before it reached the main flow: TDengine's `INSERT` grammar allows chaining multiple `tb USING stb TAGS(...) (...) VALUES(...)` clauses in one statement with **no semicolon needed between clauses, only at the very end**. A greedy `(.*)` anchored only to the last `);` on the line let an authenticated tenant A's own valid, correctly-scoped statement smuggle a second, complete `INSERT` clause targeting tenant B's supertable — the tenant-scope check only ever inspected the *first* table's name, so it passed, and the executed statement wrote into tenant B's data. The fix below (what actually shipped, independently re-verified during final review by fuzzing ~400,000 candidate statements through a real SQL lexer under two escaping conventions, finding zero bypasses) replaces the blob capture with a strict, structurally-bounded grammar and stops trusting fog's own claimed TAGS tenantId value:

```ts
const STR = /'(?:[^'\\]|\\\\|'')*'/.source; // a properly single-quoted, properly-escaped SQL string literal — handles both `''` and `\\` escaping, matching TimeSeriesDbExtension.quoteStringLiteral's own escaping exactly
const NUM = /-?\d+/.source;
// actorId is a TAG only (see §2's revision note) — TDengine rejects a stable whose tag
// name duplicates a column name — so the actor tuple is one shorter than the system one.
const ACTOR_LOG_VALUES_TUPLE = `\\s*${NUM}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*`; // exactly 4 primitives
const SYSTEM_LOG_VALUES_TUPLE = `\\s*${NUM}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*,\\s*${STR}\\s*`; // exactly 5 primitives
const TAGS_TWO = `\\s*${STR}\\s*,\\s*(${STR})\\s*`; // first tag (tenantId) matched but NOT captured — fog's claim is never trusted; second tag (actorId/groupId) is captured and reused as-is

const ACTOR_LOG_INSERT = new RegExp(
  '^INSERT INTO \\S+\\.`([0-9a-z_]+)` USING \\S+\\.(actor_log_t_[0-9a-f]+) \\(tenantId, actorId\\) TAGS \\(' +
    TAGS_TWO +
    '\\) \\(createdAt, actorLogType, messageKey, messageParams\\) VALUES \\((' +
    ACTOR_LOG_VALUES_TUPLE +
    ')\\);$',
);
const SYSTEM_LOG_INSERT = new RegExp(
  '^INSERT INTO \\S+\\.`([0-9a-z_]+)` USING \\S+\\.(system_log_t_[0-9a-f]+) \\(tenantId, groupId\\) TAGS \\(' +
    TAGS_TWO +
    '\\) \\(createdAt, messageKey, messageParams, section, entityId\\) VALUES \\((' +
    SYSTEM_LOG_VALUES_TUPLE +
    ')\\);$',
);

async restoreTimeSeriesInserts(
  tenantId: string,
  nvrId: string,
  sqlFilePath: string,
): Promise<void> {
  const content = await readFile(sqlFilePath, 'utf8');
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return; // empty dbs.sql (zero offline rows) is a no-op

  const expectedActorSuperTable = actorLogSuperTableName(tenantId);
  const expectedSystemSuperTable = systemLogSuperTableName(tenantId);
  const actorTenantPrefix = expectedActorSuperTable + '_';
  const systemTenantPrefix = expectedSystemSuperTable + '_';

  interface ParsedStatement { tbname: string; tagValue: string; values: string }
  const actorStatements: ParsedStatement[] = [];
  const systemStatements: ParsedStatement[] = [];

  // Validate every line before executing anything, so a rejected file never
  // leaves a partially-applied restore.
  for (const line of lines) {
    const actorMatch = ACTOR_LOG_INSERT.exec(line);
    const systemMatch = actorMatch ? null : SYSTEM_LOG_INSERT.exec(line);
    if (!actorMatch && !systemMatch) {
      throw new BadRequestException('Fog TDengine backup contains an unrecognized statement');
    }

    if (actorMatch) {
      const [, tbname, superTable, tagValue, values] = actorMatch;
      if (superTable !== expectedActorSuperTable || !tbname!.startsWith(actorTenantPrefix)) {
        throw new BadRequestException('Fog TDengine backup statement targets a foreign tenant');
      }
      actorStatements.push({ tbname: tbname!, tagValue: tagValue!, values: values! });
    } else {
      const [, tbname, superTable, tagValue, values] = systemMatch!;
      if (superTable !== expectedSystemSuperTable || !tbname!.startsWith(systemTenantPrefix)) {
        throw new BadRequestException('Fog TDengine backup statement targets a foreign tenant');
      }
      systemStatements.push({ tbname: tbname!, tagValue: tagValue!, values: values! });
    }
  }

  if (actorStatements.length > 0) {
    await this.actorLogRepository.ensureSuperTable(tenantId);
    const trustedTenantTag = TimeSeriesDbExtension.getValuesInsertFormat([tenantId]);
    for (const { tbname, tagValue, values } of actorStatements) {
      const { superTableInsertFormat, subTableInsertFormat } =
        TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(expectedActorSuperTable, tbname);
      await this.tdengineClient.exec(
        `INSERT INTO ${subTableInsertFormat} USING ${superTableInsertFormat} (tenantId, actorId) ` +
          `TAGS (${trustedTenantTag}, ${tagValue}) (${actorLogColumnNames.join(', ')}) VALUES (${values});`,
      );
    }
  }

  if (systemStatements.length > 0) {
    await this.systemLogRepository.ensureSuperTable(tenantId);
    const trustedTenantTag = TimeSeriesDbExtension.getValuesInsertFormat([tenantId]);
    for (const { tbname, tagValue, values } of systemStatements) {
      const { superTableInsertFormat, subTableInsertFormat } =
        TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(expectedSystemSuperTable, tbname);
      await this.tdengineClient.exec(
        `INSERT INTO ${subTableInsertFormat} USING ${superTableInsertFormat} (tenantId, groupId) ` +
          `TAGS (${trustedTenantTag}, ${tagValue}) (${systemLogColumnNames.join(', ')}) VALUES (${values});`,
      );
    }
  }
}
```

Key properties, matching the fog design's own stated safety requirement ("must never be able to write outside the calling NVR's own tenant scope"):

- The `nvrId` parameter is accepted for signature symmetry with the mongo restore step, but is **not used in the validation itself** — actor/system-log tenant scoping in cloud's schema is per-tenant, not per-NVR (one supertable per tenant, shared across all that tenant's NVRs), matching cloud's own domain comment ("Tenant identity is the supertable"). This mirrors `readRestoreResult`'s existing validation, which checks tenant/NVR identity at the Mongo-document level where NVR-level scoping actually exists in that schema.
- `superTable` and `tbname` (the sub-table name) are re-derived/validated server-side (`actorLogSuperTableName(tenantId)`/`systemLogSuperTableName(tenantId)`, the `*TenantPrefix` checks) from the **authenticated** `tenantId` (the same trusted value `FogBackupAuthGuard` already validated for the mongo path) — never from anything embedded in the uploaded SQL text itself. A statement naming a different tenant's supertable, or a sub-table not prefixed with that tenant's own supertable name, is rejected before any `exec()`.
- The TAGS clause's tenantId is **rebuilt from the trusted `tenantId` parameter**, never from fog's claim — `TAGS_TWO`'s first `STR` is matched (so the grammar still requires a well-formed string there) but deliberately not captured, so there is no code path that can re-emit whatever fog's statement claimed. Only the second tag (actorId/groupId) is reused, and only because it's already shape-validated by `STR` and the sub-table it's paired with is already tenant-prefix-checked.
- The VALUES clause is captured by `VALUES_TUPLE`, which can only match exactly 5 comma-separated primitives (1 number, 4 properly-quoted-and-escaped strings) with the whole regex still anchored `^...$` — there is no grammar path for a second table clause, an extra value, or an unescaped delimiter to survive into the `values` capture.
- The rebuilt statement uses cloud's own `TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat` (cloud's db name) and cloud's own fixed column-name lists (`actorLogColumnNames`/`systemLogColumnNames`) — fog's literal db-prefix and column list from the regex match are discarded entirely.
- **Validation is a separate pass from execution** — every line is parsed and tenant-scope-checked first, collected into `actorStatements`/`systemStatements`; only after every line passes does execution begin. A file with 500 valid statements followed by one bad one throws before any of the 500 are written, not after.
- `ensureSuperTable` is called once per statement type per invocation, only if that type has any statements (both repos' `ensureSuperTable` already memoize via `ensuredStables`, so this is cheap regardless) — required because a brand-new tenant restoring for the first time otherwise hits "table does not exist" on the very first `USING <stable>`. Making `ActorLogRepository.ensureSuperTable` public is required for this call site (§6).
- Direct `tdengineClient.exec()`, not `ActorLogRepository.insert()`/`SystemLogRepository.insert()` — both `.insert()` methods route `createdAt` through a `MonotonicTimestampAllocator` meant to dedupe rapid live writes to the same subtable; applying it here would silently shift restored historical timestamps forward. Restore must preserve the exact original `createdAt` fog captured. (Trade-off worth naming: bypassing the allocator means two NVRs of the same tenant restoring kiosk actor logs — which all share one subtable, since the kiosk uses a fixed all-zero actor id — with a millisecond timestamp collision will silently overwrite one row under TDengine's default upsert-on-duplicate-timestamp behavior. Low probability, not mitigated here; flagged during final review as a known residual risk of this design choice, not a defect to fix without reopening the timestamp-preservation requirement.)

## 5. Wiring into `restoreFogBackupToCloud`

```ts
await this.runCommand('bash', [...], this.mongoRestoreEnv({...}));
const result = await this.readRestoreResult(resultFile, nvr.id, true);
if (members.tdengine) {
  await this.restoreTimeSeriesInserts(
    nvr.tenantId,
    nvr.id,
    join(tdengineDirectory, 'dbs.sql'),
  );
}
await this.evictRestoredRecords(nvr.tenantId, result);
await this.videoDevicesApiForFogCommunicationManagerService.completeFogCloudRecovery(nvr.serialNumber);
```

Placed after the mongo restore succeeds and before cache eviction/ack — a TDengine failure here throws into the existing outer `catch`, which already runs `evictPartialRestoreRecords` + `resetFogCloudRecovery` and rethrows (no ack sent), exactly matching how a mongo-restore failure is already handled today. No new failure-handling branch is needed.

`FogCommunicationManagerService`'s constructor gains two new dependencies: `@Inject(ACTOR_LOG_REPOSITORY) private readonly actorLogRepository: ActorLogRepository` and the system-log equivalent, plus direct access to `tdengineClient` (`@Inject(TDENGINE_CLIENT)`) — matching the injection pattern `ActorLogRepository`/`SystemLogRepository` already use.

## 6. `ActorLogRepository.ensureSuperTable` visibility

Currently `private` on `ActorLogRepository`, `public` on `SystemLogRepository` (whose own doc comment already states the reason: *"Public so read and cleanup paths can guarantee the stable exists before querying it"*). Change `ActorLogRepository.ensureSuperTable` to `public`, for the same reason, now needed by the new restore path. No behavior change — same idempotent `CREATE STABLE IF NOT EXISTS`.

## 7. Testing

Per this repo's actual, confirmed conventions (plain-mock Jest, no Testcontainers, no `jest-integration.json` exists here — the repo's real-infra verification is separate bash "qualification" scripts, not part of the Jest suite):

- `fogBackupArchive.spec.ts`: update the existing table-driven cases so a `tdengine/dbs.sql` entry is now selected into the returned `tdengine` field (not silently dropped), and add cases for the new rejections (`tdengine/data.sql` wrong filename, `tdengine/nested/dbs.sql` wrong depth, duplicate `tdengine` entries).
- New `fogCommunicationManager.service.tdengineRestore.spec.ts` (mirroring `fogCommunicationManager.service.restore.spec.ts`'s existing style — direct instantiation, hand-rolled `jest.fn()` mocks, no TestingModule): 
  - Accepts a well-formed actor-log statement for the authenticated tenant, executes exactly the rebuilt statement (assert the exact SQL string passed to the mocked `tdengineClient.exec`).
  - Accepts a well-formed system-log statement, same assertion style.
  - Rejects a statement naming a foreign tenant's supertable (`BadRequestException`), asserting `exec` was never called for that line.
  - Rejects an unrecognized/malformed statement line.
  - No-ops on an empty file (zero lines) without calling `ensureSuperTable`/`exec` at all.
  - Calls `ensureSuperTable` before the first statement for a tenant, not on every line (memoization already lives in the repository, but assert this method call happens at all).
- Extend `fogCommunicationManager.service.restore.spec.ts`'s existing full-flow test (or add one) to confirm: a failure in `restoreTimeSeriesInserts` triggers the same `resetFogCloudRecovery`/no-ack path a mongo failure already does; success calls `completeFogCloudRecovery` only after both steps succeed.

## 8. Fog-side: wire `clearData()`-on-ack (spec §5.4, now unblocked)

Both target services already exist and are already exported/wired into `CloudConnectionModule`'s import graph — this is a small, mechanical addition, gated on §2-7 above landing and being verified in a real environment (not just unit-tested), per the original spec's explicit ordering ("doing it before §8 exists would silently destroy the only copy of the offline audit trail").

In `fog-surveillance-camera/src/modules/cloudConnection/applicationService/services/cloudRecovery.service.ts`:

```ts
constructor(
  private readonly serviceProvider: ServiceProvider,
  @Inject(ACTOR_LOG_REPOSITORY) private readonly actorLogRepository: ActorLogRepository,
  @Inject(SYSTEM_LOG_REPOSITORY) private readonly systemLogRepository: SystemLogRepository,
  private readonly actorLogApiForCloudConnectionService: ActorLogApiForCloudConnectionService,
  private readonly systemLogApiForCloudConnectionService: SystemLogApiForCloudConnectionService,
) {}

async getCloudRecoveryAck(_mqttMsg: MqttEventDataDto): Promise<void> {
  if (!CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED) return;
  try {
    await this.serviceProvider.commandBus.execute(
      new UpdateNvrCommand({ id: AppConfig().nvrId, cloudFailedAt: CloudFailedAt.init().unpack() }),
    );
    CloudConnectionService.CLOUD_IS_AVAILABLE = true;
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
    await this.cleanBackup();
    await this.actorLogApiForCloudConnectionService.clearData();
    await this.systemLogApiForCloudConnectionService.clearData();
  } catch (error) {
    this.serviceProvider.eventEmitter.emit(GLOBAL_ERROR_EVENT, error);
  }
}
```

(No `ruleChainApiForCloudConnectionService.clearData()` call — fog has no `ruleChains` module; that line is gateway-only and does not apply here, consistent with the original spec's Global Constraints.)

Test: extend the existing `cloudRecovery.service.spec.ts` ack test to assert both `clearData()` methods are called, in the same try block, after the availability flip — following the same ordering-assertion pattern already used for the `cloudFailedAt` reset fix.

## 9. Rollout order

1. Fog export fix (§2) — independently valuable/low-risk, unblocks correct test data for step 2.
2. Cloud-side archive extraction + restore (§3-7) — the bulk of new work, `cloud-surveillance-camera` only.
3. Fog `clearData()`-on-ack wiring (§8) — only after step 2 is verified working against a real TDengine instance (unit tests passing is necessary but not sufficient given this spec's own §7 testing-convention note that this repo has no integration-level Jest coverage for this module; the existing bash qualification scripts under `cloud-surveillance-camera/test/qualification/` are the closest thing to that and should be extended or manually exercised before flipping step 3 on).
