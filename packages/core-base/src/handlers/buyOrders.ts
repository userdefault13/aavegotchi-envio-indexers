import { AavegotchiDiamond } from "generated";
import { BIGINT_ZERO } from "../utils/constants";
import {
  getOrCreateERC1155BuyOrder,
  getOrCreateERC1155BuyOrderExecution,
  getOrCreateERC721BuyOrder,
} from "../utils/helpers/buyOrders";

AavegotchiDiamond.ERC721BuyOrderAdded.handler(async ({ event, context }) => {
  const entity = await getOrCreateERC721BuyOrder(
    context,
    event.params.buyOrderId.toString(),
  );
  context.ERC721BuyOrder.set({
    ...entity,
    buyer: event.params.buyer.toLowerCase(),
    category: event.params.category,
    createdAt: event.params.time,
    duration: event.params.duration,
    erc721TokenAddress: event.params.erc721TokenAddress.toLowerCase(),
    erc721TokenId: event.params.erc721TokenId,
    priceInWei: event.params.priceInWei,
    validationHash: event.params.validationHash,
  });
});

AavegotchiDiamond.ERC721BuyOrderExecuted.handler(async ({ event, context }) => {
  const entity = await getOrCreateERC721BuyOrder(
    context,
    event.params.buyOrderId.toString(),
  );
  context.ERC721BuyOrder.set({
    ...entity,
    seller: event.params.seller.toLowerCase(),
    erc721TokenAddress: event.params.erc721TokenAddress.toLowerCase(),
    erc721TokenId: event.params.erc721TokenId,
    priceInWei: event.params.priceInWei,
    buyer: event.params.buyer.toLowerCase(),
    executedAt: event.params.time,
    executedAtBlock: BigInt(event.block.number),
  });
});

AavegotchiDiamond.ERC721BuyOrderCanceled.handler(async ({ event, context }) => {
  const entity = await getOrCreateERC721BuyOrder(
    context,
    event.params.buyOrderId.toString(),
  );
  context.ERC721BuyOrder.set({
    ...entity,
    canceledAt: event.params.time,
    canceled: true,
  });
});

AavegotchiDiamond.ERC1155BuyOrderAdd.handler(async ({ event, context }) => {
  const entity = await getOrCreateERC1155BuyOrder(
    context,
    event.params.buyOrderId.toString(),
  );
  context.ERC1155BuyOrder.set({
    ...entity,
    buyer: event.params.buyer.toLowerCase(),
    category: event.params.category,
    createdAt: event.params.time,
    duration: event.params.duration,
    erc1155TokenAddress: event.params.erc1155TokenAddress.toLowerCase(),
    erc1155TokenId: event.params.erc1155TokenId,
    priceInWei: event.params.priceInWei,
    quantity: event.params.quantity,
    executedQuantity: BIGINT_ZERO,
  });
});

AavegotchiDiamond.ERC1155BuyOrderExecute.handler(async ({ event, context }) => {
  const buyOrderId = event.params.buyOrderId.toString();
  const entity = await getOrCreateERC1155BuyOrder(context, buyOrderId);
  const executedQuantity = entity.executedQuantity + event.params.quantity;
  const remainingQuantity = entity.quantity - event.params.quantity;

  context.ERC1155BuyOrder.set({
    ...entity,
    erc1155TokenAddress: event.params.erc1155TokenAddress.toLowerCase(),
    erc1155TokenId: event.params.erc1155TokenId,
    priceInWei: event.params.priceInWei,
    executedQuantity,
    quantity: remainingQuantity,
    lastExecutedAt: event.params.time,
    seller: event.params.seller.toLowerCase(),
    completedAt: remainingQuantity === 0n ? event.params.time : entity.completedAt,
  });

  const execution = await getOrCreateERC1155BuyOrderExecution(
    context,
    `${buyOrderId}-${event.block.number}-${event.logIndex}`,
  );
  context.ERC1155BuyOrderExecution.set({
    ...execution,
    buyOrder_id: buyOrderId,
    buyer: event.params.buyer.toLowerCase(),
    seller: event.params.seller.toLowerCase(),
    erc1155TokenAddress: event.params.erc1155TokenAddress.toLowerCase(),
    erc1155TokenId: event.params.erc1155TokenId,
    category: event.params.category,
    priceInWei: event.params.priceInWei,
    executedAt: event.params.time,
    executedQuantity: event.params.quantity,
  });
});

AavegotchiDiamond.ERC1155BuyOrderCancel.handler(async ({ event, context }) => {
  const entity = await getOrCreateERC1155BuyOrder(
    context,
    event.params.buyOrderId.toString(),
  );
  context.ERC1155BuyOrder.set({
    ...entity,
    canceledAt: event.params.time,
    canceled: true,
  });
});
