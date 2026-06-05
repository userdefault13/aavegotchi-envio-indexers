import type { HandlerContext } from "generated";
import { BIGINT_ZERO } from "../constants";

export type Context = HandlerContext;

type ERC721BuyOrderEntity = NonNullable<
  Awaited<ReturnType<Context["ERC721BuyOrder"]["get"]>>
>;
type ERC1155BuyOrderEntity = NonNullable<
  Awaited<ReturnType<Context["ERC1155BuyOrder"]["get"]>>
>;
type ERC1155BuyOrderExecutionEntity = NonNullable<
  Awaited<ReturnType<Context["ERC1155BuyOrderExecution"]["get"]>>
>;

export async function getOrCreateERC721BuyOrder(
  context: Context,
  id: string,
): Promise<ERC721BuyOrderEntity> {
  const existing = await context.ERC721BuyOrder.get(id);
  if (existing) return existing;
  const entity: ERC721BuyOrderEntity = {
    id,
    buyer: "",
    category: BIGINT_ZERO,
    createdAt: BIGINT_ZERO,
    duration: BIGINT_ZERO,
    erc721TokenAddress: "",
    erc721TokenId: BIGINT_ZERO,
    priceInWei: BIGINT_ZERO,
    validationHash: "",
    canceled: false,
    canceledAt: undefined,
    executedAt: undefined,
    executedAtBlock: undefined,
    seller: undefined,
  };
  context.ERC721BuyOrder.set(entity);
  return entity;
}

export async function getOrCreateERC1155BuyOrder(
  context: Context,
  id: string,
): Promise<ERC1155BuyOrderEntity> {
  const existing = await context.ERC1155BuyOrder.get(id);
  if (existing) return existing;
  const entity: ERC1155BuyOrderEntity = {
    id,
    buyer: "",
    category: BIGINT_ZERO,
    createdAt: BIGINT_ZERO,
    duration: BIGINT_ZERO,
    erc1155TokenAddress: "",
    erc1155TokenId: BIGINT_ZERO,
    priceInWei: BIGINT_ZERO,
    quantity: BIGINT_ZERO,
    executedQuantity: BIGINT_ZERO,
    canceled: false,
    canceledAt: undefined,
    completedAt: undefined,
    lastExecutedAt: undefined,
    seller: undefined,
  };
  context.ERC1155BuyOrder.set(entity);
  return entity;
}

export async function getOrCreateERC1155BuyOrderExecution(
  context: Context,
  id: string,
): Promise<ERC1155BuyOrderExecutionEntity> {
  const existing = await context.ERC1155BuyOrderExecution.get(id);
  if (existing) return existing;
  const entity: ERC1155BuyOrderExecutionEntity = {
    id,
    buyOrder_id: "",
    buyer: "",
    category: BIGINT_ZERO,
    erc1155TokenAddress: "",
    erc1155TokenId: BIGINT_ZERO,
    executedQuantity: BIGINT_ZERO,
    priceInWei: BIGINT_ZERO,
    executedAt: undefined,
    seller: undefined,
  };
  context.ERC1155BuyOrderExecution.set(entity);
  return entity;
}
