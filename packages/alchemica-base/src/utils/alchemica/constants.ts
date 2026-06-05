/** Burn address used by OpenZeppelin-style alchemica subgraph. */
export const ALCHEMICA_ADDRESS_BURN =
  "0xffffffffffffffffffffffffffffffffffffffff";

export const ALCHEMICA_TOTAL_SUPPLY_ACCOUNT_KEY = "totalSupply";

export type AlchemicaTokenMeta = {
  symbol: string;
  name: string;
  decimals: number;
};

/** Base mainnet Gotchus Alchemica + GHST (matches Goldsky aavegotchi-alchemica-base). */
export const ALCHEMICA_TOKENS: Record<string, AlchemicaTokenMeta> = {
  "0x2028b4043e6722ea164946c82fe806c4a43a0ff4": {
    symbol: "FUD",
    name: "Aavegotchi FUD Token",
    decimals: 18,
  },
  "0xa32137bfb57d2b6a9fd2956ba4b54741a6d54b58": {
    symbol: "FOMO",
    name: "Aavegotchi FOMO Token",
    decimals: 18,
  },
  "0x15e7cac885e3730ce6389447bc0f7ac032f31947": {
    symbol: "ALPHA",
    name: "Aavegotchi ALPHA TOKEN",
    decimals: 18,
  },
  "0xe52b9170ff4ece4c35e796ffd74b57dec68ca0e5": {
    symbol: "KEK",
    name: "Aavegotchi KEK Token",
    decimals: 18,
  },
  "0x4d140ce792bedc430498c2d219afbc33e2992c9d": {
    symbol: "GLTR",
    name: "Aavegotchi GLTR Token",
    decimals: 18,
  },
  "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb": {
    symbol: "GHST",
    name: "Aavegotchi GHST Token",
    decimals: 18,
  },
};
