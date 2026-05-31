FROM node:24.3.0-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.7.1

WORKDIR /envio-indexer

COPY package.json package-lock.json* ./
RUN npm install

COPY config.yaml schema.graphql ./
COPY abis ./abis

ARG ENVIO_API_TOKEN=development
ENV ENVIO_API_TOKEN=$ENVIO_API_TOKEN
RUN npx envio codegen

COPY . ./

RUN npm run build

CMD ["npx", "envio", "start"]
