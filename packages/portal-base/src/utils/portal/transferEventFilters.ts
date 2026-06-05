import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AavegotchiDiamond_Transfer_eventFilters } from "generated";

/** Max inclusive span when expanding PORTAL_TRANSFER_TOKEN_ID_MIN/MAX into topic filters. */
const DEFAULT_MAX_RANGE_SPREAD = 2500;

const PACKAGE_ROOT = process.env.PORTAL_PACKAGE_ROOT ?? process.cwd();
const DEFAULT_IDS_FILE = join(
  PACKAGE_ROOT,
  process.env.PORTAL_TRANSFER_TOKEN_IDS_FILE ?? "portal-transfer-token-ids.json",
);

function parseBigIntList(raw: string): bigint[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));
}

function loadIdsFromJsonFile(path: string): bigint[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${path}: expected a JSON array of token id strings`);
  }
  return parsed.map((id) => BigInt(String(id)));
}

function expandInclusiveRange(min: bigint, max: bigint, maxSpread: number): bigint[] {
  if (min > max) return [];
  const spread = max - min + 1n;
  if (spread > BigInt(maxSpread)) {
    throw new Error(
      `Portal transfer ID range ${min}-${max} spans ${spread} ids (max ${maxSpread}). ` +
        `Use portal-transfer-token-ids.json or PORTAL_TRANSFER_TOKEN_IDS instead.`,
    );
  }
  const ids: bigint[] = [];
  for (let id = min; id <= max; id++) {
    ids.push(id);
  }
  return ids;
}

/** Portal token ids used for HyperSync topic filters on Transfer (_tokenId is indexed). */
export function loadPortalTransferTokenIds(): bigint[] {
  const fromEnv = process.env.PORTAL_TRANSFER_TOKEN_IDS
    ? parseBigIntList(process.env.PORTAL_TRANSFER_TOKEN_IDS)
    : [];

  const fromFile = loadIdsFromJsonFile(DEFAULT_IDS_FILE);

  const minRaw = process.env.PORTAL_TRANSFER_TOKEN_ID_MIN;
  const maxRaw = process.env.PORTAL_TRANSFER_TOKEN_ID_MAX;
  const maxSpread = Number(
    process.env.PORTAL_TRANSFER_MAX_RANGE_SPREAD ?? DEFAULT_MAX_RANGE_SPREAD,
  );
  const fromRange =
    minRaw !== undefined && maxRaw !== undefined
      ? expandInclusiveRange(BigInt(minRaw), BigInt(maxRaw), maxSpread)
      : [];

  const merged = [...fromEnv, ...fromFile, ...fromRange];
  const unique = [...new Set(merged.map((id) => id.toString()))].map((s) =>
    BigInt(s),
  );
  unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return unique;
}

export function buildPortalTransferEventFilters():
  | AavegotchiDiamond_Transfer_eventFilters
  | undefined {
  if (process.env.PORTAL_INDEX_TRANSFER === "0") {
    return undefined;
  }

  const tokenIds = loadPortalTransferTokenIds();
  if (tokenIds.length === 0) {
    console.warn(
      "[portal-base] Transfer indexing disabled: no portal token ids in " +
        "portal-transfer-token-ids.json or PORTAL_TRANSFER_TOKEN_IDS. " +
        "Run: npm run portal:export-transfer-ids",
    );
    return undefined;
  }

  // One filter object with multiple _tokenId values => OR at the indexed topic.
  return { _tokenId: tokenIds };
}

export function getPortalTransferTokenIdSet(): ReadonlySet<string> {
  return new Set(loadPortalTransferTokenIds().map((id) => id.toString()));
}
