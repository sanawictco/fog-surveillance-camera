#!/bin/bash
set -euo pipefail

echo "
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
▓   🚀 Welcome to Sanaw Fog Surveillance Camera App! 🚀   ▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
"
# Node and npm may be installed through nvm and are intentionally run as the
# developer user. Elevate only the filesystem operation that needs root.
if [ "$EUID" -eq 0 ]; then
    echo "Error: do not run this script with sudo"
    echo "Usage: $0"
    exit 1
fi

scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repoRoot="$(cd -- "$scriptDir/../.." && pwd)"

# ---------------------------------------------------------------------------
# Verify prerequisite tools. In dev the backend runs on the HOST
# (npm run start:dev), so the cloud-recovery tools (Path B) and nmap — which the
# camera scanner shells out to for its ARP sweep (design spec §10.1) — must be
# installed locally; they are NOT in a container. Abort with hints if any missing.
# ---------------------------------------------------------------------------
echo "🔎 Verifying prerequisite packages..."
required=(docker node npm tar zstd mongoexport mongosh taosdump nmap)
missing=()
for cmd in "${required[@]}"; do
    if command -v "$cmd" >/dev/null 2>&1; then
        printf '  ✓ %s\n' "$cmd"
    else
        printf '  ✗ %s  (missing)\n' "$cmd"
        missing+=("$cmd")
    fi
done
ldconfigCache="$(ldconfig -p)"
if grep -q 'libtaosnative\.so' <<<"$ldconfigCache"; then
    printf '  ✓ TDengine native driver\n'
else
    printf '  ✗ TDengine native driver  (missing)\n'
    missing+=(tdengine-native-driver)
fi
if docker compose version >/dev/null 2>&1; then
    printf '  ✓ docker compose\n'
else
    printf '  ✗ docker compose  (missing)\n'
    missing+=(docker-compose-plugin)
fi
if [ "${#missing[@]}" -gt 0 ]; then
    cat >&2 <<EOF

❌ Missing prerequisites: ${missing[*]}
   Install them, then re-run this script:
     • tar / zstd ............ sudo apt-get install -y tar zstd
     • nmap .................. sudo apt-get install -y nmap
                               camera discovery shells out to it for the ARP sweep,
                               and in dev the app runs on the HOST, not in a container
     • mongo tools + mongosh . add the MongoDB 8.0 apt repo, then:
         sudo apt-get install -y mongodb-database-tools mongodb-mongosh
      • taosdump .............. start the dev stack, then install the matching TDengine
                                client bundle. taosdump dynamically loads libtaosnative.so,
                                so copying only the executable is insufficient:
          sudo mkdir -p /usr/local/lib/taos
          sudo docker cp -L tdengine-fog:/usr/local/taos/bin/taosdump /usr/local/bin/taosdump
          sudo docker cp -L tdengine-fog:/usr/local/taos/driver/. /usr/local/lib/taos/
          sudo ln -sf /usr/local/lib/taos/libtaos.so /usr/local/lib/libtaos.so
          sudo ln -sf /usr/local/lib/taos/libtaosnative.so /usr/local/lib/libtaosnative.so
          sudo apt-get install -y libgomp1 libjansson4 libsnappy1v5 && sudo ldconfig
     • docker / docker compose  https://docs.docker.com/engine/install/
   See ../README.md for details.
EOF
    exit 1
fi
echo "✅ All prerequisites present."
echo ""

backupPath='/fog_shared_backups'
if [ -d "$backupPath" ]; then
    echo "$backupPath exists"
else
    sudo mkdir -p "$backupPath"
    echo "$backupPath created"
fi

# NOTE: mongo-backup.sh is no longer copied into $backupPath. With the Path B
# cloud-recovery, the backend runs the repo's scripts/mongo-backup.sh directly
# (resolved at cwd/scripts), so it doesn't need to live in the shared dir.
# Make sure $backupPath is writable by the user running `npm run start:dev`.
sudo chown "$(id -u):$(id -g)" "$backupPath"

# Check existence of node_modules
nodeModulesPath="$repoRoot/node_modules"
if [ -d "$nodeModulesPath" ]; then
    echo "node_modules already exists, skipping..."
else
    echo "node_modules does not exist, install packages..."
    npm --prefix "$repoRoot" install
fi

# Run dependent services
if docker compose version &>/dev/null; then
    docker compose -f "$scriptDir/docker-compose-dev.yml" -p fog up -d
elif command -v docker-compose &>/dev/null; then
    docker-compose -f "$scriptDir/docker-compose-dev.yml" -p fog up -d
else
    echo "❌ Docker Compose is not installed!"
fi

# Create database in tdengine
docker exec tdengine-fog taos -s "create database if not exists sanaw;"
echo "✅ Operation successfully completed!"
echo "_______________________________________________________"
echo "💡you shoud do the following steps manually:
1. Update .env.development file with correct values
2. Run npm run start:dev"
