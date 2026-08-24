import {
  parse,
  print,
  visit,
  type DocumentNode,
  type FieldNode,
  type SelectionSetNode,
  Kind,
} from "graphql";

/** The Graph root field → Hasura table (Envio entity) */
const ROOT_FIELD_MAP: Record<string, string> = {
  aavegotchi: "Aavegotchi",
  aavegotchis: "Aavegotchi",
  /** Gotchiverse subgraph uses `gotchis` (same Envio Aavegotchi entity). */
  gotchi: "Aavegotchi",
  gotchis: "Aavegotchi",
  aavegotchiOption: "AavegotchiOption",
  aavegotchiOptions: "AavegotchiOption",
  claimedToken: "ClaimedToken",
  claimedTokens: "ClaimedToken",
  equippedWearableOwner: "EquippedWearableOwner",
  equippedWearableOwners: "EquippedWearableOwner",
  erc721Listings: "ERC721Listing",
  erc721Listing: "ERC721Listing",
  erc1155Listings: "ERC1155Listing",
  erc1155Listing: "ERC1155Listing",
  erc1155Purchase: "ERC1155Purchase",
  erc1155Purchases: "ERC1155Purchase",
  erc721BuyOrder: "ERC721BuyOrder",
  erc721BuyOrders: "ERC721BuyOrder",
  erc1155BuyOrder: "ERC1155BuyOrder",
  erc1155BuyOrders: "ERC1155BuyOrder",
  erc1155BuyOrderExecution: "ERC1155BuyOrderExecution",
  erc1155BuyOrderExecutions: "ERC1155BuyOrderExecution",
  gotchiLendings: "GotchiLending",
  gotchiLending: "GotchiLending",
  itemType: "ItemType",
  itemTypes: "ItemType",
  itemTypeOwnership: "ItemTypeOwnership",
  itemTypeOwnerships: "ItemTypeOwnership",
  wearableSet: "WearableSet",
  wearableSets: "WearableSet",
  wearablesConfig: "WearablesConfig",
  wearablesConfigs: "WearablesConfig",
  parcels: "Parcel",
  parcel: "Parcel",
  portal: "Portal",
  portals: "Portal",
  whitelist: "Whitelist",
  whitelists: "Whitelist",
  fakeGotchiCardBalance: "FakeGotchiCardBalance",
  fakeGotchiCardBalances: "FakeGotchiCardBalance",
  fakeGotchiNFTToken: "FakeGotchiNFTToken",
  fakeGotchiNFTTokens: "FakeGotchiNFTToken",
  fakeGotchiNFTTransfer: "FakeGotchiNFTTransfer",
  fakeGotchiNFTTransfers: "FakeGotchiNFTTransfer",
  fakeGotchiStatistic: "FakeGotchiStatistic",
  fakeGotchiStatistics: "FakeGotchiStatistic",
  fakeGotchiHolder: "FakeGotchiHolder",
  fakeGotchiHolders: "FakeGotchiHolder",
  generation: "Generation",
  generations: "Generation",
  metadataActionLog: "MetadataActionLog",
  metadataActionLogs: "MetadataActionLog",
  rolesRegistry: "RolesRegistry",
  rolesRegistries: "RolesRegistry",
  role: "Role",
  roles: "Role",
  roleAssignment: "RoleAssignment",
  roleAssignments: "RoleAssignment",
  tokenCommitment: "TokenCommitment",
  tokenCommitments: "TokenCommitment",
  statistic: "Statistic",
  statistics: "Statistic",
  users: "User",
  user: "User",
  installations: "Installation",
  installation: "Installation",
  tiles: "Tile",
  tile: "Tile",
  installationTypes: "InstallationType",
  installationType: "InstallationType",
  tileTypes: "TileType",
  tileType: "TileType",
  parcelAccessRights: "ParcelAccessRight",
  parcelAccessRight: "ParcelAccessRight",
  forgeSmelt: "ForgeSmelt",
  forgeSmelts: "ForgeSmelt",
  forgeQueueAdd: "ForgeQueueAdd",
  forgeQueueAdds: "ForgeQueueAdd",
  forgeQueueClaim: "ForgeQueueClaim",
  forgeQueueClaims: "ForgeQueueClaim",
  forgeInstantComplete: "ForgeInstantComplete",
  forgeInstantCompletes: "ForgeInstantComplete",
  forgeRarityStat: "ForgeRarityStat",
  forgeRarityStats: "ForgeRarityStat",
  forgeGlobalStat: "ForgeGlobalStat",
  forgeGlobalStats: "ForgeGlobalStat",
};

/** Goldsky socket-bridge-base subgraph root fields → monolith Hasura tables */
const SOCKET_ROOT_FIELD_MAP: Record<string, string> = {
  tokenContract: "TokenContract",
  tokenContracts: "TokenContract",
  bridgeTransfer: "BridgeTransfer",
  bridgeTransfers: "BridgeTransfer",
};

/** Goldsky alchemica-base subgraph root fields → monolith Hasura tables */
const ALCHEMICA_ROOT_FIELD_MAP: Record<string, string> = {
  account: "AlchemicaAccount",
  accounts: "AlchemicaAccount",
  erc20Contract: "ERC20Contract",
  erc20Contracts: "ERC20Contract",
  erc20Balance: "ERC20Balance",
  erc20Balances: "ERC20Balance",
};

/** GLTR staking subgraph root fields → monolith Hasura tables */
const STAKING_ROOT_FIELD_MAP: Record<string, string> = {
  pool: "StakingPool",
  pools: "StakingPool",
  poolPosition: "PoolPosition",
  poolPositions: "PoolPosition",
  user: "StakingUser",
  users: "StakingUser",
  poolStat: "StakingPoolStat",
  poolStats: "StakingPoolStat",
  deposit: "StakingDeposit",
  deposits: "StakingDeposit",
  withdraw: "StakingWithdraw",
  withdraws: "StakingWithdraw",
  harvest: "StakingHarvest",
  harvests: "StakingHarvest",
  emergencyWithdraw: "StakingEmergencyWithdraw",
  emergencyWithdraws: "StakingEmergencyWithdraw",
};

/** Goldsky gbm-baazaar subgraph root fields → monolith Hasura tables */
const GBM_ROOT_FIELD_MAP: Record<string, string> = {
  auction: "Auction",
  auctions: "Auction",
  bid: "Bid",
  bids: "Bid",
  incentive: "Incentive",
  incentives: "Incentive",
  user: "GbmUser",
  users: "GbmUser",
  contract: "GbmContract",
  contracts: "GbmContract",
  statistic: "GbmStatistic",
  statistics: "GbmStatistic",
  transaction: "GbmTransaction",
  transactions: "GbmTransaction",
  auction_BidPlaced: "Auction_BidPlaced",
  auction_BidPlaceds: "Auction_BidPlaced",
  auction_BidRemoved: "Auction_BidRemoved",
  auction_BidRemoveds: "Auction_BidRemoved",
  auction_EndTimeUpdated: "Auction_EndTimeUpdated",
  auction_EndTimeUpdateds: "Auction_EndTimeUpdated",
  auction_IncentivePaid: "Auction_IncentivePaid",
  auction_IncentivePaids: "Auction_IncentivePaid",
  auction_Initialized: "Auction_Initialized",
  auction_Initializeds: "Auction_Initialized",
  auction_StartTimeUpdated: "Auction_StartTimeUpdated",
  auction_StartTimeUpdateds: "Auction_StartTimeUpdated",
  auction_ItemClaimed: "Auction_ItemClaimed",
  auction_ItemClaimeds: "Auction_ItemClaimed",
  auction_BuyItNowUpdated: "Auction_BuyItNowUpdated",
  auction_BuyItNowUpdateds: "Auction_BuyItNowUpdated",
  auction_StartingPriceUpdated: "Auction_StartingPriceUpdated",
  auction_StartingPriceUpdateds: "Auction_StartingPriceUpdated",
  auction_BoughtNow: "Auction_BoughtNow",
  auction_BoughtNows: "Auction_BoughtNow",
  auctionCancelled: "AuctionCancelled",
  auctionCancelleds: "AuctionCancelled",
  contract_BiddingAllowed: "Contract_BiddingAllowed",
  contract_BiddingAlloweds: "Contract_BiddingAllowed",
};

export function rootFieldMapForSubgraphPath(path: string): Record<string, string> {
  if (path.includes("gltr-staking") || path.includes("gltr_staking")) {
    return { ...ROOT_FIELD_MAP, ...STAKING_ROOT_FIELD_MAP };
  }
  if (path.includes("socket-bridge") || path.includes("socket_bridge")) {
    return { ...ROOT_FIELD_MAP, ...SOCKET_ROOT_FIELD_MAP };
  }
  if (path.includes("alchemica")) {
    return { ...ROOT_FIELD_MAP, ...ALCHEMICA_ROOT_FIELD_MAP };
  }
  if (path.includes("gbm") || path.includes("baazaar")) {
    return { ...ROOT_FIELD_MAP, ...GBM_ROOT_FIELD_MAP };
  }
  return ROOT_FIELD_MAP;
}

const ORDER_SUFFIX = /_gt$|_lt$|_gte$|_lte$|_in$|_not$|_contains$|_not_contains$/;

/**
 * The Graph often filters relations with a bare id string (`owner: "0x…"`).
 * Hasura needs the FK column (`owner_id: { _eq: "0x…" }`), not `owner: { _eq }` on User_bool_exp.
 *
 * Do NOT map Bytes address columns to `*_id` — that makes Hasura 500 (`field 'X_id' not found`):
 * - listing/purchase `seller` / `buyer` (except Portal.buyer → User)
 * - GotchiLending `lender` / `borrower` / `originalOwner` (all Bytes)
 * Aavegotchi.originalOwner and Portal.buyer are User relations (handled in relationFkFor).
 *
 * Gotchiverse-base stores address/id scalars (not User FKs):
 * - Parcel/Installation/Tile.owner: String
 * - Installation/Tile/ParcelAccessRight.parcel: String
 * Remapping those to `*_id` 500s Hasura (`field 'owner_id' not found`).
 */
const RELATION_TO_FK: Record<string, string> = {
  owner: "owner_id",
  creator: "creator_id",
  parcel: "parcel_id",
  gotchi: "gotchi_id",
  aavegotchi: "aavegotchi_id",
  user: "user_id",
  account: "account_id",
  contract: "contract_id",
  emitter: "emitter_id",
};

/** Gotchiverse scalar fields that The Graph clients select as entities (`owner { id }`). */
const GOTCHIVERSE_STRING_ENTITY_FIELDS = new Set(["owner", "parcel"]);

/** Gotchiverse string-array fields selected as entity lists (`equippedInstallations { id }`). */
const GOTCHIVERSE_STRING_LIST_ENTITY_FIELDS = new Set([
  "equippedInstallations",
  "equippedTiles",
]);

export function isGotchiverseSubgraphPath(path?: string): boolean {
  return !!path && path.includes("gotchiverse");
}

/** Resolve relation→FK remap; Bytes / gotchiverse String columns stay unmapped. */
function relationFkFor(
  field: string,
  entityType?: string,
  subgraphPath?: string,
): string | undefined {
  if (isGotchiverseSubgraphPath(subgraphPath)) {
    // Gotchiverse schema uses String address/id columns, not Hasura object relations.
    if (GOTCHIVERSE_STRING_ENTITY_FIELDS.has(field)) return undefined;
  }
  if (field === "seller" || field === "lender" || field === "borrower") {
    // Bytes everywhere in core/monolith schemas (never a User FK).
    return undefined;
  }
  if (field === "buyer") {
    // Only Portal.buyer is a User relation; listings/purchases/buy-orders use Bytes.
    if (entityType === "Portal") return "buyer_id";
    return undefined;
  }
  if (field === "originalOwner") {
    // Aavegotchi.originalOwner is User; GotchiLending.originalOwner is Bytes.
    if (entityType === "Aavegotchi") return "originalOwner_id";
    return undefined;
  }
  return RELATION_TO_FK[field];
}

/** Recursively parse GraphQL AST values (lists + nested objects). */
function astValueToJs(
  value: import("graphql").ValueNode,
  variables: Record<string, unknown>,
): unknown {
  switch (value.kind) {
    case Kind.VARIABLE:
      return variables[value.name.value];
    case Kind.STRING:
    case Kind.ENUM:
      return value.value;
    case Kind.BOOLEAN:
      return value.value;
    case Kind.INT:
      return parseInt(value.value, 10);
    case Kind.FLOAT:
      return parseFloat(value.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return value.values.map((v) => astValueToJs(v, variables));
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {};
      for (const f of value.fields) {
        obj[f.name.value] = astValueToJs(f.value, variables);
      }
      return obj;
    }
    default:
      return undefined;
  }
}

function transformWhereValue(
  key: string,
  value: unknown,
  entityType?: string,
  subgraphPath?: string,
): Record<string, unknown> {
  if (value === null || value === undefined) {
    const fk = relationFkFor(key, entityType, subgraphPath);
    return { [fk || key]: { _eq: value } };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // The Graph / clients sometimes pass `owner: { id: "0x…" }` for a relation.
    const fk = relationFkFor(key, entityType, subgraphPath);
    if (
      Object.keys(obj).length === 1 &&
      typeof obj.id === "string"
    ) {
      if (fk) {
        return { [fk]: { _eq: obj.id } };
      }
      // Gotchiverse String columns: flatten nested id filter onto the scalar.
      if (
        isGotchiverseSubgraphPath(subgraphPath) &&
        GOTCHIVERSE_STRING_ENTITY_FIELDS.has(key)
      ) {
        return { [key]: { _eq: obj.id } };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      Object.assign(out, transformWhereFlat(k, v, entityType, subgraphPath));
    }
    return { [key]: out };
  }
  return transformWhereFlat(key, value, entityType, subgraphPath);
}

function hasuraFieldName(
  graphField: string,
  entityType?: string,
  subgraphPath?: string,
): string {
  return relationFkFor(graphField, entityType, subgraphPath) || graphField;
}

function transformWhereFlat(
  key: string,
  value: unknown,
  entityType?: string,
  subgraphPath?: string,
): Record<string, unknown> {
  if (key.endsWith("_gt")) return { [hasuraFieldName(key.slice(0, -3), entityType, subgraphPath)]: { _gt: value } };
  if (key.endsWith("_lt")) return { [hasuraFieldName(key.slice(0, -3), entityType, subgraphPath)]: { _lt: value } };
  if (key.endsWith("_gte")) return { [hasuraFieldName(key.slice(0, -4), entityType, subgraphPath)]: { _gte: value } };
  if (key.endsWith("_lte")) return { [hasuraFieldName(key.slice(0, -4), entityType, subgraphPath)]: { _lte: value } };
  if (key.endsWith("_in")) return { [hasuraFieldName(key.slice(0, -3), entityType, subgraphPath)]: { _in: value } };
  if (key.endsWith("_not")) return { [hasuraFieldName(key.slice(0, -4), entityType, subgraphPath)]: { _neq: value } };
  if (key.endsWith("_not_contains")) return { [hasuraFieldName(key.slice(0, -13), entityType, subgraphPath)]: { _nilike: `%${value}%` } };
  if (key.endsWith("_contains")) return { [hasuraFieldName(key.slice(0, -9), entityType, subgraphPath)]: { _ilike: `%${value}%` } };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const nested: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      Object.assign(nested, transformWhereFlat(k, v, entityType, subgraphPath));
    }
    return { [hasuraFieldName(key, entityType, subgraphPath)]: nested };
  }
  const fk = relationFkFor(key, entityType, subgraphPath);
  if (
    fk &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  ) {
    return { [fk]: { _eq: value } };
  }
  return { [key]: { _eq: value } };
}

function transformWhere(
  where: Record<string, unknown> | undefined,
  entityType?: string,
  subgraphPath?: string,
): Record<string, unknown> | undefined {
  if (!where) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (ORDER_SUFFIX.test(key)) {
      Object.assign(result, transformWhereFlat(key, value, entityType, subgraphPath));
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      const hasOps = Object.keys(inner).some((k) => k.startsWith("_"));
      if (hasOps) {
        result[hasuraFieldName(key, entityType, subgraphPath)] = inner;
      } else {
        Object.assign(result, transformWhereValue(key, value, entityType, subgraphPath));
      }
    } else {
      Object.assign(result, transformWhereFlat(key, value, entityType, subgraphPath));
    }
  }
  return result;
}

const GBM_HASURA_FIELD_ALIAS: Record<string, string> = {
  type: "auctionType",
};

/** Goldsky alchemica subgraph field names → Hasura / Envio entity fields */
const ALCHEMICA_HASURA_FIELD_ALIAS: Record<string, string> = {
  ERC20balances: "erc20Balances",
};

const SOCKET_HASURA_FIELD_ALIAS: Record<string, string> = {
  type: "txType",
};

const SOCKET_TOKEN_HASURA_FIELD_ALIAS: Record<string, string> = {
  type: "tokenType",
};

function selectionSetToHasuraFields(
  selectionSet: SelectionSetNode | undefined,
  useGbmAliases: boolean,
  useAlchemicaAliases: boolean,
  useSocketAliases: boolean,
  useSocketTokenAliases: boolean,
  useStakingAliases: boolean,
  entityType?: string,
  subgraphPath?: string,
  wrapStringAsEntity?: string[],
  wrapStringListAsEntity?: string[],
): string {
  if (!selectionSet) return "id";
  const gotchiverse = isGotchiverseSubgraphPath(subgraphPath);
  const parts: string[] = [];
  for (const sel of selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) continue;
    const field = sel as FieldNode;
    let hasuraName = field.name.value;
    if (useGbmAliases && GBM_HASURA_FIELD_ALIAS[field.name.value]) {
      hasuraName = GBM_HASURA_FIELD_ALIAS[field.name.value];
    } else if (useGbmAliases && field.name.value === "emitter") {
      hasuraName = "GbmUser";
    } else if (useGbmAliases && field.name.value === "transaction") {
      hasuraName = "GbmTransaction";
    } else if (
      useAlchemicaAliases &&
      ALCHEMICA_HASURA_FIELD_ALIAS[field.name.value]
    ) {
      hasuraName = ALCHEMICA_HASURA_FIELD_ALIAS[field.name.value];
    } else if (useAlchemicaAliases && field.name.value === "account") {
      hasuraName = "account_id";
    } else if (useAlchemicaAliases && field.name.value === "contract") {
      hasuraName = "contract_id";
    } else if (
      useSocketAliases &&
      SOCKET_HASURA_FIELD_ALIAS[field.name.value]
    ) {
      hasuraName = SOCKET_HASURA_FIELD_ALIAS[field.name.value];
    } else if (
      useSocketTokenAliases &&
      SOCKET_TOKEN_HASURA_FIELD_ALIAS[field.name.value]
    ) {
      hasuraName = SOCKET_TOKEN_HASURA_FIELD_ALIAS[field.name.value];
    } else if (useSocketAliases && field.name.value === "tokenContract") {
      hasuraName = "tokenContract_id";
    } else if (useStakingAliases && field.name.value === "user") {
      hasuraName = "user_id";
    } else if (useStakingAliases && field.name.value === "pool") {
      hasuraName = "pool_id";
    } else if (useStakingAliases && field.name.value === "stats") {
      hasuraName = "StakingPoolStat";
    }

    const flattenToFkScalar =
      (useAlchemicaAliases &&
        (field.name.value === "account" || field.name.value === "contract")) ||
      (useSocketAliases && field.name.value === "tokenContract") ||
      (useStakingAliases && (field.name.value === "user" || field.name.value === "pool"));

    if (flattenToFkScalar) {
      parts.push(hasuraName);
      continue;
    }

    // Gotchiverse: The Graph clients nest `{ id }` on String / [String!] columns.
    if (gotchiverse && field.selectionSet) {
      if (GOTCHIVERSE_STRING_ENTITY_FIELDS.has(field.name.value)) {
        parts.push(hasuraName);
        wrapStringAsEntity?.push(field.name.value);
        continue;
      }
      if (GOTCHIVERSE_STRING_LIST_ENTITY_FIELDS.has(field.name.value)) {
        parts.push(hasuraName);
        wrapStringListAsEntity?.push(field.name.value);
        continue;
      }
    }

    if (field.selectionSet) {
      let nestedSocket = useSocketAliases;
      let nestedSocketToken = useSocketTokenAliases;
      let nestedStaking = useStakingAliases;
      let nestedAlchemica = useAlchemicaAliases;
      if (useStakingAliases && field.name.value === "stats") {
        nestedStaking = false;
      }
      parts.push(
        `${hasuraName} { ${selectionSetToHasuraFields(field.selectionSet, useGbmAliases, nestedAlchemica, nestedSocket, nestedSocketToken, nestedStaking, undefined, subgraphPath, wrapStringAsEntity, wrapStringListAsEntity)} }`,
      );
    } else {
      const fk = relationFkFor(field.name.value, entityType, subgraphPath);
      if (fk) {
        // The Graph clients often select relations as scalars (`owner` → address string).
        // Hasura requires a selection set for object relations — use the FK column instead.
        parts.push(fk);
      } else {
        parts.push(hasuraName);
      }
    }
  }
  return parts.join("\n        ");
}

const FK_TO_RELATION: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(RELATION_TO_FK).map(([rel, fk]) => [fk, rel]),
  ),
  buyer_id: "buyer",
  originalOwner_id: "originalOwner",
};

/**
 * Rewrite Hasura FK scalars (`owner_id`) back to The Graph relation names (`owner`)
 * when the client requested a bare relation field.
 */
export function mapRelationFkScalarsForSubgraph(rows: unknown): unknown {
  if (Array.isArray(rows)) {
    return rows.map(mapRelationFkScalarsForSubgraph);
  }
  if (rows && typeof rows === "object") {
    const o = { ...(rows as Record<string, unknown>) };
    for (const [fk, rel] of Object.entries(FK_TO_RELATION)) {
      if (fk in o && !(rel in o)) {
        o[rel] = o[fk];
        delete o[fk];
      }
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") {
        o[k] = mapRelationFkScalarsForSubgraph(v);
      }
    }
    return o;
  }
  return rows;
}

/** Map monolith GLTR staking entity fields back to subgraph API names. */
export function mapStakingRowsForSubgraph(rows: unknown): unknown {
  if (Array.isArray(rows)) {
    return rows.map(mapStakingRowsForSubgraph);
  }
  if (rows && typeof rows === "object") {
    const o = { ...(rows as Record<string, unknown>) };
    if ("StakingUser" in o) {
      o.user = mapStakingRowsForSubgraph(o.StakingUser);
      delete o.StakingUser;
    }
    if ("StakingPool" in o) {
      o.pool = mapStakingRowsForSubgraph(o.StakingPool);
      delete o.StakingPool;
    }
    if ("StakingPoolStat" in o) {
      o.stats = mapStakingRowsForSubgraph(o.StakingPoolStat);
      delete o.StakingPoolStat;
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") {
        o[k] = mapStakingRowsForSubgraph(v);
      }
    }
    return o;
  }
  return rows;
}

/** Map monolith socket entity fields back to Goldsky subgraph names. */
export function mapSocketRowsForSubgraph(rows: unknown): unknown {
  if (Array.isArray(rows)) {
    return rows.map(mapSocketRowsForSubgraph);
  }
  if (rows && typeof rows === "object") {
    const o = { ...(rows as Record<string, unknown>) };
    if ("txType" in o) {
      o.type = o.txType;
    } else if ("tokenType" in o) {
      o.type = o.tokenType;
    }
    if ("TokenContract" in o) {
      o.tokenContract = mapSocketRowsForSubgraph(o.TokenContract);
      delete o.TokenContract;
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") {
        o[k] = mapSocketRowsForSubgraph(v);
      }
    }
    return o;
  }
  return rows;
}

/** Map monolith alchemica rows for subgraph clients (nested account/contract enriched separately). */
export function mapAlchemicaRowsForSubgraph(rows: unknown): unknown {
  if (Array.isArray(rows)) {
    return rows.map(mapAlchemicaRowsForSubgraph);
  }
  if (rows && typeof rows === "object") {
    const o = { ...(rows as Record<string, unknown>) };
    if ("AlchemicaAccount" in o) {
      o.account = mapAlchemicaRowsForSubgraph(o.AlchemicaAccount);
      delete o.AlchemicaAccount;
    }
    if ("ERC20Contract" in o) {
      o.contract = mapAlchemicaRowsForSubgraph(o.ERC20Contract);
      delete o.ERC20Contract;
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") {
        o[k] = mapAlchemicaRowsForSubgraph(v);
      }
    }
    return o;
  }
  return rows;
}

/** Map monolith GBM entity fields back to Goldsky subgraph names. */
export function mapGbmRowsForSubgraph(rows: unknown): unknown {
  if (Array.isArray(rows)) {
    return rows.map(mapGbmRowsForSubgraph);
  }
  if (rows && typeof rows === "object") {
    const o = { ...(rows as Record<string, unknown>) };
    if ("auctionType" in o) {
      o.type = o.auctionType;
    } else if ("bidType" in o) {
      o.type = o.bidType;
    } else if ("incentiveType" in o) {
      o.type = o.incentiveType;
    }
    if ("GbmUser" in o) {
      o.emitter = mapGbmRowsForSubgraph(o.GbmUser);
      delete o.GbmUser;
    }
    if ("GbmTransaction" in o) {
      o.transaction = mapGbmRowsForSubgraph(o.GbmTransaction);
      delete o.GbmTransaction;
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") {
        o[k] = mapGbmRowsForSubgraph(v);
      }
    }
    return o;
  }
  return rows;
}

/**
 * Wrap gotchiverse Hasura String / [String!] values as The Graph entity shapes
 * when the client selected nested `{ id }` fields.
 */
export function mapGotchiverseStringEntities(
  rows: unknown,
  wrapScalar: string[],
  wrapList: string[],
): unknown {
  if (!wrapScalar.length && !wrapList.length) return rows;
  const scalarSet = new Set(wrapScalar);
  const listSet = new Set(wrapList);

  const mapRow = (row: unknown): unknown => {
    if (Array.isArray(row)) return row.map(mapRow);
    if (!row || typeof row !== "object") return row;
    const o = { ...(row as Record<string, unknown>) };
    for (const key of scalarSet) {
      if (typeof o[key] === "string") {
        o[key] = { id: o[key] };
      }
    }
    for (const key of listSet) {
      if (Array.isArray(o[key])) {
        o[key] = (o[key] as unknown[]).map((v) =>
          typeof v === "string" ? { id: v } : v,
        );
      }
    }
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") {
        o[k] = mapRow(v);
      }
    }
    return o;
  };

  return mapRow(rows);
}

export interface TranslateResult {
  hasuraQuery: string;
  rootField: string;
  originalRootField: string;
  wrapStringAsEntity: string[];
  wrapStringListAsEntity: string[];
}

export function translateSubgraphToHasura(
  query: string,
  variables: Record<string, unknown> = {},
  fieldMap: Record<string, string> = ROOT_FIELD_MAP,
  subgraphPath?: string,
): TranslateResult {
  const doc: DocumentNode = parse(query);
  let rootField = "";
  let originalRootField = "";
  let fieldArgs: Record<string, unknown> = {};
  let selectionSet: SelectionSetNode | undefined;

  visit(doc, {
    Field(node) {
      if (!rootField && node.name.value !== "__schema" && node.name.value !== "__type" && node.name.value !== "_meta") {
        originalRootField = node.name.value;
        rootField = fieldMap[node.name.value] ?? node.name.value;
        selectionSet = node.selectionSet ?? undefined;
        fieldArgs = {};
        for (const arg of node.arguments ?? []) {
          fieldArgs[arg.name.value] = astValueToJs(arg.value, variables);
        }
      }
    },
  });

  if (!rootField) {
    throw new Error("Unsupported query: no recognized root field");
  }

  const limit = fieldArgs.first ?? fieldArgs.last ?? 100;
  const offset = fieldArgs.skip ?? 0;
  let where = transformWhere(
    fieldArgs.where as Record<string, unknown> | undefined,
    rootField,
    subgraphPath,
  );
  // The Graph singular lookups: parcel(id: "…") / aavegotchi(id: "…")
  if (fieldArgs.id != null) {
    where = { ...(where || {}), id: { _eq: fieldArgs.id } };
  }
  const orderByField = fieldArgs.orderBy as string | undefined;
  const orderDir = (fieldArgs.orderDirection as string | undefined)?.toLowerCase() ?? "asc";

  const whereClause = where ? `where: ${jsonToGraphql(where)}` : "";
  const orderClause = orderByField ? `order_by: {${orderByField}: ${orderDir}}` : "";
  const args = [`limit: ${limit}`, `offset: ${offset}`, whereClause, orderClause].filter(Boolean).join(", ");

  const useGbmAliases =
    fieldMap !== ROOT_FIELD_MAP && fieldMap.statistic === "GbmStatistic";
  const useAlchemicaAliases =
    fieldMap !== ROOT_FIELD_MAP &&
    (fieldMap.account === "AlchemicaAccount" ||
      fieldMap.accounts === "AlchemicaAccount" ||
      fieldMap.erc20Balance === "ERC20Balance" ||
      fieldMap.erc20Balances === "ERC20Balance" ||
      fieldMap.erc20Contract === "ERC20Contract" ||
      fieldMap.erc20Contracts === "ERC20Contract");
  const socketPath = fieldMap !== ROOT_FIELD_MAP && fieldMap.bridgeTransfers === "BridgeTransfer";
  const useSocketAliases =
    socketPath &&
    (originalRootField === "bridgeTransfer" || originalRootField === "bridgeTransfers");
  const useSocketTokenAliases =
    socketPath &&
    (originalRootField === "tokenContract" || originalRootField === "tokenContracts");
  const useStakingAliases =
    fieldMap !== ROOT_FIELD_MAP &&
    (fieldMap.pools === "StakingPool" ||
      fieldMap.poolPositions === "PoolPosition" ||
      fieldMap.poolStats === "StakingPoolStat");
  const wrapStringAsEntity: string[] = [];
  const wrapStringListAsEntity: string[] = [];
  const fields = selectionSetToHasuraFields(
    selectionSet,
    useGbmAliases,
    useAlchemicaAliases,
    useSocketAliases,
    useSocketTokenAliases,
    useStakingAliases,
    rootField,
    subgraphPath,
    wrapStringAsEntity,
    wrapStringListAsEntity,
  );

  const hasuraQuery = `query ProxyQuery {
  ${rootField}(${args}) {
        ${fields}
  }
}`;

  return {
    hasuraQuery,
    rootField,
    originalRootField,
    wrapStringAsEntity,
    wrapStringListAsEntity,
  };
}

function jsonToGraphql(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "string") return `"${obj.replace(/"/g, '\\"')}"`;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(jsonToGraphql).join(", ")}]`;
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${jsonToGraphql(v)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return "null";
}

export function wrapHasuraResponse(
  hasuraData: Record<string, unknown>,
  hasuraRoot: string,
  originalRootField: string,
): Record<string, unknown> {
  const rows = hasuraData[hasuraRoot];
  return { [originalRootField]: rows };
}

/** Introspection passthrough for schema checks */
export function isIntrospectionQuery(query: string): boolean {
  return query.includes("__schema") || query.includes("__type");
}

export function buildMetaResponse(): Record<string, unknown> {
  return {
    _meta: {
      block: { number: 0 },
      deployment: "envio-self-hosted",
      hasIndexingErrors: false,
    },
  };
}
