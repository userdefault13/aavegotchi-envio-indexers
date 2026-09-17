import { ACartridgeDiamond, Agent, AgentController, AgentGameRep, AgentCheckpoint, GameAttestor } from "generated";

const ZERO = "0x0000000000000000000000000000000000000000";

function bytes32ToString(hex: string): string | undefined {
  const raw = Buffer.from(hex.replace(/^0x/, ""), "hex").toString("utf8").replace(/\0+$/, "");
  return raw.length ? raw : undefined;
}

ACartridgeDiamond.ACartridgeMinted.handler(async ({ event, context }) => {
  const id = event.params.tokenId.toString();
  context.Agent.set({
    id,
    tokenId: event.params.tokenId,
    owner: event.params.owner.toLowerCase(),
    account: event.params.account.toLowerCase(),
    originConsole: (event.transaction.from ?? ZERO).toLowerCase(),
    mintCurrency: event.params.currency,
    mintAmount: event.params.amount,
    reputation: 0n,
    zone: undefined,
    koWins: 0,
    koLosses: 0,
    worldUpdatedAt: 0n,
    controllerIds: [],
    mintedAt: BigInt(event.block.timestamp),
    updatedAt: BigInt(event.block.timestamp),
  });
});

ACartridgeDiamond.Transfer.handler(async ({ event, context }) => {
  if (event.params.from === ZERO) return; // mint handled above
  const id = event.params.tokenId.toString();
  const agent = await context.Agent.get(id);
  if (!agent) return;
  context.Agent.set({ ...agent, owner: event.params.to.toLowerCase(), updatedAt: BigInt(event.block.timestamp) });
});

ACartridgeDiamond.ControllerSet.handler(async ({ event, context }) => {
  const agentId = event.params.tokenId.toString();
  const controller = event.params.controller.toLowerCase();
  const id = `${agentId}-${controller}`;
  context.AgentController.set({
    id,
    agent_id: agentId,
    controller,
    expiresAt: event.params.expiresAt,
    dailyCapGhst: event.params.dailyCapGhst,
    active: true,
    setAt: BigInt(event.block.timestamp),
  });
  const agent = await context.Agent.get(agentId);
  if (agent && !agent.controllerIds.includes(id)) {
    context.Agent.set({ ...agent, controllerIds: [...agent.controllerIds, id], updatedAt: BigInt(event.block.timestamp) });
  }
});

ACartridgeDiamond.ControllerRevoked.handler(async ({ event, context }) => {
  const id = `${event.params.tokenId.toString()}-${event.params.controller.toLowerCase()}`;
  const row = await context.AgentController.get(id);
  if (!row) return;
  context.AgentController.set({ ...row, active: false });
});

// Emitted on transfer: every controller of the sold agent is dropped by the diamond.
ACartridgeDiamond.ControllersCleared.handler(async ({ event, context }) => {
  const agentId = event.params.tokenId.toString();
  const agent = await context.Agent.get(agentId);
  if (!agent) return;
  for (const cid of agent.controllerIds) {
    const row = await context.AgentController.get(cid);
    if (row && row.active) context.AgentController.set({ ...row, active: false });
  }
  context.Agent.set({ ...agent, controllerIds: [], updatedAt: BigInt(event.block.timestamp) });
});

ACartridgeDiamond.GameEntered.handler(async ({ event, context }) => {
  const agentId = event.params.tokenId.toString();
  const id = `${agentId}-${event.params.gameId}`;
  context.AgentGameRep.set({
    id,
    agent_id: agentId,
    gameId: event.params.gameId,
    cartridgeId: event.params.cartridgeId,
    bestScore: 0n,
    sessions: 0,
    lastNonce: 0n,
    lastAttestedAt: 0n,
    enteredAt: BigInt(event.block.timestamp),
  });
});

ACartridgeDiamond.CheckpointAttested.handler(async ({ event, context }) => {
  const agentId = event.params.tokenId.toString();
  const repId = `${agentId}-${event.params.gameId}`;
  context.AgentCheckpoint.set({
    id: `${repId}-${event.params.nonce.toString()}`,
    agent_id: agentId,
    gameId: event.params.gameId,
    cartridgeId: event.params.cartridgeId,
    nonce: event.params.nonce,
    stateHash: event.params.stateHash,
    score: event.params.score,
    attested: event.params.attested,
    at: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });
  if (!event.params.attested) return;
  const rep = await context.AgentGameRep.get(repId);
  if (!rep) return;
  context.AgentGameRep.set({
    ...rep,
    bestScore: event.params.score > rep.bestScore ? event.params.score : rep.bestScore,
    sessions: rep.sessions + 1,
    lastNonce: event.params.nonce,
    lastAttestedAt: BigInt(event.block.timestamp),
  });
});

ACartridgeDiamond.ReputationUpdated.handler(async ({ event, context }) => {
  const id = event.params.tokenId.toString();
  const agent = await context.Agent.get(id);
  if (!agent) return;
  context.Agent.set({ ...agent, reputation: event.params.reputation, updatedAt: BigInt(event.block.timestamp) });
});

ACartridgeDiamond.WorldUpdated.handler(async ({ event, context }) => {
  const id = event.params.tokenId.toString();
  const agent = await context.Agent.get(id);
  if (!agent) return;
  context.Agent.set({
    ...agent,
    zone: bytes32ToString(event.params.zone) ?? agent.zone,
    koWins: Number(event.params.koWins),
    koLosses: Number(event.params.koLosses),
    worldUpdatedAt: BigInt(event.block.timestamp),
    updatedAt: BigInt(event.block.timestamp),
  });
});

ACartridgeDiamond.AttestorSet.handler(async ({ event, context }) => {
  context.GameAttestor.set({
    id: event.params.gameId,
    signer: event.params.signer.toLowerCase(),
    updatedAt: BigInt(event.block.timestamp),
  });
});
