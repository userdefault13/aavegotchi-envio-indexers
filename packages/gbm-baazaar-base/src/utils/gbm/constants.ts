export const GBM_CONTRACT_ADDRESS =
  "0x80320A0000C7A6a34086E2ACAD6915Ff57FfDA31" as const;

export const GBM_STATISTIC_GLOBAL_ID = "0";

/** bytes4 keccak slice for ERC-1155 auctions (see upstream gbm subgraph). */
export const ERC1155_TOKEN_KIND_HEX = "973bb640";

export const BIGINT_CANCELLATION_PERIOD_IN_SECONDS = 3600n;
export const BIGINT_STARTING_BID_FEE_PERCENT = 4n;

/** Base mainnet block when buy-now / ContractV1 paths activated (upstream constants.ts). */
export const BLOCK_NR_BUY_NOW_ACTIVATED = 33_276_502n;
