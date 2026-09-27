#!/usr/bin/env node
/**
 * Injects paid/custom Base mainnet RPC URLs into the chain 8453 networks of config.yaml.
 * Other chains (e.g. Base Sepolia 84532) are never touched: a mainnet RPC there
 * serves the wrong chain.
 * - Primary URL → `for: fallback` (HyperSync does historical catch-up);
 *   `for: sync` only when ENVIO_RPC_FOR_SYNC=1
 * - Extra URLs (BASE_RPC_FALLBACK_URLS) → `for: fallback`
 *
 * Usage: node ensure-base-rpc-fallbacks.mjs <path-to-config.yaml>
 * Prints: "patched" | "unchanged"
 */
import fs from "node:fs";

const BASE_MAINNET = "8453";

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: node ensure-base-rpc-fallbacks.mjs <config.yaml>");
  process.exit(1);
}

function resolvePrimaryRpc() {
  if (process.env.BASE_MAINNET_RPC?.trim()) {
    return process.env.BASE_MAINNET_RPC.trim();
  }
  const alchemyKey = process.env.ALCHEMY_API_KEY?.trim();
  if (alchemyKey) {
    return `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  }
  return null;
}

function extraFallbackUrls() {
  const raw = process.env.BASE_RPC_FALLBACK_URLS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function rpcSyncBlock(url) {
  return ["      - url: " + url, "        for: sync", "        query_timeout_millis: 30000"];
}

function rpcFallbackBlock(url) {
  return [
    "      - url: " + url,
    "        for: fallback",
    "        fallback_stall_timeout: 15000",
    "        query_timeout_millis: 20000",
  ];
}

/** [start, end) line ranges of each `- id: 8453` network. */
function mainnetSections(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- id:\s*(\d+)\s*$/);
    if (!m || m[2] !== BASE_MAINNET) continue;
    const keyIndent = `${m[1]}  `;
    let end = i + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() && !line.startsWith(keyIndent) && !line.trimStart().startsWith("#")) break;
      end++;
    }
    out.push([i, end]);
  }
  return out;
}

const primary = resolvePrimaryRpc();
const fallbacks = extraFallbackUrls().filter((url) => url !== primary);

if (!primary && fallbacks.length === 0) {
  console.log("unchanged");
  process.exit(0);
}

const lines = fs.readFileSync(configPath, "utf8").split("\n");
const blocks = [];
if (primary) blocks.push([primary, process.env.ENVIO_RPC_FOR_SYNC === "1" ? rpcSyncBlock(primary) : rpcFallbackBlock(primary)]);
for (const url of fallbacks) blocks.push([url, rpcFallbackBlock(url)]);

let patched = false;
// Bottom-up so earlier section offsets stay valid while inserting.
for (const [start, end] of mainnetSections(lines).reverse()) {
  const section = lines.slice(start, end);
  const rpcAt = section.findIndex((l) => /^\s+rpc:\s*$/.test(l));
  if (rpcAt === -1) {
    console.error(`chain ${BASE_MAINNET} network has no 'rpc:' block in ${configPath}`);
    process.exit(1);
  }
  const insert = blocks.filter(([url]) => !section.some((l) => l.trim() === `- url: ${url}`)).flatMap(([, b]) => b);
  if (insert.length) {
    lines.splice(start + rpcAt + 1, 0, ...insert);
    patched = true;
  }
}

if (patched) fs.writeFileSync(configPath, lines.join("\n"));
console.log(patched ? "patched" : "unchanged");
