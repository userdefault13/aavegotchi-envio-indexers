import { WearableDiamond } from "generated";
import { isZeroAddress, updateOwnership } from "../utils/helpers/diamond";
import { blockRef } from "../utils/event";

WearableDiamond.TransferSingle.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const id = event.params._id.toString();
  const amount = event.params._value;

  if (!isZeroAddress(event.params._from)) {
    await updateOwnership(
      context,
      id,
      event.params._from,
      0n - amount,
      block.timestamp,
    );
  }
  if (!isZeroAddress(event.params._to)) {
    await updateOwnership(
      context,
      id,
      event.params._to,
      amount,
      block.timestamp,
    );
  }
});

WearableDiamond.TransferBatch.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const ids = event.params._ids;
  const amounts = event.params._values;
  if (ids.length !== amounts.length) return;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i].toString();
    const amount = amounts[i];
    if (!isZeroAddress(event.params._from)) {
      await updateOwnership(
        context,
        id,
        event.params._from,
        0n - amount,
        block.timestamp,
      );
    }
    if (!isZeroAddress(event.params._to)) {
      await updateOwnership(
        context,
        id,
        event.params._to,
        amount,
        block.timestamp,
      );
    }
  }
});
