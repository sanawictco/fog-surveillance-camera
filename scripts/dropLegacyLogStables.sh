#!/bin/bash
# One-time migration: drop the pre-tenant-topology actorLogs/systemLogs
# supertables so the new per-tenant `actor_log_t_<tenant>` /
# `system_log_t_<tenant>` stables can be created at boot.
#
# `CREATE STABLE IF NOT EXISTS` cannot alter an existing stable's column/tag
# shape, so a TDengine still holding the old `actorLogSuperTable` /
# `systemLogSuperTable` (single `groupId` tag) must have them dropped before
# the app starts on the new schema. Dropping a stable drops its child tables
# too (actor logs: one per actor; system logs: `error`/`warning`/
# `information`). Run this once per environment before upgrading.
set -euo pipefail

TDENGINE_HOST="${TIME_SERIES_DB_HOST:-localhost}"
TDENGINE_REST_PORT="${TIME_SERIES_DB_REST_PORT:-6041}"
TDENGINE_USER="${TIME_SERIES_DB_USER:-root}"
TDENGINE_PASSWORD="${TIME_SERIES_DB_PASSWORD:-taosdata}"
TDENGINE_DB="${TIME_SERIES_DB_NAME:-surveillance_fog}"

TOKEN=$(printf '%s:%s' "$TDENGINE_USER" "$TDENGINE_PASSWORD" | base64)

run_sql() {
  curl -sS -X POST \
    -H "Content-Type: text/plain" \
    -H "Authorization: Basic ${TOKEN}" \
    --data "$1" \
    "http://${TDENGINE_HOST}:${TDENGINE_REST_PORT}/rest/sql/${TDENGINE_DB}"
  echo
}

echo "Dropping legacy actorLogSuperTable (and its child tables) from ${TDENGINE_DB}..."
run_sql "DROP STABLE IF EXISTS actorLogSuperTable;"

echo "Dropping legacy systemLogSuperTable (and its child tables) from ${TDENGINE_DB}..."
run_sql "DROP STABLE IF EXISTS systemLogSuperTable;"

echo "Done."
