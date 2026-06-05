import { FAKEGotchisCardDiamond } from "generated";
import { ZERO_ADDRESS } from "../utils/constants";
import { toAddressId } from "../utils/ids";
import { getOrCreateUser } from "../utils/helpers/aavegotchi";
import {
  fetchFakeGotchiCardBalance,
  toCardBalanceValue,
} from "../utils/helpers/fakeGotchis";

async function registerTransfer(
  context: Parameters<typeof fetchFakeGotchiCardBalance>[0],
  contract: string,
  from: string,
  to: string,
  id: bigint,
  value: bigint,
) {
  if (toAddressId(from) === ZERO_ADDRESS) {
    const totalSupply = await fetchFakeGotchiCardBalance(context, id, null, contract);
    const valueExact = totalSupply.valueExact + value;
    context.FakeGotchiCardBalance.set({
      ...totalSupply,
      valueExact,
      value: toCardBalanceValue(valueExact),
    });
  } else {
    const fromUser = await getOrCreateUser(context, from);
    context.User.set(fromUser);
    const balance = await fetchFakeGotchiCardBalance(
      context,
      id,
      fromUser.id,
      contract,
    );
    const valueExact = balance.valueExact - value;
    context.FakeGotchiCardBalance.set({
      ...balance,
      valueExact,
      value: toCardBalanceValue(valueExact),
    });
  }

  if (toAddressId(to) === ZERO_ADDRESS) {
    const totalSupply = await fetchFakeGotchiCardBalance(context, id, null, contract);
    const valueExact = totalSupply.valueExact - value;
    context.FakeGotchiCardBalance.set({
      ...totalSupply,
      valueExact,
      value: toCardBalanceValue(valueExact),
    });
  } else {
    const toUser = await getOrCreateUser(context, to);
    context.User.set(toUser);
    const balance = await fetchFakeGotchiCardBalance(
      context,
      id,
      toUser.id,
      contract,
    );
    const valueExact = balance.valueExact + value;
    context.FakeGotchiCardBalance.set({
      ...balance,
      valueExact,
      value: toCardBalanceValue(valueExact),
    });
  }
}

FAKEGotchisCardDiamond.NewSeriesStarted.handler(async ({ event, context }) => {
  context.Generation.set({
    id: event.params.id.toString(),
    amount: Number(event.params.amount),
  });
});

FAKEGotchisCardDiamond.TransferSingle.handler(async ({ event, context }) => {
  await registerTransfer(
    context,
    toAddressId(event.srcAddress),
    event.params._from,
    event.params._to,
    event.params._id,
    event.params._value,
  );
});

FAKEGotchisCardDiamond.TransferBatch.handler(async ({ event, context }) => {
  const ids = event.params._ids;
  const values = event.params._values;
  if (ids.length !== values.length) return;

  for (let i = 0; i < ids.length; i++) {
    await registerTransfer(
      context,
      toAddressId(event.srcAddress),
      event.params._from,
      event.params._to,
      ids[i],
      values[i],
    );
  }
});
