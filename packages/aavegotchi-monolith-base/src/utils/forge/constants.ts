/** Forge alloy cost by rarity score modifier (matches on-chain forgeAlloyCost). */
export const FORGE_ALLOY_COST: Record<number, bigint> = {
  1: 100n,
  2: 300n,
  5: 1300n,
  10: 5300n,
  20: 25000n,
  50: 130000n,
};

export const FORGE_ESSENCE_COST: Record<number, bigint> = {
  1: 1n,
  2: 5n,
  5: 10n,
  10: 50n,
  20: 250n,
  50: 1000n,
};

export const SMELT_USER_BIPS = 9000n;
export const SMELT_DAO_BIPS = 500n;
export const SMELT_BURN_BIPS = 500n;
export const BIPS = 10000n;

export const FORGE_GLOBAL_STAT_ID = "global";
