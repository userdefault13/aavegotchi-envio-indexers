#!/usr/bin/env node
/**
 * Prepends paid/custom Base RPC URLs to config.yaml fallback list when env is set.
 * Public fallbacks should already be committed in config.yaml.
 *
 * Usage: node ensure-base-rpc-fallbacks.mjs <path-to-config.yaml>
 * Prints: "patched" | "unchanged"
 */
import fs from "node:fs";

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

function rpcBlock(url) {
  return [
    "      - url: " + url,
    "        for: fallback",
    "        fallback_stall_timeout: 15000",
    "        query_timeout_millis: 20000",
    "",
  ].join("\n");
}

let content = fs.readFileSync(configPath, "utf8");
const urls = [];
const primary = resolvePrimaryRpc();
if (primary) urls.push(primary);
for (const url of extraFallbackUrls()) {
  if (!urls.includes(url)) urls.push(url);
}

if (urls.length === 0) {
  console.log("unchanged");
  process.exit(0);
}

let patched = false;
for (const url of urls) {
  if (content.includes(url)) continue;
  const match = content.match(/^(\s+)rpc:\s*$/m);
  if (!match) {
    console.error("Could not find 'rpc:' block in config.yaml");
    process.exit(1);
  }
  content = content.replace(/^(\s+)rpc:\s*$/m, `$&\n${rpcBlock(url)}`);
  patched = true;
}

if (patched) {
  fs.writeFileSync(configPath, content);
  console.log("patched");
} else {
  console.log("unchanged");
}
