# syntax=docker/dockerfile:1
FROM node:24.16.0-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a AS build

WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- TDengine backup-tooling stage ----------------------------------------
# Cloud recovery runs `taosdump -o` from the BACKEND itself (no Docker socket).
# Extract taosdump + the native client libs from the SAME TDengine image the
# stack runs, so client and server can never drift. Keep this tag in lockstep
# with the tdengine-fog service image.
FROM registry.sanawict.ir/library/tdengine:3.3.6.3 AS taos-tools
RUN set -eux; \
    mkdir -p /opt/taos/lib /opt/taos/bin; \
    cp -av "$(readlink -f /usr/bin/taosdump)" /opt/taos/bin/taosdump; \
    cp -avL /usr/lib/libtaos*.so* /opt/taos/lib/; \
    chmod +x /opt/taos/bin/taosdump; \
    test -x /opt/taos/bin/taosdump

FROM node:24.16-slim AS runtime

ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=400"

ENV TINI_VERSION=v0.19.0
ADD --chmod=755 \
    --checksum=sha256:93dcc18adc78c65a028a84799ecf8ad40c936fdfc5f2a57b1acda5a8117fa82c \
    https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg iproute2 nmap tar zstd liblzma5; \
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
      | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg; \
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" \
      > /etc/apt/sources.list.d/mongodb-org-8.0.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends mongodb-database-tools mongodb-mongosh; \
    apt-get purge -y --auto-remove curl gnupg; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /fog_shared_backups; \
    chown node:node /fog_shared_backups

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

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --chmod=0555 deployment/prod/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chown=node:node --chmod=0555 scripts/mongo-backup.sh /app/scripts/mongo-backup.sh

USER node
EXPOSE 8888
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8888/system-monitor/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/src/main"]
