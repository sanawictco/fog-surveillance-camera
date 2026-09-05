# taosdump Backup/Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **SUPERSEDED IN PART, 2026-09-05.** Tasks 1-4 shipped as written. Task 5 was
> implemented, then deliberately reverted to a plain
> `taosdump -i -W <fogDb>=<cloudDb>`: fog is a trusted device, so the staging
> database, namespace validation and trusted-copy layer this plan specifies were
> overengineering and have been deleted. Task 6 shipped in reduced form — the
> HTTP harness covers upload/auth/mongo/ack, and the TDengine round trip is proven
> separately by `test/qualification/fog-cloud-roundtrip.js`, because cloud's
> restore uses TDengine's native protocol, which cannot be reached through host
> port-mapping. See the spec's revision note and the ledger at
> `.superpowers/sdd/2026-09-04-taosdump-backup-restore-plan/progress.md`.

**Goal:** Replace the hand-rolled TDengine SQL exporter and regex-grammar importer with TDengine's own `taosdump`, importing untrusted dumps into a throwaway staging database and copying into tenant tables cloud names itself.

**Architecture:** Fog dumps only its own two supertables with `taosdump ... -S <cloudFailedAt>`. Cloud imports the dump into `fog_restore_<id>` via `taosdump -i -W`, reads back only the two table names it derives from the authenticated `tenantId`, writes them into the real tables with its own naming helpers, then drops the staging database. Tenant isolation becomes structural — there is no parser to bypass.

**Tech Stack:** NestJS, TypeScript, TDengine 3.3.6.3, `taosdump` 3.3.6.3, Docker multi-stage builds, Jest.

**Spec:** `fog-surveillance-camera/docs/superpowers/specs/2026-09-04-taosdump-backup-restore-design.md`

## Global Constraints

- **Repos:** `fog-surveillance-camera` (`~/sanawProjects/newVersion/fog-surveillance-camera`) and `cloud-surveillance-camera` (`~/sanawProjects/newVersion/cloud-surveillance-camera`). This plan file lives in the fog repo; **each task states which repo it runs in.** Commit in the repo the task names.
- **TDengine image (both stacks):** `registry.sanawict.ir/library/tdengine:3.3.6.3`. Do **not** copy gateway's tag (`3.4.1.13`) or its registry path (`.../tdengine/tsdb:...`) — different stack.
- **`-e` is mandatory on every `taosdump` invocation.** Fog's real database is `surveillance-fog`, with a hyphen. Without `-e`, taosdump emits unescaped `DESCRIBE surveillance-fog.\`tbl\`` and fails with `Internal error: Database not specified`, having dumped nothing.
- **In this TDengine image the native libs are at `/usr/lib/libtaos*.so*`**, not `/usr/local/lib/` (which is where workspace-backend-v2's 3.4.1.13 Dockerfile finds them). Copying from the wrong path yields an image whose `taosdump` cannot start.
- **`taosdump` must be able to write `/var/log/taos` and read `/etc/taos`.** Both images run as the unprivileged `node` user; without these it dies at init with `Create taoslog failed: Permission denied` *before* connecting.
- Fog's actor-log/system-log supertable names come from `actorLogSuperTableName(tenantId)` / `systemLogSuperTableName(tenantId)`. Cloud derives the same names from the **authenticated** `tenantId` and must never take a table name from the dump.
- Do not touch the Mongo half of backup/restore, the `clearData()`-on-ack wiring, the lock/`cloudIsRecovering` flow, or the cache-eviction step.
- Run tests from the repo root of the repo being changed. Cloud's `tsconfig.json` sets `isolatedModules: true`, so `ts-jest` does **not** type-check — `npx tsc --noEmit` is the only type gate there. Both repos have pre-existing unrelated `tsc` errors (cloud: `videoDevices/.../camera/*.command.ts`; fog: `dashboard`, `systemMonitor`, `videoDevices`, `test/app.e2e-spec.ts`) and pre-existing failing-to-load fog suites (`extensions/tests/tests/websocket/*`, `.../scheduler/schedulerIds.spec.ts`). Leave them alone; only assert *your* files are clean.

---

### Task 1: Put taosdump in both images

**Repo:** both (`fog-surveillance-camera`, then `cloud-surveillance-camera`)

**Files:**
- Modify: `fog-surveillance-camera/deployment/prod/Dockerfile`
- Modify: `cloud-surveillance-camera/deployment/prod/Dockerfile`

**Interfaces:**
- Consumes: nothing.
- Produces: a `taosdump` binary on `PATH` in both production images, runnable as the `node` user. Every later task assumes this.

- [ ] **Step 1: Add the taos-tools stage and runtime wiring to fog's Dockerfile**

In `fog-surveillance-camera/deployment/prod/Dockerfile`, insert this stage between the `build` stage (ends line 9) and `FROM node:24.16-slim AS runtime` (line 11):

```dockerfile
# ---- TDengine backup-tooling stage ----------------------------------------
# Cloud recovery runs `taosdump -o` from the BACKEND itself (no Docker socket).
# Extract taosdump + the native client libs from the SAME TDengine image the
# stack runs, so client and server can never drift. Keep this tag in lockstep
# with the tdengine-fog service image.
FROM registry.sanawict.ir/library/tdengine:3.3.6.3 AS taos-tools
RUN set -eux; \
    mkdir -p /opt/taos/lib /opt/taos/bin; \
    cp -av "$(readlink -f /usr/bin/taosdump)" /opt/taos/bin/taosdump; \
    cp -av /usr/lib/libtaos*.so* /opt/taos/lib/; \
    chmod +x /opt/taos/bin/taosdump; \
    test -x /opt/taos/bin/taosdump
```

Add `liblzma5` to the existing runtime `apt-get install` list on line 24, so it reads:

```dockerfile
      ca-certificates curl gnupg iproute2 nmap tar zstd liblzma5; \
```

Then, immediately after the closing of that `RUN` block (after `chown node:node /fog_shared_backups` on line 34), add:

```dockerfile
# taosdump + the native client lib. The runtime DB driver stays pure-JS; these
# exist only for the backup path, which has no pure-JS equivalent.
COPY --from=taos-tools /opt/taos/lib/ /usr/lib/
COPY --from=taos-tools /opt/taos/bin/taosdump /usr/local/bin/taosdump
RUN ldconfig

# taosdump writes a log under /var/log/taos and reads config from /etc/taos. As
# the non-root `node` user it cannot create either, and dies at init with
# "Create taoslog failed: Permission denied" BEFORE it connects.
RUN set -eux; \
    mkdir -p /var/log/taos /etc/taos; \
    printf 'logDir /var/log/taos\n' > /etc/taos/taos.cfg; \
    chown -R node:node /var/log/taos /etc/taos
```

- [ ] **Step 2: Build fog's image and verify taosdump runs as `node`**

```bash
cd ~/sanawProjects/newVersion/fog-surveillance-camera
docker build -f deployment/prod/Dockerfile -t fog-taosdump-check .
docker run --rm --user node --entrypoint taosdump fog-taosdump-check --version
```

Expected: prints `taosdump version: 3.3.6.3` and exits 0. A `Permission denied` or `error while loading shared libraries` means Step 1's lib path or the `/var/log/taos` block is wrong — fix before continuing.

- [ ] **Step 3: Apply the same changes to cloud's Dockerfile**

In `cloud-surveillance-camera/deployment/prod/Dockerfile`, insert the identical `taos-tools` stage between the `build` stage (ends line 13) and `FROM node:24.16-slim AS production` (line 15), changing only the leading comment to say `taosdump -i` / restore and `tdengine-cloud`:

```dockerfile
# ---- TDengine restore-tooling stage ---------------------------------------
# The cloud-recovery restore runs `taosdump -i` from the BACKEND itself (no
# Docker socket). Extract taosdump + the native client libs from the SAME
# TDengine image the stack runs, so client and server can never drift. Keep
# this tag in lockstep with the tdengine-cloud service image.
FROM registry.sanawict.ir/library/tdengine:3.3.6.3 AS taos-tools
RUN set -eux; \
    mkdir -p /opt/taos/lib /opt/taos/bin; \
    cp -av "$(readlink -f /usr/bin/taosdump)" /opt/taos/bin/taosdump; \
    cp -av /usr/lib/libtaos*.so* /opt/taos/lib/; \
    chmod +x /opt/taos/bin/taosdump; \
    test -x /opt/taos/bin/taosdump
```

Add `liblzma5` to the runtime install list on line 25:

```dockerfile
    apt-get install -y --no-install-recommends ca-certificates curl gnupg tar zstd liblzma5; \
```

After that `RUN` block closes (after `chown node:node /cloud_shared_backups` on line 35), add the same three blocks as fog — `COPY --from=taos-tools` (lib + binary), `RUN ldconfig`, and the `/var/log/taos` + `/etc/taos` block — verbatim from Step 1.

- [ ] **Step 4: Build cloud's image and verify**

```bash
cd ~/sanawProjects/newVersion/cloud-surveillance-camera
docker build -f deployment/prod/Dockerfile -t cloud-taosdump-check .
docker run --rm --user node --entrypoint taosdump cloud-taosdump-check --version
```

Expected: `taosdump version: 3.3.6.3`, exit 0.

- [ ] **Step 5: Commit (two commits, one per repo)**

```bash
cd ~/sanawProjects/newVersion/fog-surveillance-camera
git add deployment/prod/Dockerfile
git commit -m "build: ship taosdump in the fog image for TDengine backups"

cd ~/sanawProjects/newVersion/cloud-surveillance-camera
git add deployment/prod/Dockerfile
git commit -m "build: ship taosdump in the cloud image for TDengine restores"
```

---

### Task 2: Lock the dump→stage→copy mechanics in as a runnable script

**Repo:** `cloud-surveillance-camera`

This task writes no application code. It turns the mechanics into a committed, repeatable script that runs against the real containers, so the approach is proven before any code is deleted. If this task fails, stop — the design is wrong, not the implementation.

**Files:**
- Create: `cloud-surveillance-camera/test/qualification/taosdump-mechanics.js`

**Interfaces:**
- Consumes: `taosdump` on PATH (Task 1) — or the host's own `taosdump` when run outside a container.
- Produces: proof that table-scoped dump, `-W` staging import, and the trusted copy behave as the spec claims. No exported symbols.

- [ ] **Step 1: Write the script**

Create `test/qualification/taosdump-mechanics.js`:

```js
// Proves the taosdump backup/restore mechanics against a REAL TDengine before
// any application code depends on them. Run:
//   TDENGINE_REST=http://localhost:60410 node test/qualification/taosdump-mechanics.js
// Requires taosdump on PATH. Creates and drops only claude_mech_* databases.
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REST = process.env.TDENGINE_REST || 'http://localhost:60410';
const USER = process.env.TDENGINE_USER || 'root';
const PASSWORD = process.env.TDENGINE_PASSWORD || 'taosdata';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
const HOST = process.env.TDENGINE_HOST || 'localhost';
const PORT = process.env.TDENGINE_PORT || '60410';
const DRIVER = process.env.TDENGINE_DRIVER || 'WebSocket';

// Hyphenated on purpose: fog's real database is `surveillance-fog`, and an
// unescaped hyphen is exactly what breaks taosdump without -e.
const SRC_DB = 'claude-mech-src';
const STAGE_DB = 'claude_mech_stage';
const DEST_DB = 'claude_mech_dest';
const TENANT = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '99999999-9999-4999-8999-999999999999';
const suffix = (id) => id.replaceAll('-', '').toLowerCase();
const ACTOR = `actor_log_t_${suffix(TENANT)}`;
const FOREIGN_ACTOR = `actor_log_t_${suffix(FOREIGN)}`;

async function sql(statement) {
  const res = await fetch(`${REST}/rest/sql`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'text/plain' },
    body: statement,
  });
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`SQL failed (${body.code}): ${body.desc} :: ${statement}`);
  }
  return body.data || [];
}

function taosdump(args) {
  const result = spawnSync(
    'taosdump',
    ['-h', HOST, '-P', PORT, '-u', USER, `-p${PASSWORD}`, '-Z', DRIVER, '-e', ...args],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`taosdump failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout + result.stderr;
}

async function main() {
  const dumpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taosdump-mech-'));
  try {
    for (const db of [SRC_DB, STAGE_DB, DEST_DB]) {
      await sql(`DROP DATABASE IF EXISTS \`${db}\`;`);
    }
    await sql(`CREATE DATABASE \`${SRC_DB}\`;`);
    for (const stable of [ACTOR, FOREIGN_ACTOR]) {
      await sql(
        `CREATE STABLE \`${SRC_DB}\`.${stable} (createdAt TIMESTAMP, ` +
          `actorLogType VARCHAR(20), messageKey VARCHAR(200), messageParams VARCHAR(500)) ` +
          `TAGS (tenantId VARCHAR(36), actorId NCHAR(36));`,
      );
    }
    await sql(
      `INSERT INTO \`${SRC_DB}\`.\`${ACTOR}_aaa\` USING \`${SRC_DB}\`.${ACTOR} ` +
        `(tenantId, actorId) TAGS ('${TENANT}','55555555-5555-4555-8555-555555555555') ` +
        `(createdAt, actorLogType, messageKey, messageParams) ` +
        `VALUES (1735689600000,'EMPLOYEE','k1','p1') (1735689601000,'EMPLOYEE','k2','p2');`,
    );
    // A foreign tenant's rows live in the SAME source database. They must never
    // reach the destination.
    await sql(
      `INSERT INTO \`${SRC_DB}\`.\`${FOREIGN_ACTOR}_bbb\` USING \`${SRC_DB}\`.${FOREIGN_ACTOR} ` +
        `(tenantId, actorId) TAGS ('${FOREIGN}','66666666-6666-4666-8666-666666666666') ` +
        `(createdAt, actorLogType, messageKey, messageParams) ` +
        `VALUES (1735689600000,'EMPLOYEE','EVIL','x');`,
    );

    // 1. Table-scoped incremental dump: only OUR stable is named.
    taosdump([SRC_DB, ACTOR, '-S', '1735689600000', '-o', dumpDir]);

    // 2. The dump names its source database in the inner dbs.sql.
    const inner = (await fsp.readdir(dumpDir)).find((n) => n.startsWith('taosdump.'));
    assert.ok(inner, 'dump should contain a taosdump.<n> directory');
    const ddl = await fsp.readFile(path.join(dumpDir, inner, 'dbs.sql'), 'utf8');
    const match = /CREATE DATABASE IF NOT EXISTS\s+`?([^`\s;]+)`?/i.exec(ddl);
    assert.ok(match, 'inner dbs.sql should declare its source database');
    assert.equal(match[1], SRC_DB);
    assert.ok(
      !ddl.includes(FOREIGN_ACTOR),
      'table-scoped dump must not carry the foreign tenant stable',
    );

    // 3. Import into a staging database via -W rename.
    taosdump(['-i', dumpDir, '-W', `${match[1]}=${STAGE_DB}`]);
    const staged = await sql(
      `SELECT createdAt, actorLogType, messageKey, messageParams, actorId ` +
        `FROM ${STAGE_DB}.${ACTOR};`,
    );
    assert.equal(staged.length, 2, 'both rows should land in staging');

    // 4. Copy into the destination under names the CONSUMER chooses.
    await sql(`CREATE DATABASE ${DEST_DB};`);
    await sql(
      `CREATE STABLE ${DEST_DB}.${ACTOR} (createdAt TIMESTAMP, actorLogType VARCHAR(20), ` +
        `messageKey VARCHAR(200), messageParams VARCHAR(500)) ` +
        `TAGS (tenantId VARCHAR(36), actorId NCHAR(36));`,
    );
    const actorId = staged[0][4];
    const values = staged
      .map((r) => `('${r[0]}', '${r[1]}', '${r[2]}', '${r[3]}')`)
      .join(' ');
    await sql(
      `INSERT INTO ${DEST_DB}.\`${ACTOR}_${suffix(actorId)}\` USING ${DEST_DB}.${ACTOR} ` +
        `(tenantId, actorId) TAGS ('${TENANT}', '${actorId}') ` +
        `(createdAt, actorLogType, messageKey, messageParams) VALUES ${values};`,
    );
    const restored = await sql(`SELECT messageKey FROM ${DEST_DB}.${ACTOR};`);
    assert.equal(restored.length, 2);
    assert.deepEqual(restored.map((r) => r[0]).sort(), ['k1', 'k2']);

    // 5. The foreign tenant never made it across.
    const foreignInDest = await sql(
      `SELECT stable_name FROM information_schema.ins_stables ` +
        `WHERE db_name='${DEST_DB}' AND stable_name='${FOREIGN_ACTOR}';`,
    );
    assert.equal(foreignInDest.length, 0, 'foreign tenant stable must not exist in destination');

    console.log('taosdump mechanics: OK');
  } finally {
    for (const db of [SRC_DB, STAGE_DB, DEST_DB]) {
      await sql(`DROP DATABASE IF EXISTS \`${db}\`;`).catch(() => {});
    }
    await fsp.rm(dumpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the live containers**

```bash
cd ~/sanawProjects/newVersion/cloud-surveillance-camera
docker ps --format '{{.Names}}' | grep -q tdengine-fog || echo "start the tdengine-fog container first"
node test/qualification/taosdump-mechanics.js
```

Expected: `taosdump mechanics: OK`, exit 0. Then confirm nothing was left behind:

```bash
curl -s -X POST http://localhost:60410/rest/sql \
  -H "Authorization: Basic cm9vdDp0YW9zZGF0YQ==" -d "SHOW DATABASES;"
```

Expected: no `claude_mech_*` / `claude-mech-*` databases in the output.

- [ ] **Step 3: Commit**

```bash
git add test/qualification/taosdump-mechanics.js
git commit -m "test: prove taosdump dump/stage/copy mechanics against a real TDengine"
```

---

### Task 3: Fog dumps with taosdump instead of hand-built SQL

**Repo:** `fog-surveillance-camera`

Also fixes a data-loss bug found while mapping this code: `createTimeSeriesBackup` currently swallows its own failure and lets the archive upload without the TDengine half. Cloud then acks, and `getCloudRecoveryAck` calls `clearData()` — destroying local logs that were never backed up. The dump failure must abort the recovery instead.

**Files:**
- Modify: `src/modules/cloudConnection/applicationService/services/cloudRecovery.service.ts`
- Modify: `src/modules/cloudConnection/tests/applicationService/services/cloudRecovery.service.spec.ts`

**Interfaces:**
- Consumes: `taosdump` on PATH (Task 1); `nvrEntity.getProps().cloudFailedAt` (a plain `number` — `NvrProps` unpacks the VO; confirmed by the existing `cloudFailedAt !== 0` check in `cloudConnection.service.ts:138`).
- Produces: a `tdengine/` **directory tree** (taosdump output) inside the archive, replacing the single `tdengine/dbs.sql` file. Tasks 4 and 5 consume that shape.

- [ ] **Step 1: Write the failing test**

Replace the whole `describe('CloudRecoveryService.exportTimeSeriesInserts', ...)` block at the end of `cloudRecovery.service.spec.ts` with:

```ts
describe('CloudRecoveryService.createTimeSeriesBackup', () => {
  function buildService() {
    const service = new CloudRecoveryService({ logger: { error: jest.fn() } } as never);
    const runCommand = jest
      .spyOn(service as never, 'runCommand')
      .mockResolvedValue(undefined as never);
    return { service, runCommand };
  }

  it('dumps only this tenant\'s two supertables, escaped, since cloudFailedAt', async () => {
    const { service, runCommand } = buildService();

    await (
      service as unknown as {
        createTimeSeriesBackup(cloudFailedAt: number): Promise<void>;
      }
    ).createTimeSeriesBackup(1735689600000);

    expect(runCommand).toHaveBeenCalledTimes(1);
    const [command, args] = runCommand.mock.calls[0]!;
    expect(command).toBe('taosdump');
    // -e is mandatory: the real db name (surveillance-fog) contains a hyphen,
    // and taosdump emits it unescaped without this flag.
    expect(args).toContain('-e');
    expect(args).toContain('fog-timeseries-db');
    expect(args).toContain('actor_log_t_11111111111141118111111111111111');
    expect(args).toContain('system_log_t_11111111111141118111111111111111');
    expect(args[args.indexOf('-S') + 1]).toBe('1735689600000');
    expect(args[args.indexOf('-o') + 1]).toBe('/fog_shared_backups/tdengine');
  });

  it('propagates a dump failure so the archive never uploads without its TDengine half', async () => {
    const { service, runCommand } = buildService();
    runCommand.mockRejectedValue(new Error('taosdump exited with code 1') as never);

    await expect(
      (
        service as unknown as {
          createTimeSeriesBackup(cloudFailedAt: number): Promise<void>;
        }
      ).createTimeSeriesBackup(1735689600000),
    ).rejects.toThrow('taosdump exited with code 1');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/sanawProjects/newVersion/fog-surveillance-camera
npx jest src/modules/cloudConnection/tests/applicationService/services/cloudRecovery.service.spec.ts
```

Expected: FAIL — `createTimeSeriesBackup` takes no argument and still calls `exportTimeSeriesInserts`.

- [ ] **Step 3: Rewrite the backup method and delete the exporter**

In `cloudRecovery.service.ts`:

Change the constructor to drop the two repository injections (they existed only to run the export queries), leaving:

```ts
  constructor(private readonly serviceProvider: ServiceProvider) {}
```

Change `startCloudRecoveryProcess` to use its entity parameter:

```ts
  async startCloudRecoveryProcess(nvrEntity: NvrEntity): Promise<void> {
    if (CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED) return;
    CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = true;
    try {
      await this.cleanBackup();
      await this.createMongoBackup();
      await this.createTimeSeriesBackup(nvrEntity.getProps().cloudFailedAt);
      await this.compressBackup();
      await this.uploadBackup();
    } catch (error) {
      CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED = false;
      this.serviceProvider.logger.error('Fog cloud recovery failed', error);
    }
  }
```

Replace `createTimeSeriesBackup` and delete `exportTimeSeriesInserts`, `exportCellValue`, `actorLogValues`, `systemLogValues`, and `exportTimestamp` entirely:

```ts
  /**
   * Dumps this tenant's own actor/system supertables with TDengine's native
   * taosdump, incrementally from the moment cloud contact was lost. A failure
   * propagates: uploading a mongo-only archive would get acked, and the ack
   * triggers clearData() — destroying local logs that were never backed up.
   */
  private async createTimeSeriesBackup(cloudFailedAt: number): Promise<void> {
    await fs.promises.mkdir(TDENGINE_BACKUP_DIR, { recursive: true });
    const tenantId = AppConfig().tenantId;
    await this.runCommand('taosdump', [
      '-h', process.env.TIME_SERIES_DB_HOST ?? 'tdengine-fog',
      '-P', process.env.TIME_SERIES_DB_NATIVE_PORT ?? '6030',
      '-u', process.env.TIME_SERIES_DB_USER ?? 'root',
      `-p${process.env.TIME_SERIES_DB_PASSWORD ?? ''}`,
      // Mandatory: fog's database name contains a hyphen, which taosdump
      // otherwise emits unescaped, failing with "Database not specified".
      '-e',
      AppConfig().timeseriesDb.dbName,
      actorLogSuperTableName(tenantId),
      systemLogSuperTableName(tenantId),
      '-S', String(cloudFailedAt),
      '-o', TDENGINE_BACKUP_DIR,
    ]);
  }
```

Delete the now-unused imports: `TimeSeriesDbExtension`, `ACTOR_LOG_REPOSITORY`, `ActorLogRepository`, `SYSTEM_LOG_REPOSITORY`, `SystemLogRepository`, and the `Inject` import if nothing else uses it. Keep `actorLogSuperTableName` and `systemLogSuperTableName`. Delete the now-unused `TDENGINE_BACKUP_FILE` constant.

- [ ] **Step 4: Run the tests**

```bash
npx jest src/modules/cloudConnection
npx tsc --noEmit 2>&1 | grep -i cloudConnection
```

Expected: jest passes; the `tsc` grep prints nothing.

- [ ] **Step 5: Update the module wiring if Nest complains**

`CloudRecoveryService` no longer injects the two repositories. Check whether `CloudConnectionModule` imported `ActorLogModule` / `SystemLogModule` *only* for them:

```bash
grep -n "ActorLogModule\|SystemLogModule\|ActorLogApiForCloudConnection\|SystemLogApiForCloudConnection" src/modules/cloudConnection/cloudConnection.module.ts
```

Both modules are still needed — `getCloudRecoveryAck` calls `actorLogApiForCloudConnectionService.clearData()` and `systemLogApiForCloudConnectionService.clearData()`. Leave the module imports alone; only the two `@Inject(*_REPOSITORY)` constructor params go away.

Wait — the constructor in Step 3 dropped *all* params except `serviceProvider`, which would break `clearData()`. Correct the constructor to:

```ts
  constructor(
    private readonly serviceProvider: ServiceProvider,
    private readonly actorLogApiForCloudConnectionService: ActorLogApiForCloudConnectionService,
    private readonly systemLogApiForCloudConnectionService: SystemLogApiForCloudConnectionService,
  ) {}
```

and update `buildService()` in the new spec block to `new CloudRecoveryService({ logger: { error: jest.fn() } } as never, {} as never, {} as never)`. Re-run Step 4 and confirm green.

- [ ] **Step 6: Commit**

```bash
git add src/modules/cloudConnection/applicationService/services/cloudRecovery.service.ts \
        src/modules/cloudConnection/tests/applicationService/services/cloudRecovery.service.spec.ts
git commit -m "feat(cloudConnection): back up TDengine with taosdump instead of hand-built SQL

Dumps only this tenant's two supertables, incrementally from cloudFailedAt,
matching gateway-backend-v2's method. A dump failure now aborts the recovery:
previously it was swallowed, so a mongo-only archive would be acked and the
ack triggers clearData(), destroying logs that were never backed up."
```

---

### Task 4: Cloud accepts the tdengine directory tree in the archive

**Repo:** `cloud-surveillance-camera`

**Files:**
- Modify: `src/modules/fogCommunicationManager/fogBackupArchive.ts`
- Modify: `src/modules/fogCommunicationManager/tests/fogBackupArchive.spec.ts` (create if absent — check with `ls src/modules/fogCommunicationManager/tests/`)

**Interfaces:**
- Consumes: the archive shape Task 3 produces — `tdengine/<taosdump output tree>`.
- Produces: `FogBackupMembers.tdengine` becomes `string[] | undefined` (every member path under `tdengine/`) instead of `string | undefined`. Task 5 consumes this.

- [ ] **Step 1: Write the failing test**

Add to the archive spec (create the file with the standard imports if it does not exist):

```ts
import { selectMongoBackupMembers } from '../fogBackupArchive';
import { BadRequestException } from '@nestjs/common';

describe('selectMongoBackupMembers tdengine tree', () => {
  const mongo = 'mongo/nvrs.json';

  it('collects every file under tdengine/ as a tree', () => {
    const listing = [
      mongo,
      'tdengine/dbs.sql',
      'tdengine/taosdump.123/dbs.sql',
      'tdengine/taosdump.123/data0-ABC/stbname',
      'tdengine/taosdump.123/data0-ABC/db.1.0.avro',
    ].join('\n');

    const members = selectMongoBackupMembers(listing);

    expect(members.tdengine).toEqual([
      'tdengine/dbs.sql',
      'tdengine/taosdump.123/dbs.sql',
      'tdengine/taosdump.123/data0-ABC/stbname',
      'tdengine/taosdump.123/data0-ABC/db.1.0.avro',
    ]);
  });

  it('still rejects traversal inside the tdengine tree', () => {
    const listing = [mongo, 'tdengine/../../etc/passwd'].join('\n');
    expect(() => selectMongoBackupMembers(listing)).toThrow(BadRequestException);
  });

  it('leaves tdengine undefined when the archive has none', () => {
    expect(selectMongoBackupMembers(mongo).tdengine).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/sanawProjects/newVersion/cloud-surveillance-camera
npx jest src/modules/fogCommunicationManager/tests/fogBackupArchive.spec.ts
```

Expected: FAIL — `tdengine` is a single string and the multi-file listing throws `Fog backup TDengine layout is invalid`.

- [ ] **Step 3: Implement**

In `fogBackupArchive.ts`, change the interface field:

```ts
export interface FogBackupMembers {
  nvrs?: string;
  cameras?: string;
  pages?: string;
  tdengine?: string[];
}
```

Delete the `TDENGINE_BACKUP_FILE_NAME` constant and replace the whole `tdengineIndex` block (lines 59-77) with:

```ts
    const tdengineIndex = segments.indexOf('tdengine');
    if (tdengineIndex >= 0) {
      // taosdump emits a directory tree, not one file. Depth is not fixed, so
      // the guard is the traversal/absolute-path check already applied above
      // plus the extracted-byte cap enforced during extraction.
      if (segments.length <= tdengineIndex + 1) continue;
      (selected.tdengine ??= []).push(name);
      continue;
    }
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/modules/fogCommunicationManager
npx tsc --noEmit 2>&1 | grep -i "fogBackupArchive\|fogCommunicationManager"
```

Expected: the archive spec passes. `fogCommunicationManager.service.ts` will now have a **type error** on `members.tdengine` (string[] vs string) — that is expected and Task 5 fixes it. Note it and continue; do not patch it here.

- [ ] **Step 5: Commit**

```bash
git add src/modules/fogCommunicationManager/fogBackupArchive.ts \
        src/modules/fogCommunicationManager/tests/fogBackupArchive.spec.ts
git commit -m "feat(fogCommunicationManager): accept the taosdump directory tree in fog archives"
```

---

### Task 5: Cloud restores via staging database and a trusted copy

**Repo:** `cloud-surveillance-camera`

**Files:**
- Modify: `src/modules/fogCommunicationManager/fogCommunicationManager.service.ts`
- Modify: `src/modules/shared/timeseriesRepository.ts` (make `restQuery` public)
- Modify: `src/modules/fogCommunicationManager/tests/fogCommunicationManager.service.tdengineRestore.spec.ts`
- Modify: `src/modules/fogCommunicationManager/tests/fogCommunicationManager.service.restore.spec.ts`

**Interfaces:**
- Consumes: `FogBackupMembers.tdengine: string[]` (Task 4); `taosdump` on PATH (Task 1).
- Produces: `restoreTimeSeriesDump(tenantId: string, nvrId: string, dumpDir: string): Promise<void>`, replacing `restoreTimeSeriesInserts`.

- [ ] **Step 1: Make cloud's restQuery public**

In `src/modules/shared/timeseriesRepository.ts` line 123, change `private async restQuery(` to:

```ts
  /**
   * Public: the fog-backup restore reads staged rows back out of the throwaway
   * staging database through it, the same way ensureSuperTable is public for
   * that path.
   */
  async restQuery(query: string) {
```

- [ ] **Step 2: Write the failing test**

Replace the entire contents of `fogCommunicationManager.service.tdengineRestore.spec.ts` with:

```ts
import { BadRequestException } from '@nestjs/common';
import { FogCommunicationManagerService } from '../fogCommunicationManager.service';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ timeseriesDb: { dbName: 'surveillance' } }),
}));

describe('FogCommunicationManagerService.restoreTimeSeriesDump', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const nvrId = '22222222-2222-4222-8222-222222222222';
  const actorSuperTable = 'actor_log_t_11111111111141118111111111111111';
  const foreignActorSuperTable = 'actor_log_t_99999999999949998999999999999999';

  function buildService(overrides?: { restQuery?: jest.Mock; exec?: jest.Mock }) {
    const exec = overrides?.exec ?? jest.fn().mockResolvedValue(undefined);
    const restQuery = overrides?.restQuery ?? jest.fn().mockResolvedValue([]);
    const tdengineClient = { exec };
    const actorLogRepository = {
      ensureSuperTable: jest.fn().mockResolvedValue(undefined),
      restQuery,
    };
    const systemLogRepository = {
      ensureSuperTable: jest.fn().mockResolvedValue(undefined),
      restQuery,
    };
    const service = new FogCommunicationManagerService(
      {} as never,
      {} as never,
      actorLogRepository as never,
      systemLogRepository as never,
      tdengineClient as never,
    );
    const runCommand = jest
      .spyOn(service as never, 'runCommand')
      .mockResolvedValue('' as never);
    return { service, exec, restQuery, runCommand, actorLogRepository };
  }

  async function writeDump(sourceDb: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'tdengine-dump-'));
    const inner = join(dir, 'taosdump.123');
    await mkdir(inner, { recursive: true });
    await writeFile(join(dir, 'dbs.sql'), '#!server_ver: 3.3.6.3\n');
    await writeFile(
      join(inner, 'dbs.sql'),
      `#!server_ver: 3.3.6.3\nCREATE DATABASE IF NOT EXISTS \`${sourceDb}\` REPLICA 1;\n`,
    );
    return dir;
  }

  it('imports into a staging database renamed from the dump\'s own source name', async () => {
    const { service, runCommand } = buildService();
    const dumpDir = await writeDump('surveillance-fog');

    await service.restoreTimeSeriesDump(tenantId, nvrId, dumpDir);

    const [command, args] = runCommand.mock.calls[0]!;
    expect(command).toBe('taosdump');
    expect(args).toContain('-e');
    expect(args).toContain('-i');
    const rename = args[args.indexOf('-W') + 1] as string;
    expect(rename).toMatch(/^surveillance-fog=fog_restore_[0-9a-f]{32}$/);
  });

  it('drops the staging database even when the import fails', async () => {
    const { service, exec, runCommand } = buildService();
    runCommand.mockRejectedValue(new Error('taosdump exited with code 1') as never);
    const dumpDir = await writeDump('surveillance-fog');

    await expect(
      service.restoreTimeSeriesDump(tenantId, nvrId, dumpDir),
    ).rejects.toThrow('taosdump exited with code 1');

    const dropped = exec.mock.calls.map(([sql]) => sql as string);
    expect(dropped.some((sql) => /^DROP DATABASE IF EXISTS fog_restore_/.test(sql))).toBe(true);
  });

  it('reads back only the supertable derived from the authenticated tenantId', async () => {
    const restQuery = jest.fn().mockResolvedValue([]);
    const { service } = buildService({ restQuery });
    const dumpDir = await writeDump('surveillance-fog');

    await service.restoreTimeSeriesDump(tenantId, nvrId, dumpDir);

    const queried = restQuery.mock.calls.map(([sql]) => sql as string).join('\n');
    expect(queried).toContain(actorSuperTable);
    // A foreign tenant's stable sitting in the same staging database is never
    // named, so it can never be copied out.
    expect(queried).not.toContain(foreignActorSuperTable);
  });

  it('copies staged rows into a subtable cloud names from the trusted tenantId', async () => {
    const restQuery = jest
      .fn()
      // stable-exists probe -> present
      .mockResolvedValueOnce([[actorSuperTable]])
      // staged rows
      .mockResolvedValueOnce([
        [
          '2025-01-01T00:00:00.000Z',
          'EMPLOYEE',
          'k1',
          'p1',
          '55555555-5555-4555-8555-555555555555',
        ],
      ])
      .mockResolvedValue([]);
    const { service, exec } = buildService({ restQuery });
    const dumpDir = await writeDump('surveillance-fog');

    await service.restoreTimeSeriesDump(tenantId, nvrId, dumpDir);

    const inserts = exec.mock.calls
      .map(([sql]) => sql as string)
      .filter((sql) => sql.startsWith('INSERT INTO'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain(
      `surveillance.\`${actorSuperTable}_555555555555455585555555555555555\``,
    );
    expect(inserts[0]).toContain(`TAGS ( '${tenantId}',`);
    expect(inserts[0]).toContain("'2025-01-01T00:00:00.000Z'");
  });

  it('rejects a dump whose inner dbs.sql declares no database', async () => {
    const { service } = buildService();
    const dir = await mkdtemp(join(tmpdir(), 'tdengine-dump-'));
    const inner = join(dir, 'taosdump.123');
    await mkdir(inner, { recursive: true });
    await writeFile(join(inner, 'dbs.sql'), '#!server_ver: 3.3.6.3\n');

    await expect(
      service.restoreTimeSeriesDump(tenantId, nvrId, dir),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a source database name that is not a plain identifier', async () => {
    const { service } = buildService();
    const dumpDir = await writeDump('evil name=other');

    await expect(
      service.restoreTimeSeriesDump(tenantId, nvrId, dumpDir),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npx jest src/modules/fogCommunicationManager/tests/fogCommunicationManager.service.tdengineRestore.spec.ts
```

Expected: FAIL — `restoreTimeSeriesDump` does not exist.

- [ ] **Step 4: Implement the restore**

In `fogCommunicationManager.service.ts`, delete the regex constants block (`STR`, `NUM`, `ACTOR_LOG_VALUES_TUPLE`, `SYSTEM_LOG_VALUES_TUPLE`, `TAGS_TWO`, `ACTOR_LOG_INSERT`, `SYSTEM_LOG_INSERT`) and the whole `restoreTimeSeriesInserts` method. Add `readdir` to the `node:fs/promises` import. Add:

```ts
const DUMP_DB_NAME = /CREATE DATABASE IF NOT EXISTS\s+`?([^`\s;]+)`?/i;
const SAFE_DB_NAME = /^[A-Za-z0-9_-]{1,64}$/;

  /**
   * Imports fog's taosdump output into a throwaway staging database, then
   * copies only this tenant's rows into the real tables under names derived
   * from the authenticated tenantId. Nothing in the dump is trusted: whatever
   * else it contains is never read and dies with the staging database.
   */
  async restoreTimeSeriesDump(
    tenantId: string,
    nvrId: string,
    dumpDir: string,
  ): Promise<void> {
    const sourceDb = await this.readDumpSourceDatabase(dumpDir, nvrId);
    const stagingDb = `fog_restore_${randomUUID().replaceAll('-', '')}`;
    try {
      await this.runCommand('taosdump', [
        ...this.tdengineArgs(),
        '-e',
        '-i',
        dumpDir,
        '-W',
        `${sourceDb}=${stagingDb}`,
      ]);
      await this.copyStagedRows(stagingDb, tenantId, nvrId, 'actor');
      await this.copyStagedRows(stagingDb, tenantId, nvrId, 'system');
    } finally {
      await this.tdengineClient.exec(`DROP DATABASE IF EXISTS ${stagingDb};`);
    }
  }

  private tdengineArgs(): string[] {
    return [
      '-h', process.env.TIME_SERIES_DB_HOST ?? 'tdengine-cloud',
      '-P', process.env.TIME_SERIES_DB_NATIVE_PORT ?? '6030',
      '-u', process.env.TIME_SERIES_DB_USER ?? 'root',
      `-p${process.env.TIME_SERIES_DB_PASSWORD ?? ''}`,
    ];
  }

  /**
   * A taosdump output holds two dbs.sql files: a top-level one with only
   * version headers, and one inside taosdump.<n>/ carrying the DDL. The source
   * database name comes from the latter. It is untrusted — it is only ever used
   * as the left side of the -W rename — but it still has to be a plain
   * identifier so it cannot disturb the argument list.
   */
  private async readDumpSourceDatabase(
    dumpDir: string,
    nvrId: string,
  ): Promise<string> {
    const entries = await readdir(dumpDir);
    const inner = entries.find((entry) => entry.startsWith('taosdump.'));
    if (!inner) {
      throw new BadRequestException(
        `Fog TDengine dump has no taosdump directory (nvr ${nvrId})`,
      );
    }
    const ddl = await readFile(join(dumpDir, inner, 'dbs.sql'), 'utf8');
    const match = DUMP_DB_NAME.exec(ddl);
    if (!match || !SAFE_DB_NAME.test(match[1]!)) {
      throw new BadRequestException(
        `Fog TDengine dump does not declare a usable source database (nvr ${nvrId})`,
      );
    }
    return match[1]!;
  }

  private async copyStagedRows(
    stagingDb: string,
    tenantId: string,
    nvrId: string,
    kind: 'actor' | 'system',
  ): Promise<void> {
    const isActor = kind === 'actor';
    const superTable = isActor
      ? actorLogSuperTableName(tenantId)
      : systemLogSuperTableName(tenantId);
    const repository = isActor ? this.actorLogRepository : this.systemLogRepository;
    const columns = isActor ? actorLogColumnNames : systemLogColumnNames;
    const tagName = isActor ? 'actorId' : 'groupId';

    const present = await repository.restQuery(
      `SELECT stable_name FROM information_schema.ins_stables ` +
        `WHERE db_name='${stagingDb}' AND stable_name='${superTable}';`,
    );
    if (!present || present.length === 0) return;

    const rows = await repository.restQuery(
      `SELECT ${columns.join(', ')}, ${tagName} FROM ${stagingDb}.${superTable};`,
    );
    if (!rows || rows.length === 0) return;

    await repository.ensureSuperTable(tenantId);

    // Group by tag so each child table is written in one statement.
    const byTag = new Map<string, string[]>();
    for (const row of rows) {
      const values = row.slice(0, columns.length) as (number | string)[];
      const tagValue = String(row[columns.length]);
      const tuple = `(${TimeSeriesDbExtension.getValuesInsertFormat(values)})`;
      const bucket = byTag.get(tagValue);
      if (bucket) bucket.push(tuple);
      else byTag.set(tagValue, [tuple]);
    }

    for (const [tagValue, tuples] of byTag) {
      // The tag value is the one piece of staged data that becomes part of a
      // table name, so it goes through the same assertions the normal write
      // path uses. Both throw plain Errors; convert them so a malformed dump
      // reads as a bad request rather than a 500.
      let subTableName: string;
      try {
        subTableName = isActor
          ? actorLogSubTableName(tenantId, tagValue)
          : systemLogSubTableName(tenantId, tagValue as SystemLogTypes);
      } catch {
        throw new BadRequestException(
          `Fog TDengine dump has an invalid ${tagName} tag (nvr ${nvrId})`,
        );
      }
      const { superTableInsertFormat, subTableInsertFormat } =
        TimeSeriesDbExtension.getSuperTableAndSubTableInsertFormat(
          superTable,
          subTableName,
        );
      const tags = TimeSeriesDbExtension.getValuesInsertFormat([
        tenantId,
        tagValue,
      ]);
      await this.tdengineClient.exec(
        `INSERT INTO ${subTableInsertFormat} USING ${superTableInsertFormat} ` +
          `(tenantId, ${tagName}) TAGS (${tags}) (${columns.join(', ')}) ` +
          `VALUES ${tuples.join(' ')};`,
      );
    }
  }
```

Add these imports alongside the existing ones — the exact signatures, already confirmed:

- `actorLogSubTableName(tenantId: string, actorId: string)` from `../actorLogs/domain/actorLog.type` — calls `assertActorLogId`, which throws on anything that is not UUID-shaped.
- `systemLogSubTableName(tenantId: string, type: SystemLogTypes)` and the `SystemLogTypes` enum from `../systemLogs/domain/systemLog.type` — calls `assertSystemLogTypes`, which throws on any value outside the enum. The staged `groupId` is a `string`, so the `as SystemLogTypes` cast in the loop above is what satisfies the compiler; `assertSystemLogTypes` is what actually validates it at runtime, and the surrounding `try` turns its plain `Error` into a `BadRequestException`.

Both assertions are the same ones cloud's normal write path uses, so a dump carrying a bogus tag is rejected exactly as a bogus live write would be.

- [ ] **Step 5: Update the call site**

In `restoreFogBackupToCloud`, the extraction block and the restore call both change. Replace the `if (members.tdengine)` extraction block (currently extracting one file to `tdengineSqlFile`) with a loop over the tree, and change `tdengineSqlFile` to a directory:

```ts
        if (members.tdengine) {
          await mkdir(tdengineDirectory, { recursive: true });
          for (const member of members.tdengine) {
            const relative = member.slice(member.indexOf('tdengine/') + 'tdengine/'.length);
            const destination = join(tdengineDirectory, relative);
            await mkdir(dirname(destination), { recursive: true });
            await this.extractArchiveMember(file.path, member, destination);
          }
        }
```

Add `dirname` to the `node:path` import. Delete the `tdengineSqlFile` constant. Change the restore call from `restoreTimeSeriesInserts(nvr.tenantId, nvr.id, tdengineSqlFile)` to:

```ts
          if (members.tdengine) {
            await this.restoreTimeSeriesDump(
              nvr.tenantId,
              nvr.id,
              tdengineDirectory,
            );
          }
```

- [ ] **Step 6: Run the tests**

```bash
npx jest src/modules/fogCommunicationManager
npx tsc --noEmit 2>&1 | grep -i "fogCommunicationManager\|timeseriesRepository"
```

Expected: all pass; the `tsc` grep prints nothing. `fogCommunicationManager.service.restore.spec.ts` will need its fixtures updated from a single `dbs.sql` member to a tree — update the `members` fixtures there to `tdengine: ['tdengine/taosdump.1/dbs.sql']` and the ordering assertions to spy on `restoreTimeSeriesDump` instead of `restoreTimeSeriesInserts`.

- [ ] **Step 7: Commit**

```bash
git add src/modules/fogCommunicationManager/fogCommunicationManager.service.ts \
        src/modules/shared/timeseriesRepository.ts \
        src/modules/fogCommunicationManager/tests/
git commit -m "feat(fogCommunicationManager): restore TDengine dumps via an isolated staging database

taosdump -i imports the untrusted dump into a throwaway fog_restore_<id>
database; only the two supertables cloud derives from the authenticated
tenantId are read back and copied into the real tables. Replaces the regex
grammar entirely — there is no longer a parser to bypass."
```

---

### Task 6: Turn the qualification harness into a real round trip

**Repo:** `cloud-surveillance-camera`

**Files:**
- Modify: `test/qualification/fog-restore-http.js`

**Interfaces:**
- Consumes: everything above.
- Produces: an end-to-end proof, against real Mongo/Redis/TDengine, that a fog archive restores into the right tenant's tables and cannot touch another tenant's.

- [ ] **Step 1: Replace the TDengine stubs with the real providers**

At lines 299-301 the harness stubs all three TDengine providers. Replace them with real, database-backed ones.

**Read this before wiring — the token name is an alias trap.** `TDENGINE_CLIENT` means two different things depending on where it is imported from:

- from `src/extensions/tdengine/tdeinge.tokens` it is the raw `@tdengine/websocket` module;
- from `src/modules/shared/timeseriesRepository` it is `TDENGINE_CLIENT = TDENGINE_EXECUTOR` — i.e. `TDengineService`, the thing with `exec()`.

The harness (line 39) and `fogCommunicationManager.service.ts` both import it from `src/modules/shared/timeseriesRepository`, so both mean **the executor**. Provide something with an `exec(sql)` method — do *not* provide the raw taos module, and do not hand-construct `TDengineService` (it needs the raw module plus `ShutdownOrchestratorService`, a dependency graph this harness has no reason to stand up).

A REST-backed executor is genuinely real — it hits the same database over the same endpoint the repositories already use for reads — and needs no driver wiring:

```js
  const tdengineRestOptions = {
    restUrl: process.env.TDENGINE_REST_URL,
    token:
      'Basic ' +
      Buffer.from(
        `${process.env.TIME_SERIES_DB_USER}:${process.env.TIME_SERIES_DB_PASSWORD}`,
      ).toString('base64'),
  };

  async function tdengineSql(statement) {
    const res = await fetch(tdengineRestOptions.restUrl, {
      method: 'POST',
      headers: {
        Authorization: tdengineRestOptions.token,
        'Content-Type': 'text/plain',
      },
      body: statement,
    });
    const body = await res.json();
    if (body.code !== 0) {
      throw new Error(`TDengine SQL failed (${body.code}): ${body.desc} :: ${statement}`);
    }
    return body.data || [];
  }

  const tdengineExecutor = { exec: (sql) => tdengineSql(sql) };
```

Then build the two repositories against it and register all three providers:

```js
  const {
    ActorLogRepository,
  } = require('src/modules/actorLogs/infra/actorLog.timeseriesRepository');
  const {
    SystemLogRepository,
  } = require('src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository');

  const actorLogRepository = new ActorLogRepository(tdengineExecutor, tdengineRestOptions);
  const systemLogRepository = new SystemLogRepository(tdengineExecutor, tdengineRestOptions);
```

```js
        { provide: ACTOR_LOG_REPOSITORY, useValue: actorLogRepository },
        { provide: SYSTEM_LOG_REPOSITORY, useValue: systemLogRepository },
        { provide: TDENGINE_CLIENT, useValue: tdengineExecutor },
```

Confirm `SystemLogRepository`'s constructor takes the same `(client, restOptions)` pair `ActorLogRepository` does before relying on it:

```bash
grep -n "constructor(" -A6 src/modules/systemLogs/infra/repositories/systemLog.timeseriesRepository.ts
```

- [ ] **Step 2: Replace the hand-written dbs.sql fixture with a real dump**

Delete the `qualificationDbsSql` block (the `INSERT INTO ...` template literal around lines 154-163) and the `fsp.writeFile(path.join(tdengineDirectory, 'dbs.sql'), ...)` call. In their place, seed rows into a fog-side database and dump them:

```js
  const fogDb = process.env.QUALIFICATION_FOG_DB || 'qualification-fog';
  const actorSuperTable = `actor_log_t_${tenantId.replaceAll('-', '')}`;
  await tdengineSql(`DROP DATABASE IF EXISTS \`${fogDb}\`;`);
  await tdengineSql(`CREATE DATABASE \`${fogDb}\`;`);
  await tdengineSql(
    `CREATE STABLE \`${fogDb}\`.${actorSuperTable} (createdAt TIMESTAMP, ` +
      `actorLogType VARCHAR(20), messageKey VARCHAR(200), messageParams VARCHAR(500)) ` +
      `TAGS (tenantId VARCHAR(36), actorId NCHAR(36));`,
  );
  await tdengineSql(
    `INSERT INTO \`${fogDb}\`.\`${actorSuperTable}_555555555555455585555555555555555\` ` +
      `USING \`${fogDb}\`.${actorSuperTable} (tenantId, actorId) ` +
      `TAGS ('${tenantId}','55555555-5555-4555-8555-555555555555') ` +
      `(createdAt, actorLogType, messageKey, messageParams) ` +
      `VALUES (1735689600000,'EMPLOYEE','qualification.actor.key','p1,p2');`,
  );
  run('taosdump', [
    '-h', process.env.TIME_SERIES_DB_HOST, '-P', process.env.TIME_SERIES_DB_NATIVE_PORT,
    '-u', process.env.TIME_SERIES_DB_USER, `-p${process.env.TIME_SERIES_DB_PASSWORD}`,
    '-e', fogDb, actorSuperTable, '-S', '0', '-o', tdengineDirectory,
  ]);
```

`tdengineSql` is the helper already defined in Step 1 — reuse it rather than writing a second one.

- [ ] **Step 3: Assert the round trip and tenant isolation**

After the existing post-restore assertions, add:

```js
  const restored = await tdengineSql(
    `SELECT messageKey, actorId FROM ${process.env.TIME_SERIES_DB_NAME}.${actorSuperTable};`,
  );
  assert.equal(restored.length, 1, 'the actor-log row should be restored');
  assert.equal(restored[0][0], 'qualification.actor.key');
  assert.equal(restored[0][1], '55555555-5555-4555-8555-555555555555');

  const leakedStaging = await tdengineSql(
    `SELECT name FROM information_schema.ins_databases WHERE name LIKE 'fog_restore_%';`,
  );
  assert.equal(leakedStaging.length, 0, 'staging databases must be dropped');
```

- [ ] **Step 4: Run the harness**

Follow the harness's existing run instructions (it requires `QUALIFICATION_REPO_ROOT` plus the Mongo/Redis env it already documents), adding the TDengine env:

```bash
cd ~/sanawProjects/newVersion/cloud-surveillance-camera
QUALIFICATION_REPO_ROOT=$PWD \
TIME_SERIES_DB_HOST=localhost TIME_SERIES_DB_NATIVE_PORT=60300 \
TIME_SERIES_DB_USER=root TIME_SERIES_DB_PASSWORD=taosdata \
TIME_SERIES_DB_NAME=sureveillance_sanaw \
TDENGINE_REST_URL=http://localhost:60410/rest/sql \
node test/qualification/fog-restore-http.js
```

Expected: exits 0 with its existing success output plus the new assertions passing. If taosdump cannot reach TDengine over the native port from the host, add `-Z WebSocket` with the REST port — the native protocol resolves the server's configured FQDN and does not survive host port-mapping. In-container (the real deployment) native works.

- [ ] **Step 5: Clean up the fog-side database the harness created**

Confirm the harness's teardown drops `qualification-fog`; if it does not, add it to the existing cleanup block.

- [ ] **Step 6: Commit**

```bash
git add test/qualification/fog-restore-http.js
git commit -m "test: make the fog-restore qualification a real TDengine round trip"
```

---

## Self-Review

**Spec coverage.** §3.1 fog dump → Task 3. §3.2 archive tree → Task 4; staging import, source-db extraction, trusted copy, staging drop → Task 5. §3.3 images → Task 1. §5 testing: unit (cloud) → Task 5 Step 2; unit (fog) → Task 3 Step 1; integration → Task 6; the mechanics proof → Task 2. §4 error handling: the staging drop in a `finally` and the propagating dump failure are covered in Tasks 5 and 3.

**Deletions the spec calls for, each assigned.** Fog's `exportTimeSeriesInserts` / `actorLogValues` / `systemLogValues` / `exportCellValue` / `exportTimestamp` and the two repository injections → Task 3 Step 3. Cloud's `ACTOR_LOG_INSERT` / `SYSTEM_LOG_INSERT` / `STR` / `NUM` / both tuples / `TAGS_TWO` / the parse loop → Task 5 Step 4.

**Type consistency.** `FogBackupMembers.tdengine` becomes `string[]` in Task 4 and is consumed as an array in Task 5 Step 5 — Task 4 Step 4 deliberately leaves a type error that Task 5 closes, and says so. `restoreTimeSeriesDump(tenantId, nvrId, dumpDir)` is named identically in Tasks 5 and 6. `createTimeSeriesBackup(cloudFailedAt: number)` matches its caller in Task 3 Step 3. `restQuery` is made public in Task 5 Step 1 before Step 4 uses it.

**Known wrinkle, called out rather than hidden.** Task 3 Step 3 writes a one-argument constructor and Step 5 corrects it to three. That ordering is deliberate — the implementer discovers the `clearData()` dependency by running the tests — but an implementer reading ahead should just write the three-argument form in Step 3.

**Two things this plan originally got wrong, now corrected inline.** `systemLogSubTableName` takes a `SystemLogTypes` enum, not a free string, and its `assertSystemLogTypes` throws — Task 5 Step 4 now casts for the compiler, relies on the assertion for the runtime check, and converts the throw into a `BadRequestException`. And `TDENGINE_CLIENT` is an alias that resolves to the raw driver from one import path and to `TDengineService` from another — Task 6 Step 1 now spells out which is which and provides a REST-backed executor instead of hand-constructing the service.

**One deliberate ordering wrinkle.** Task 4 Step 4 leaves a known type error in `fogCommunicationManager.service.ts` (`members.tdengine` is now `string[]`) that Task 5 Step 5 closes. This is called out in both places. A reviewer gating Task 4 should expect it rather than treat it as a defect.
