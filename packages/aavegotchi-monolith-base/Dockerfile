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

COPY packages/aavegotchi-monolith-base/package.json packages/aavegotchi-monolith-base/package-lock.json* ./
RUN npm install

COPY packages/aavegotchi-monolith-base/ ./

ARG ENVIO_API_TOKEN=development
ENV ENVIO_API_TOKEN=$ENVIO_API_TOKEN
RUN npx envio codegen

RUN npm run build

ENTRYPOINT ["/opt/envio-scripts/docker-indexer-entrypoint.sh"]
