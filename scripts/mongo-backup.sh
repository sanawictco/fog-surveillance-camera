#!/bin/bash
set -euo pipefail

MONGO_HOST="${MONGO_BACKUP_HOST:-localhost}"
MONGO_PORT="${MONGO_BACKUP_PORT:-27017}"
MONGO_DB="${MONGO_BACKUP_DB:-surveillance-fog}"
MONGO_USER="${MONGO_BACKUP_USER:-}"
MONGO_PASS="${MONGO_BACKUP_PASSWORD:-}"
MONGO_AUTHDB="${MONGO_BACKUP_AUTHDB:-admin}"
BACKUP_DIR="${MONGO_BACKUP_DIR:-/fog_shared_backups/mongo}"

mkdir -p "$BACKUP_DIR"

connection=(--host "${MONGO_HOST}:${MONGO_PORT}" --db "$MONGO_DB")
if [ -n "$MONGO_USER" ]; then
  connection+=(
    --username "$MONGO_USER"
    --password "$MONGO_PASS"
    --authenticationDatabase "$MONGO_AUTHDB"
  )
fi

collections=(
  nvrs
  cameras
  pages
  autoProvisioningOperations
  cameraNetworkBindings
)

for collection in "${collections[@]}"; do
  mongoexport "${connection[@]}" \
    --collection "$collection" \
    --out "$BACKUP_DIR/$collection.json"
done
