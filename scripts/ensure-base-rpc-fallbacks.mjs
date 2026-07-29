#!/usr/bin/env node
/**
 * Injects paid/custom Base RPC URLs into config.yaml when env is set.
 * - Primary URL → `for: sync` (historical sync via RPC; bypasses flaky HyperSync)
 * - Extra URLs → `for: fallback`
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

function hasRpcRole(content, url, role) {
  const idx = content.indexOf(`url: ${url}`);
  if (idx === -1) return false;
  return content.slice(idx, idx + 220).includes(`for: ${role}`);
}

function rpcSyncBlock(url) {
  return [
    "      - url: " + url,
    "        for: sync",
    "        query_timeout_millis: 30000",
    "",
  ].join("\n");
}

function rpcFallbackBlock(url) {
  return [
    "      - url: " + url,
    "        for: fallback",
    "        fallback_stall_timeout: 15000",
    "        query_timeout_millis: 20000",
    "",
  ].join("\n");
}

let content = fs.readFileSync(configPath, "utf8");
const primary = resolvePrimaryRpc();
const fallbacks = extraFallbackUrls().filter((url) => url !== primary);

if (!primary && fallbacks.length === 0) {
  console.log("unchanged");
  process.exit(0);
}

let patched = false;

if (primary && !hasRpcRole(content, primary, "sync")) {
  const match = content.match(/^(\s+)rpc:\s*$/m);
  if (!match) {
    console.error("Could not find 'rpc:' block in config.yaml");
    process.exit(1);
  }
  content = content.replace(/^(\s+)rpc:\s*$/m, `$&\n${rpcSyncBlock(primary)}`);
  patched = true;
}

for (const url of fallbacks) {
  if (content.includes(`url: ${url}`)) continue;
  const match = content.match(/^(\s+)rpc:\s*$/m);
  if (!match) {
    console.error("Could not find 'rpc:' block in config.yaml");
    process.exit(1);
  }
  content = content.replace(/^(\s+)rpc:\s*$/m, `$&\n${rpcFallbackBlock(url)}`);
  patched = true;
}

if (patched) {
  fs.writeFileSync(configPath, content);
  console.log("patched");
} else {
  console.log("unchanged");
}
