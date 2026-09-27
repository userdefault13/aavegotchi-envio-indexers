#!/usr/bin/env node
/**
 * Points a compose file's envio-indexer at the host HyperSync throttle
 * (services/hypersync-throttle): sets HYPERSYNC_URL_<chainId> and maps
 * host.docker.internal to the host gateway. Keeps <file>.bak-hypersync.
 *
 * Usage: node compose-hypersync-throttle.mjs <docker-compose.yaml> [8453:8797,84532:8798]
 * Prints: "patched" | "unchanged"
 */
import fs from "node:fs";

const [file, chainsArg = "8453:8797,84532:8798"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node compose-hypersync-throttle.mjs <docker-compose.yaml> [chainId:port,…]");
  process.exit(1);
}

const want = Object.fromEntries(
  chainsArg.split(",").map((pair) => {
    const [chainId, port] = pair.split(":");
    return [`HYPERSYNC_URL_${chainId}`, `http://host.docker.internal:${port}`];
  }),
);

const lines = fs.readFileSync(file, "utf8").split("\n");
const start = lines.findIndex((l) => /^  envio-indexer:\s*$/.test(l));
if (start === -1) throw new Error(`${file}: no envio-indexer service`);
let end = start + 1;
while (end < lines.length && (lines[end].startsWith("    ") || !lines[end].trim())) end++;

const block = () => lines.slice(start, end);
const envAt = block().findIndex((l) => /^    environment:\s*$/.test(l));
if (envAt === -1) throw new Error(`${file}: envio-indexer has no environment map`);
if (/^\s*- /.test(lines[start + envAt + 1] || "")) throw new Error(`${file}: environment is a list, expected a map`);

let changed = false;
for (const [key, value] of Object.entries(want)) {
  const line = `      ${key}: ${value}`;
  const at = block().findIndex((l) => l.trimStart().startsWith(`${key}:`));
  if (at !== -1) {
    if (lines[start + at] !== line) {
      lines[start + at] = line;
      changed = true;
    }
  } else {
    lines.splice(start + envAt + 1, 0, line);
    end++;
    changed = true;
  }
}

if (!block().some((l) => l.includes("host.docker.internal:host-gateway"))) {
  const gateway = '      - "host.docker.internal:host-gateway"';
  const xAt = block().findIndex((l) => /^    extra_hosts:\s*$/.test(l));
  if (xAt !== -1) {
    lines.splice(start + xAt + 1, 0, gateway);
  } else {
    let at = end;
    while (at > start && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, "    extra_hosts:", gateway);
  }
  changed = true;
}

if (changed) {
  fs.copyFileSync(file, `${file}.bak-hypersync`);
  fs.writeFileSync(file, lines.join("\n"));
}
console.log(changed ? "patched" : "unchanged");
