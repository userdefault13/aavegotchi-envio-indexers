/**
 * Socket bridge vault handlers (port of socket-bridge-subgraph, Base).
 */
import {
  SocketBridgeAlpha,
  SocketBridgeFomo,
  SocketBridgeFud,
  SocketBridgeGltr,
  SocketBridgeKek,
} from "generated";
import {
  handleBridgingTokens,
  handleTokensBridged,
  resolveTokenForVault,
} from "../utils/socket/helpers";

function blockRef(event: {
  block: { number: number | bigint; timestamp: number | bigint };
}): { number: bigint; timestamp: bigint } {
  return {
    number: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  };
}

function messageIdHex(messageId: string): string {
  return messageId.toLowerCase();
}

function registerSocketVaultHandlers(
  Contract:
    | typeof SocketBridgeFud
    | typeof SocketBridgeFomo
    | typeof SocketBridgeAlpha
    | typeof SocketBridgeKek
    | typeof SocketBridgeGltr,
): void {
  Contract.BridgingTokens.handler(async ({ event, context }) => {
    if (!resolveTokenForVault(event.srcAddress)) return;

    await handleBridgingTokens(
      context,
      event.srcAddress,
      {
        connector: event.params.connector,
        sender: event.params.sender,
        receiver: event.params.receiver,
        amount: event.params.amount,
        messageId: messageIdHex(String(event.params.messageId)),
      },
      blockRef(event),
      event.transaction.hash,
      event.transaction.value ?? 0n,
    );
  });

  Contract.TokensBridged.handler(async ({ event, context }) => {
    if (!resolveTokenForVault(event.srcAddress)) return;

    const connector =
      "connecter" in event.params && event.params.connecter !== undefined
        ? String(event.params.connecter)
        : String((event.params as { connector?: string }).connector ?? "");

    await handleTokensBridged(
      context,
      event.srcAddress,
      {
        connector,
        receiver: event.params.receiver,
        amount: event.params.amount,
        messageId: messageIdHex(String(event.params.messageId)),
      },
      blockRef(event),
      event.transaction.hash,
    );
  });
}

registerSocketVaultHandlers(SocketBridgeFud);
registerSocketVaultHandlers(SocketBridgeFomo);
registerSocketVaultHandlers(SocketBridgeAlpha);
registerSocketVaultHandlers(SocketBridgeKek);
registerSocketVaultHandlers(SocketBridgeGltr);
