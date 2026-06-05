export const GLTR_STAKING_CONTRACT =
  "0xab449dca14413a6ae0bcea9ea210b57ace280d2c";

export const BIGINT_ZERO = 0n;

export type StakingPoolMeta = {
  name: string;
  lpToken: string;
};

/** Base GLTR farm pools (pid → LP token), aligned with staking UI. */
export const BASE_GLTR_STAKING_POOLS: Record<string, StakingPoolMeta> = {
  "0": { name: "ghst-fud", lpToken: "0xeae2fb93e291c2eb69195851813de24f97f1ce71" },
  "1": { name: "ghst-fomo", lpToken: "0x62ab7d558a011237f8a57ac0f97601a764e85b88" },
  "2": { name: "ghst-alpha", lpToken: "0x0ba2a49aedf9a409dbb0272db7cdf98aeb1e1837" },
  "3": { name: "ghst-kek", lpToken: "0x699b4eb36b95cdf62c74f6322aaa140e7958dc9f" },
  "4": { name: "ghst-weth", lpToken: "0x0dfb9cb66a18468850d6216fcc691aa20ad1e091" },
  "5": { name: "ghst-gltr", lpToken: "0xa83b31d701633b8edcfba55b93ddbc202d8a4621" },
};
