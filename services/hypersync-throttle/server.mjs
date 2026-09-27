#!/usr/bin/env node
/**
 * HyperSync throttle — one local port per chain, one shared upstream budget.
 *
 * Every indexer on a host shares one Envio API token, and the token's plan caps
 * requests per minute. Point each network's `hypersync_config.url` here
 * (see scripts/ensure-hypersync-url.mjs); Authorization passes through untouched.
 *
 *   HYPERSYNC_RPM=10 HYPERSYNC_CHAINS=8453:8797,84532:8798 node server.mjs
 *
 * HYPERSYNC_RPM is a hard ceiling for any rolling 60 s window on this host,
 * retries included. Split the token's budget across hosts so the sum stays under it.
 */
import http from "node:http";
import { Readable } from "node:stream";

const RPM = Math.max(1, Number(process.env.HYPERSYNC_RPM || 10));
const HEIGHT_TTL_MS = Number(process.env.HYPERSYNC_HEIGHT_TTL_MS || 20_000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.HYPERSYNC_UPSTREAM_TIMEOUT_MS || 120_000);
const MAX_429_RETRIES = Number(process.env.HYPERSYNC_MAX_429_RETRIES || 6);
const BINDS = (process.env.HYPERSYNC_BIND || "127.0.0.1,172.17.0.1").split(",").map((s) => s.trim()).filter(Boolean);
const CHAINS = (process.env.HYPERSYNC_CHAINS || "8453:8797,84532:8798")
  .split(",")
  .map((pair) => pair.split(":").map(Number))
  .filter(([chainId, port]) => chainId > 0 && port > 0);

// Spacing strictly above 60000/RPM means no 60 s window can hold more than RPM starts.
const SPACING_MS = Math.floor(60_000 / RPM) + 1;

let nextSlotAt = 0;
let pausedUntil = 0;
let waiting = 0;
const stats = { forwarded: 0, heightHits: 0, upstream429: 0, errors: 0 };

async function takeSlot() {
  waiting++;
  try {
    for (;;) {
      const now = Date.now();
      const start = Math.max(now, nextSlotAt, pausedUntil);
      nextSlotAt = start + SPACING_MS;
      if (start > now) await new Promise((r) => setTimeout(r, start - now));
      // A 429 may have paused the budget while this caller was waiting.
      if (Date.now() >= pausedUntil) return;
    }
  } finally {
    waiting--;
  }
}

function retryAfterMs(res) {
  const raw = res.headers.get("retry-after");
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  const at = Date.parse(raw || "");
  if (Number.isFinite(at)) return Math.max(1000, at - Date.now());
  return 30_000;
}

const HOP_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding", "keep-alive"]);

function upstreamHeaders(req) {
  const out = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_HEADERS.has(k.toLowerCase()) && v != null) out[k] = v;
  }
  out["accept-encoding"] = "identity";
  return out;
}

async function forward(chainId, req, body) {
  const url = `https://${chainId}.hypersync.xyz${req.url}`;
  for (let attempt = 0; ; attempt++) {
    await takeSlot();
    stats.forwarded++;
    const res = await fetch(url, {
      method: req.method,
      headers: upstreamHeaders(req),
      body: body.length ? body : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
    stats.upstream429++;
    pausedUntil = Math.max(pausedUntil, Date.now() + retryAfterMs(res));
    await res.body?.cancel();
  }
}

function sendBuffered(resp, cached) {
  resp.writeHead(cached.status, cached.headers);
  resp.end(cached.body);
}

const heightCache = new Map();

async function height(chainId, req, resp) {
  const hit = heightCache.get(chainId);
  if (hit?.value && Date.now() - hit.at < HEIGHT_TTL_MS) {
    stats.heightHits++;
    return sendBuffered(resp, hit.value);
  }
  if (hit?.inflight) {
    stats.heightHits++;
    return sendBuffered(resp, await hit.inflight);
  }
  const inflight = (async () => {
    const res = await forward(chainId, req, Buffer.alloc(0));
    const value = {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
      body: Buffer.from(await res.arrayBuffer()),
    };
    heightCache.set(chainId, res.ok ? { value, at: Date.now() } : {});
    return value;
  })();
  heightCache.set(chainId, { ...hit, inflight });
  try {
    sendBuffered(resp, await inflight);
  } catch (err) {
    heightCache.delete(chainId);
    throw err;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function handler(chainId) {
  return async (req, resp) => {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        resp.writeHead(200, { "content-type": "application/json" });
        return resp.end(JSON.stringify({ ok: true, chainId, rpm: RPM, waiting, ...stats }));
      }
      if (req.method === "GET" && req.url.split("?")[0] === "/height") return await height(chainId, req, resp);

      const body = await readBody(req);
      const res = await forward(chainId, req, body);
      const headers = {};
      for (const [k, v] of res.headers) {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) headers[k] = v;
      }
      resp.writeHead(res.status, headers);
      if (res.body) Readable.fromWeb(res.body).pipe(resp);
      else resp.end();
    } catch (err) {
      stats.errors++;
      console.error(`[hypersync-throttle] ${chainId} ${req.method} ${req.url}: ${err?.message || err}`);
      if (!resp.headersSent) resp.writeHead(502, { "content-type": "application/json" });
      resp.end(JSON.stringify({ error: "hypersync-throttle upstream failure" }));
    }
  };
}

for (const [chainId, port] of CHAINS) {
  for (const host of BINDS) {
    const server = http.createServer(handler(chainId));
    server.requestTimeout = 0;
    server.on("error", (err) => console.error(`[hypersync-throttle] bind ${host}:${port} failed: ${err.message}`));
    server.listen(port, host, () => console.log(`[hypersync-throttle] ${host}:${port} -> ${chainId}.hypersync.xyz`));
  }
}

console.log(`[hypersync-throttle] budget ${RPM}/min (one request per ${SPACING_MS} ms), height cache ${HEIGHT_TTL_MS} ms`);
setInterval(() => {
  console.log(`[hypersync-throttle] forwarded=${stats.forwarded} heightHits=${stats.heightHits} 429=${stats.upstream429} errors=${stats.errors} waiting=${waiting}`);
}, 60_000).unref();
