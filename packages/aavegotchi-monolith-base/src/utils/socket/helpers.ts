import type { HandlerContext } from "generated";
import { BASE_SOCKET_BRIDGE_VAULTS, TX_TYPE_BRIDGED, TX_TYPE_BRIDGING } from "./constants";

export type SocketContext = HandlerContext;

type TokenContractEntity = NonNullable<
  Awaited<ReturnType<SocketContext["TokenContract"]["get"]>>
>;
type BridgeTransferEntity = NonNullable<
  Awaited<ReturnType<SocketContext["BridgeTransfer"]["get"]>>
>;

export type BlockRef = { number: bigint; timestamp: bigint };

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

function messageIdToId(messageId: string): string {
  const hex = messageId.toLowerCase();
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

export function resolveTokenForVault(
  vaultAddress: string,
): (typeof BASE_SOCKET_BRIDGE_VAULTS)[string] | undefined {
  return BASE_SOCKET_BRIDGE_VAULTS[normalizeAddress(vaultAddress)];
}

export async function getOrCreateTokenContract(
  context: SocketContext,
  vaultAddress: string,
): Promise<TokenContractEntity | undefined> {
  const meta = resolveTokenForVault(vaultAddress);
  if (!meta) return undefined;

  const id = normalizeAddress(meta.tokenAddress);
  const existing = await context.TokenContract.get(id);
  if (existing) return existing;

  const contract: TokenContractEntity = {
    id,
    symbol: meta.symbol,
    tokenType: meta.tokenType,
  };
  context.TokenContract.set(contract);
  return contract;
}

export async function getOrCreateBridgeTransfer(
  context: SocketContext,
  messageId: string,
): Promise<BridgeTransferEntity> {
  const id = messageIdToId(messageId);
  const existing = await context.BridgeTransfer.get(id);
  if (existing) return existing;

  const entity: BridgeTransferEntity = {
    id,
    messageId: id,
    tokenContract_id: "",
    connector: "0x0000000000000000000000000000000000000000",
    sender: undefined,
    receiver: "0x0000000000000000000000000000000000000000",
    amount: 0n,
    fee: undefined,
    txType: TX_TYPE_BRIDGING,
    timestamp: 0n,
    txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    tokenId: undefined,
    blockNumber: 0n,
  };
  context.BridgeTransfer.set(entity);
  return entity;
}

export async function handleBridgingTokens(
  context: SocketContext,
  vaultAddress: string,
  params: {
    connector: string;
    sender: string;
    receiver: string;
    amount: bigint;
    messageId: string;
  },
  block: BlockRef,
  txHash: string,
  txValue: bigint,
): Promise<void> {
  const token = await getOrCreateTokenContract(context, vaultAddress);
  if (!token) return;

  const transfer = await getOrCreateBridgeTransfer(context, params.messageId);
  context.BridgeTransfer.set({
    ...transfer,
    messageId: messageIdToId(params.messageId),
    tokenContract_id: token.id,
    connector: normalizeAddress(params.connector),
    sender: normalizeAddress(params.sender),
    receiver: normalizeAddress(params.receiver),
    amount: params.amount,
    fee: txValue,
    txType: TX_TYPE_BRIDGING,
    timestamp: block.timestamp,
    txHash: txHash.toLowerCase(),
    blockNumber: block.number,
  });
}

export async function handleTokensBridged(
  context: SocketContext,
  vaultAddress: string,
  params: {
    connector: string;
    receiver: string;
    amount: bigint;
    messageId: string;
  },
  block: BlockRef,
  txHash: string,
): Promise<void> {
  const token = await getOrCreateTokenContract(context, vaultAddress);
  if (!token) return;

  const transfer = await getOrCreateBridgeTransfer(context, params.messageId);
  context.BridgeTransfer.set({
    ...transfer,
    messageId: messageIdToId(params.messageId),
    tokenContract_id: token.id,
    connector: normalizeAddress(params.connector),
    receiver: normalizeAddress(params.receiver),
    amount: params.amount,
    fee: undefined,
    sender: transfer.sender,
    txType: TX_TYPE_BRIDGED,
    timestamp: block.timestamp,
    txHash: txHash.toLowerCase(),
    blockNumber: block.number,
  });
}
