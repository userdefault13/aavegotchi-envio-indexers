import { AavegotchiDiamond } from "generated";
import { BIGINT_ONE, BIGINT_ZERO } from "../utils/constants";
import {
  getOrCreateAavegotchi,
  getOrCreateGotchiLending,
  getOrCreateUser,
  getStatisticEntity,
} from "../utils/helpers/aavegotchi";
import { toAddressId } from "../utils/ids";
import { blockRef } from "../utils/event";

function mapRevenueSplit(split: readonly bigint[]): {
  splitOwner: bigint;
  splitBorrower: bigint;
  splitOther: bigint;
} {
  return {
    splitOwner: BigInt(split[0] ?? 0),
    splitBorrower: BigInt(split[1] ?? 0),
    splitOther: BigInt(split[2] ?? 0),
  };
}

AavegotchiDiamond.GotchiLendingAdded.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const p = event.params;
  let lending = await getOrCreateGotchiLending(context, BigInt(p.listingId));
  const splits = mapRevenueSplit(p.revenueSplit);

  lending = {
    ...lending,
    upfrontCost: p.initialCost,
    rentDuration: p.period,
    period: p.period,
    lender: toAddressId(p.lender),
    originalOwner: toAddressId(p.originalOwner),
    ...splits,
    tokensToShare: p.revenueTokens.map(toAddressId),
    thirdPartyAddress: toAddressId(p.thirdParty),
    timeCreated: BigInt(event.block.timestamp),
    cancelled: false,
    completed: false,
    gotchiTokenId: p.tokenId,
    gotchi_id: p.tokenId.toString(),
    whitelistId: p.whitelistId !== BIGINT_ZERO ? p.whitelistId : undefined,
    whitelist_id:
      p.whitelistId !== BIGINT_ZERO ? p.whitelistId.toString() : undefined,
  };

  const gotchi = await getOrCreateAavegotchi(
    context,
    p.tokenId.toString(),
    block,
  );
  if (gotchi) {
    context.Aavegotchi.set({
      ...gotchi,
      locked: true,
      lending: BigInt(lending.id),
    });
    lending = {
      ...lending,
      gotchiKinship: gotchi.kinship,
      gotchiBRS: gotchi.withSetsRarityScore,
    };
  }

  context.GotchiLending.set(lending);
});

AavegotchiDiamond.GotchiLendingExecuted.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const p = event.params;
  let lending = await getOrCreateGotchiLending(context, BigInt(p.listingId));
  const splits = mapRevenueSplit(p.revenueSplit);

  lending = {
    ...lending,
    upfrontCost: p.initialCost,
    rentDuration: p.period,
    period: p.period,
    lender: toAddressId(p.lender),
    originalOwner: toAddressId(p.originalOwner),
    ...splits,
    tokensToShare: p.revenueTokens.map(toAddressId),
    thirdPartyAddress: toAddressId(p.thirdParty),
    gotchiTokenId: p.tokenId,
    gotchi_id: p.tokenId.toString(),
    timeAgreed: p.timeAgreed,
    borrower: toAddressId(p.borrower),
    cancelled: false,
    completed: false,
    whitelistId: p.whitelistId !== BIGINT_ZERO ? p.whitelistId : undefined,
    whitelist_id:
      p.whitelistId !== BIGINT_ZERO ? p.whitelistId.toString() : undefined,
  };

  const gotchi = await getOrCreateAavegotchi(
    context,
    lending.gotchi_id,
    block,
  );
  if (gotchi && lending.lender) {
    const lender = await getOrCreateUser(context, lending.lender);
    context.Aavegotchi.set({
      ...gotchi,
      originalOwner_id: lender.id,
      locked: true,
    });
    lending = {
      ...lending,
      gotchiKinship: gotchi.kinship,
      gotchiBRS: gotchi.withSetsRarityScore,
    };

    context.User.set({
      ...lender,
      gotchisLentOut: [...lender.gotchisLentOut, lending.gotchiTokenId],
    });
  }

  if (lending.borrower) {
    const borrower = await getOrCreateUser(context, lending.borrower);
    context.User.set({
      ...borrower,
      gotchisBorrowed: [...borrower.gotchisBorrowed, lending.gotchiTokenId],
    });
  }

  const stats = await getStatisticEntity(context);
  context.Statistic.set({
    ...stats,
    aavegotchisBorrowed: stats.aavegotchisBorrowed + BIGINT_ONE,
  });
  context.GotchiLending.set(lending);
});

AavegotchiDiamond.GotchiLendingCancelled.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const t = event.params._0;
  const listingId = t[0];
  const lender = t[1];
  const tokenId = t[2];
  const initialCost = t[3];
  const period = t[4];
  const revenueSplit = t[5];
  const originalOwner = t[6];
  const thirdParty = t[7];
  const whitelistId = t[8];
  const revenueTokens = t[9];
  const splits = mapRevenueSplit(revenueSplit);

  let lending = await getOrCreateGotchiLending(context, listingId);
  lending = {
    ...lending,
    upfrontCost: initialCost,
    rentDuration: period,
    period,
    lender: toAddressId(lender),
    originalOwner: toAddressId(originalOwner),
    ...splits,
    tokensToShare: revenueTokens.map(toAddressId),
    thirdPartyAddress: toAddressId(thirdParty),
    gotchiTokenId: tokenId,
    gotchi_id: tokenId.toString(),
    cancelled: true,
    completed: false,
    timeEnded: BigInt(event.block.timestamp),
    whitelistId: whitelistId !== BIGINT_ZERO ? whitelistId : undefined,
    whitelist_id:
      whitelistId !== BIGINT_ZERO ? whitelistId.toString() : undefined,
  };

  const gotchi = await getOrCreateAavegotchi(
    context,
    tokenId.toString(),
    block,
  );
  if (gotchi) {
    context.Aavegotchi.set({
      ...gotchi,
      locked: false,
      lending: undefined,
    });
    lending = {
      ...lending,
      gotchiKinship: gotchi.kinship,
      gotchiBRS: gotchi.withSetsRarityScore,
    };
  }

  context.GotchiLending.set(lending);
});

AavegotchiDiamond.GotchiLendingClaimed.handler(async ({ event, context }) => {
  const p = event.params;
  let lending = await getOrCreateGotchiLending(context, BigInt(p.listingId));
  const splits = mapRevenueSplit(p.revenueSplit);

  lending = {
    ...lending,
    upfrontCost: p.initialCost,
    rentDuration: p.period,
    period: p.period,
    lender: toAddressId(p.lender),
    originalOwner: toAddressId(p.originalOwner),
    ...splits,
    tokensToShare: p.revenueTokens.map(toAddressId),
    thirdPartyAddress: toAddressId(p.thirdParty),
    lastClaimed: p.timeClaimed,
    gotchiTokenId: p.tokenId,
    gotchi_id: p.tokenId.toString(),
    borrower: toAddressId(p.borrower),
    cancelled: false,
    completed: false,
    whitelistId: p.whitelistId !== BIGINT_ZERO ? p.whitelistId : undefined,
    whitelist_id:
      p.whitelistId !== BIGINT_ZERO ? p.whitelistId.toString() : undefined,
  };

  for (let i = 0; i < p.revenueTokens.length; i++) {
    const token = toAddressId(p.revenueTokens[i]);
    const claimId = `${lending.id}_${token}`;
    const existing = await context.ClaimedToken.get(claimId);
    const amount = (existing?.amount ?? BIGINT_ZERO) + (p.amounts[i] ?? BIGINT_ZERO);
    context.ClaimedToken.set({
      id: claimId,
      lending_id: lending.id,
      token,
      amount,
    });
  }

  context.GotchiLending.set(lending);
});

AavegotchiDiamond.GotchiLendingEnded.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const p = event.params;
  let lending = await getOrCreateGotchiLending(context, BigInt(p.listingId));
  const splits = mapRevenueSplit(p.revenueSplit);

  lending = {
    ...lending,
    upfrontCost: p.initialCost,
    rentDuration: p.period,
    period: p.period,
    lender: toAddressId(p.lender),
    originalOwner: toAddressId(p.originalOwner),
    ...splits,
    tokensToShare: p.revenueTokens.map(toAddressId),
    thirdPartyAddress: toAddressId(p.thirdParty),
    gotchiTokenId: p.tokenId,
    gotchi_id: p.tokenId.toString(),
    completed: true,
    timeEnded: BigInt(event.block.timestamp),
    whitelistId: p.whitelistId !== BIGINT_ZERO ? p.whitelistId : undefined,
    whitelist_id:
      p.whitelistId !== BIGINT_ZERO ? p.whitelistId.toString() : undefined,
  };

  const gotchi = await getOrCreateAavegotchi(
    context,
    lending.gotchiTokenId.toString(),
    block,
  );
  if (gotchi) {
    lending = {
      ...lending,
      gotchiKinship: gotchi.kinship,
      gotchiBRS: gotchi.withSetsRarityScore,
    };
  }

  if (lending.lender) {
    const owner = await getOrCreateUser(context, lending.lender);
    context.User.set({
      ...owner,
      gotchisLentOut: owner.gotchisLentOut.filter(
        (id) => id !== lending.gotchiTokenId,
      ),
    });
  }

  if (lending.borrower) {
    const borrower = await getOrCreateUser(context, lending.borrower);
    context.User.set({
      ...borrower,
      gotchisBorrowed: borrower.gotchisBorrowed.filter(
        (id) => id !== lending.gotchiTokenId,
      ),
    });
  }

  context.GotchiLending.set(lending);
});

AavegotchiDiamond.GotchiLendingCancel.handler(async ({ event, context }) => {
  const lending = await getOrCreateGotchiLending(
    context,
    BigInt(event.params.listingId),
  );
  if (!lending.lender) return;
  context.GotchiLending.set({ ...lending, cancelled: true });
});
