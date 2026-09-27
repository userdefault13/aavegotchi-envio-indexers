#!/usr/bin/env node
/**
 * Points each network at a local HyperSync endpoint (services/hypersync-throttle)
 * when HYPERSYNC_URL_<chainId> is set, e.g. HYPERSYNC_URL_8453=http://host.docker.internal:8797
 *
 * Usage: node ensure-hypersync-url.mjs <path-to-config.yaml>
 * Prints: "patched" | "unchanged"
 */
import fs from "node:fs";

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: node ensure-hypersync-url.mjs <config.yaml>");
  process.exit(1);
}

const lines = fs.readFileSync(configPath, "utf8").split("\n");
let patched = false;

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)- id:\s*(\d+)\s*$/);
  if (!m) continue;
  const [, indent, chainId] = m;
  const url = process.env[`HYPERSYNC_URL_${chainId}`]?.trim();
  if (!url) continue;

  const keyIndent = `${indent}  `;
  let end = i + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() && !line.startsWith(keyIndent) && !line.trimStart().startsWith("#")) break;
    end++;
  }

  const cfg = lines.slice(i + 1, end).findIndex((l) => l === `${keyIndent}hypersync_config:`);
  if (cfg === -1) {
    lines.splice(i + 1, 0, `${keyIndent}hypersync_config:`, `${keyIndent}  url: ${url}`);
    patched = true;
    continue;
  }
  const urlLine = i + 1 + cfg + 1;
  const want = `${keyIndent}  url: ${url}`;
  if (lines[urlLine]?.trimStart().startsWith("url:")) {
    if (lines[urlLine] !== want) {
      lines[urlLine] = want;
      patched = true;
    }
  } else {
    lines.splice(urlLine, 0, want);
    patched = true;
  }
}

if (patched) fs.writeFileSync(configPath, lines.join("\n"));
console.log(patched ? "patched" : "unchanged");
