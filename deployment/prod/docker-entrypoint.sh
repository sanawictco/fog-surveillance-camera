#!/bin/sh
set -eu

load_secret() {
  target_var=$1
  file_path=$2
  if [ ! -r "$file_path" ]; then
    echo "required secret file is unavailable: $file_path" >&2
    exit 1
  fi
  value=$(tr -d '\r' < "$file_path")
  export "$target_var=$value"
}

load_secret NVR_ACCESS_TOKEN "${NVR_ACCESS_TOKEN_FILE:?}"
load_secret JWT_SECRET_KEY "${JWT_SECRET_KEY_FILE:?}"
load_secret TIME_SERIES_DB_PASSWORD "${TIME_SERIES_DB_PASSWORD_FILE:?}"
load_secret REDIS_PASSWORD "${REDIS_PASSWORD_FILE:?}"

test -x /usr/bin/nmap || {
  echo "scanner preflight failed: /usr/bin/nmap is unavailable" >&2
  exit 1
}
test -x /usr/bin/mongoexport || {
  echo "backup preflight failed: mongoexport is unavailable" >&2
  exit 1
}
test -x /usr/bin/mongosh || {
  echo "backup preflight failed: mongosh is unavailable" >&2
  exit 1
}
test -x /usr/bin/zstd || {
  echo "backup preflight failed: zstd is unavailable" >&2
  exit 1
}
test -w /fog_shared_backups || {
  echo "backup preflight failed: /fog_shared_backups is not writable" >&2
  exit 1
}

exec "$@"
