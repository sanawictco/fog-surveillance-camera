# Replacing the hand-rolled TDengine export/restore with taosdump

**Date:** 2026-09-04
**Repos touched:** `fog-surveillance-camera` (backup side), `cloud-surveillance-camera` (restore side), both Dockerfiles
**Supersedes:** the TDengine half of `docs/superpowers/specs/2026-09-03-cloud-tdengine-restore-and-clear-data-design.md`. That spec's clearData()-on-ack wiring (§5-6) stays exactly as shipped; only the export/import mechanism changes.

> **REVISED 2026-09-05 — sections 2, 3.2 and 5 are superseded.**
>
> This spec argued that cloud could not run `taosdump -i` directly, and designed a
> staging-database + trusted-copy layer to isolate an untrusted fog dump. That
> premise was wrong for this product: **fog devices are trusted here.** The user's
> requirement is simply that both sides use the databases' own native tools —
> fog dumps with `taosdump`, cloud restores with `taosdump`, cloud acks, fog
> cleans up.
>
> The staging design was also proven unworkable before it was abandoned. Isolation
> by inspecting the dump cannot hold, because `taosdump -i` takes its destination
> from places a text check does not reach: the database name embedded in each avro
> file's schema `namespace`, and `dbs.sql`, which it executes verbatim as root.
> Five distinct escape channels were demonstrated live against TDengine 3.3.6.3.
> That work is recorded in `.superpowers/sdd/2026-09-04-taosdump-backup-restore-plan/progress.md`.
> If this system ever does need to defend against a hostile edge device, do not
> revive the sanitising approach — import on a throwaway TDengine instance instead.
>
> **What actually shipped:** cloud runs
> `taosdump -e -i <dir> -W <fogDb>=<cloudDb> -r <file>`. Fog and cloud derive
> identical supertable names from the same tenant id, so the rename alone puts
> every row in the right table. Concurrent restores are already prevented by the
> existing `cloudIsRecovering` flag plus a distributed lock. Sections 1, 3.1, 3.3,
> 4 and 6 (the fog dump, the images, error handling, risks) still describe what
> shipped.

## 1. Why

`gateway-backend-v2` / `workspace-backend-v2` — the sibling product line, already in production — move TDengine data with TDengine's own `taosdump`: `taosdump -D <db> -o <dir> -S <cloudFailedAt>` on the edge, `taosdump -i <dir>` on the cloud. The surveillance pair instead uses a bespoke exporter that `SELECT`s rows over the REST API, hand-builds `INSERT` statement text, and re-parses that text on the cloud side against a strict regex grammar.

The bespoke path was a design mistake. It reimplements a native, version-matched tool that already exists, and every bug found in it so far has been a bug the native tool would not have had:

- a statement-injection hole in the regex grammar (found and fixed, but it existed at all only because we were parsing SQL text)
- `Number(createdAt)` producing `NaN` for every row, because TDengine's REST API renders TIMESTAMP as RFC3339 strings
- an `actorId` tag/column collision that made the target stable uncreatable

It also re-exports the tenant's entire history on every recovery, where gateway's `-S <cloudFailedAt>` ships only what accumulated while the edge was offline.

Adopting `taosdump` deletes the grammar, deletes the hand-built SQL, and gains incremental backup.

## 2. Why cloud cannot simply run `taosdump -i`

This is the one place the surveillance pair genuinely cannot copy gateway, and the reason is deployment topology, not preference.

`workspace-backend-v2` runs **one stack per workspace**: a single fixed supertable name (`actorLogSuperTable`) in a single database. A restored dump has nothing else to collide with, so importing it wholesale is safe.

`cloud-surveillance-camera` is **one shared instance serving all tenants** (confirmed with the user, 2026-09-04), with tenant identity encoded in the supertable name (`actor_log_t_<tenantSuffix>`). `taosdump -i` faithfully recreates whatever tables the dump names, and — verified against the real binary — `-W/--rename` remaps **databases only**, not tables. There is no table-level allow-list.

So a compromised or buggy NVR could ship a dump naming another tenant's supertable and `taosdump -i` would write into it. Validating the dump instead is worse than what we have today: the payload is Avro, not SQL text, so the check would mean parsing several binary files — exactly the kind of hand-rolled validation that produced the injection bug.

**The fix is to make the untrusted import land somewhere it cannot do harm.**

## 3. Design

```
fog                                         cloud
───                                         ─────
taosdump <db> <actorStable> <systemStable>  extract tdengine/ from archive
  -S <cloudFailedAt> -e -o tdengine/          │
  │                                           ▼
  ▼                                         taosdump -i -W "<fogDb>=fog_restore_<id>"
tar + zstd ──── upload ────────────────────►  │  (untrusted content, isolated database)
                                              ▼
                                            for each of the 2 stables cloud DERIVES
                                            from the authenticated tenantId:
                                              SELECT rows FROM staging.<thatName>
                                              INSERT INTO <real table named by cloud>
                                              ▼
                                            DROP DATABASE fog_restore_<id>
```

The security property is structural: cloud only ever *reads* two table names, and it computes both from the authenticated `tenantId` via its own `actorLogSuperTableName`/`systemLogSuperTableName` helpers. Anything else the dump contains is never read and is destroyed with the staging database. There is no parser to bypass.

### 3.1 Fog side

`CloudRecoveryService.createTimeSeriesBackup()` replaces its export with one `taosdump` invocation:

```
taosdump
  -h $TIME_SERIES_DB_HOST -P $TIME_SERIES_DB_NATIVE_PORT -u $TIME_SERIES_DB_USER -p$TIME_SERIES_DB_PASSWORD
  -e
  <dbName> <actorLogSuperTableName(tenantId)> <systemLogSuperTableName(tenantId)>
  -S <cloudFailedAt>
  -o /fog_shared_backups/tdengine
```

Notes, each verified live against TDengine 3.3.6.3:

- **`-e` is mandatory.** Fog's real database is named `surveillance-fog` — with a hyphen. Without `-e`, taosdump emits `DESCRIBE surveillance-fog.\`tbl\`` unescaped and the dump fails with `Internal error: Database not specified`. This is silent-ish: it errors per table and still exits having dumped nothing.
- **Table-scoping is the first line of defense.** Passing the two supertable names dumps only those; a foreign tenant's stable in the same database is excluded by construction (verified).
- **`-S` accepts epoch millis** and works together with table args. `cloudFailedAt` is a `CloudFailedAt` VO whose init value is `0`; `-S 0` dumps everything, which is the correct fallback for "never failed".
- `startCloudRecoveryProcess(nvrEntity)` must start using its currently-unused `nvrEntity` parameter to read `cloudFailedAt`, mirroring gateway's `gatewayEntity.getProps().cloudFailedAt`.

Everything downstream (tar+zstd of `mongo` + `tdengine`, upload, ack, `clearData()`) is unchanged — the archive member is now a directory tree instead of a single `dbs.sql`.

**Deleted:** `exportTimeSeriesInserts`, `actorLogValues`, `systemLogValues`, `exportCellValue`, `exportTimestamp`, and the `ACTOR_LOG_REPOSITORY` / `SYSTEM_LOG_REPOSITORY` constructor injections that existed only to run the export queries.

### 3.2 Cloud side

`fogBackupArchive.ts` currently selects exactly one `tdengine/dbs.sql` member. It must instead accept the `tdengine/` subtree, keeping the existing hard limits (member count, path-traversal rejection, extracted-byte cap) — a dump is many files, so the cap applies to the total.

`restoreTimeSeriesInserts` is replaced by `restoreTimeSeriesDump(tenantId, nvrId, dumpDir)`:

1. Read the source database name out of the dump. A dump contains *two* `dbs.sql` files: a top-level one holding only `#!`-prefixed version headers, and one inside the `taosdump.<n>/` subdirectory that carries the actual DDL. The name comes from the latter's single `CREATE DATABASE IF NOT EXISTS <name>` line. Reject if there is not exactly one. The value is untrusted, but it is only ever used as the left-hand side of the `-W` mapping — whatever it says gets renamed to our staging name.
2. `taosdump -i <dumpDir> -W "<sourceDb>=fog_restore_<restoreId>" -e` (restoreId is the existing `randomUUID()`, dashes stripped).
3. For each of `actorLogSuperTableName(tenantId)` and `systemLogSuperTableName(tenantId)` — **derived, never parsed**:
   - `SELECT` the columns plus the tag (`actorId` / `groupId`) from `fog_restore_<id>.<thatName>`. A missing table means fog had no rows of that type; skip it.
   - Group rows by tag value and write them with cloud's existing `ensureSuperTable` + subtable helpers (`actorLogSubTableName(tenantId, actorId)`), batching rows per subtable into multi-row `VALUES (...) (...)` statements. Values go through `TimeSeriesDbExtension.getValuesInsertFormat`, the same helper cloud's own writes already use.
   - `actorId` / `groupId` come from the data, so they keep passing through cloud's existing `assertActorLogId`-style validation — identical to the normal write path.
4. `DROP DATABASE fog_restore_<id>` in a `finally`, so a failure anywhere still cleans up.

Timestamps read back as RFC3339 strings and are re-inserted as quoted literals; TDengine accepts that for a TIMESTAMP column (round-trip verified).

**Deleted:** `ACTOR_LOG_INSERT`, `SYSTEM_LOG_INSERT`, `STR`, `NUM`, both `VALUES_TUPLE`s, `TAGS_TWO`, and the entire parse/validate loop.

### 3.3 Images

Neither surveillance image ships `taosdump` today. Both gateway and workspace solve this with a build stage that copies the binary and its native libs out of the *same* TDengine image the stack runs, so client and server can never drift:

```dockerfile
FROM registry.sanawict.ir/library/tdengine:3.3.6.3 AS taos-tools
RUN mkdir -p /opt/taos/lib /opt/taos/bin; \
    cp -av "$(readlink -f /usr/bin/taosdump)" /opt/taos/bin/taosdump; \
    cp -av /usr/local/lib/libtaos*.so* /opt/taos/lib/; \
    test -x /opt/taos/bin/taosdump
```

Copy that pattern into both surveillance Dockerfiles, pinned to `3.3.6.3` to match their `tdengine-fog` / `tdengine-cloud` services (gateway pins `3.4.1.13` for its own stack — the tag must track the local server, not gateway's).

## 4. Error handling and atomicity

Unchanged in character from today. The restore already validated everything up front and then executed row groups one at a time, so a mid-flight failure could leave earlier rows written; the staging design has the same property. It is safe to retry: TDengine overwrites on a duplicate (subtable, timestamp), and the cloud only acks after the whole restore succeeds, so fog keeps its local copy and re-sends on the next attempt.

Failures still propagate to the existing outer `catch` → `resetFogCloudRecovery`, and the ack (and therefore fog's `clearData()`) still fires only when both the Mongo and TDengine halves succeed.

## 5. Testing

- **Unit (cloud):** dump-dir parsing (`CREATE DATABASE` extraction, zero/multiple-database rejection); the copy step with a mocked TDengine client, asserting the destination table names come from the authenticated `tenantId` and that a staging table for a *different* tenant present in the same dump is never read; staging drop happens on both success and failure paths.
- **Unit (fog):** the taosdump argv is assembled correctly — `-e` present, both supertable names scoped to the tenant, `-S` carrying `cloudFailedAt`.
- **Integration (the gap worth closing):** `test/qualification/fog-restore-http.js` currently stubs TDengine. With `taosdump` in the image and a real `tdengine` container, this becomes a true round trip: seed fog-side rows, dump, upload, restore, assert the rows land in the right tenant's tables — and assert a dump carrying a foreign tenant's stable leaves that tenant untouched.

## 6. Risks

- **Image size.** taosdump plus native libs, in two more images.
- **Native vs WebSocket.** Gateway uses the native driver (`-P 6030`) from inside the docker network; the same should work here. The native protocol resolves the server's configured FQDN, so it fails through host port-mapping — this affects local host-side testing only, and `-Z WebSocket` against the REST port is the workaround if needed.
- **Dump-format coupling.** Reading the source db name out of the dump's `dbs.sql` depends on taosdump's output layout. It is stable within a pinned version, and the version is pinned to the server image by construction, but a TDengine upgrade should re-check it.
- **`-S` semantics.** `-S` filters by row timestamp. Rows written while offline but backdated before `cloudFailedAt` would be missed. Not a regression in practice (fog writes `Date.now()`), but worth knowing.

## 7. Out of scope

The Mongo half of the archive, the clearData()-on-ack wiring, the lock/`cloudIsRecovering` flow, and the cache-eviction step are all untouched.
