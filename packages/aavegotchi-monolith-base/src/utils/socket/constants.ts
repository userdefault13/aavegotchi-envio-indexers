export const TX_TYPE_BRIDGING = "BRIDGING";
export const TX_TYPE_BRIDGED = "BRIDGED";

export type SocketBridgeTokenMeta = {
  symbol: string;
  tokenAddress: string;
  tokenType: string;
};

/**
 * Base Socket vault/controller contracts (emit BridgingTokens / TokensBridged).
 * tokenAddress is the canonical ERC-20 id used on Goldsky socket-bridge-base.
 */
export const BASE_SOCKET_BRIDGE_VAULTS: Record<string, SocketBridgeTokenMeta> = {
  "0xbdc2420b1e7f1f97d45b55a2ea9d3b4eb2675b75": {
    symbol: "FUD",
    tokenAddress: "0x2028b4043e6722ea164946c82fe806c4a43a0ff4",
    tokenType: "ERC20",
  },
  "0x321fcfc2cc0d45d2eb252a11bba8274543819feb": {
    symbol: "FOMO",
    tokenAddress: "0xa32137bfb57d2b6a9fd2956ba4b54741a6d54b58",
    tokenType: "ERC20",
  },
  "0xc87653358d5edc7716057c865b8cd9ac5eb44a16": {
    symbol: "ALPHA",
    tokenAddress: "0x15e7cac885e3730ce6389447bc0f7ac032f31947",
    tokenType: "ERC20",
  },
  "0x3d57a1a3429825c35b7c432f8885fa1d0eede460": {
    symbol: "KEK",
    tokenAddress: "0xe52b9170ff4ece4c35e796ffd74b57dec68ca0e5",
    tokenType: "ERC20",
  },
  "0x8b2d15f61b99de5fd53dfcff8af995f17f9536d": {
    symbol: "GLTR",
    tokenAddress: "0x4d140ce792bedc430498c2d219afbc33e2992c9d",
    tokenType: "ERC20",
  },
};
