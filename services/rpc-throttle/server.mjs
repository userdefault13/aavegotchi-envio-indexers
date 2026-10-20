#!/usr/bin/env node
/**
 * RPC throttle — one local JSON-RPC port in front of a shared RPC account, with a hard
 * requests-per-second ceiling, so a re-syncing indexer can't starve other apps on the account.
 *
 *   RPC_UPSTREAM_URL=https://… RPC_RPS=5 RPC_PORT=8799 node server.mjs
 *
 * Point an indexer's BASE_MAINNET_RPC at http://host.docker.internal:8799. The upstream URL (which
 * usually carries the account key) stays in this process's environment and is never logged.
 * RPC_RPS counts upstream HTTP requests, retries included; a JSON-RPC batch is one request.
 * Upstream 429s pause every request for RPC_429_PAUSE_MS before retrying.
 */
import http from "node:http";

const UPSTREAM = String(process.env.RPC_UPSTREAM_URL || "").trim();
if (!/^https?:\/\//.test(UPSTREAM)) {
  console.error("RPC_UPSTREAM_URL must be an http(s) URL");
  process.exit(1);
}
const RPS = Math.max(0.1, Number(process.env.RPC_RPS || 5));
const PORT = Number(process.env.RPC_PORT || 8799);
const BINDS = (process.env.RPC_BIND || "127.0.0.1,172.17.0.1").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_BODY_BYTES = Number(process.env.RPC_MAX_BODY_BYTES || 1_000_000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.RPC_UPSTREAM_TIMEOUT_MS || 30_000);
const MAX_429_RETRIES = Number(process.env.RPC_MAX_429_RETRIES || 6);
const PAUSE_MS = Number(process.env.RPC_429_PAUSE_MS || 5_000);
// Spacing strictly above 1000/RPS, measured between actual starts, so no 1 s window holds more than RPS.
const SPACING_MS = Math.floor(1000 / RPS) + 1;

let lastStartAt = 0;
let pausedUntil = 0;
let queue = Promise.resolve();
const stats = { requests: 0, upstream: 0, upstream429: 0, errors: 0, waiting: 0 };

/** Wait for this request's turn: starts are serialized and spaced from the previous actual start. */
function takeSlot() {
  stats.waiting++;
  const turn = queue.then(async () => {
    for (;;) {
      const wait = Math.max(lastStartAt + SPACING_MS, pausedUntil) - Date.now();
      if (wait <= 0) break;
      await new Promise((r) => setTimeout(r, wait));
    }
    lastStartAt = Date.now();
    stats.waiting--;
  });
  queue = turn;
  return turn;
}

async function forward(body) {
  for (let attempt = 0; ; attempt++) {
    await takeSlot();
    stats.upstream++;
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      stats.upstream429++;
      pausedUntil = Math.max(pausedUntil, Date.now() + PAUSE_MS * (attempt + 1));
      continue;
    }
    return { status: res.status, text: await res.text() };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handle(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rps: RPS, ...stats }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  stats.requests++;
  try {
    const body = await readBody(req);
    const { status, text } = await forward(body);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(text);
  } catch (err) {
    stats.errors++;
    res.writeHead(502, { "content-type": "application/json" });
    // Never echo the upstream URL; only the error kind.
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `rpc-throttle: ${err?.name || "Error"}` } }));
  }
}

for (const host of BINDS) {
  http
    .createServer(handle)
    .on("error", (e) => console.error(`rpc-throttle: cannot bind ${host}:${PORT} (${e.code})`))
    .listen(PORT, host, () => console.log(`rpc-throttle listening on ${host}:${PORT} at ${RPS} req/s`));
}

setInterval(() => console.log(`rpc-throttle stats ${JSON.stringify(stats)}`), 60_000).unref();
