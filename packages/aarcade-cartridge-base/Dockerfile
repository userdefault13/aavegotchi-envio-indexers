FROM node:24.3.0-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.7.1

WORKDIR /envio-indexer

COPY scripts/ensure-base-rpc-fallbacks.mjs /opt/envio-scripts/ensure-base-rpc-fallbacks.mjs
COPY scripts/docker-indexer-entrypoint.sh /opt/envio-scripts/docker-indexer-entrypoint.sh
RUN chmod +x /opt/envio-scripts/docker-indexer-entrypoint.sh

COPY packages/aarcade-cartridge-base/package.json packages/aarcade-cartridge-base/package-lock.json* ./
RUN npm install

COPY packages/aarcade-cartridge-base/ ./

ARG ENVIO_API_TOKEN=development
ENV ENVIO_API_TOKEN=$ENVIO_API_TOKEN
ENV PNPM_HOME=/tmp/pnpm-store
RUN mkdir -p "$PNPM_HOME" && rm -rf generated build
RUN npx envio codegen

RUN npm run build

ENTRYPOINT ["/opt/envio-scripts/docker-indexer-entrypoint.sh"]
