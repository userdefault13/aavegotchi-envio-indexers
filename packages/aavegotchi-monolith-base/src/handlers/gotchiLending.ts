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

function channellingAllowedFromPermissions(bitmap: bigint): boolean {
  const permissions = bitmap & 0xffn;
  const channelling = (bitmap >> 8n) & 0xffn;
  return !(permissions === 0n || channelling === 0n);
}

function uniqueBigints(values: bigint[], value: bigint): bigint[] {
  return values.includes(value) ? values : [...values, value];
}

function removeBigint(values: bigint[], value: bigint): bigint[] {
  return values.filter((v) => v !== value);
}

AavegotchiDiamond.GotchiLendingAdded.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const p = event.params._0;
  const listingId = p[0];
  const lender = p[1];
  const tokenId = p[2];
  const initialCost = p[3];
  const period = p[4];
  const revenueSplit = p[5];
  const originalOwner = p[6];
  const thirdParty = p[7];
  const whitelistId = p[8];
  const revenueTokens = p[9];
  const timeCreated = p[10];
  const permissions = p[11];
  let lending = await getOrCreateGotchiLending(context, listingId);
  const splits = mapRevenueSplit(revenueSplit);

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
    timeCreated,
    cancelled: false,
    completed: false,
    gotchiTokenId: tokenId,
    gotchi_id: tokenId.toString(),
    whitelistId: whitelistId !== BIGINT_ZERO ? whitelistId : undefined,
    whitelist_id:
      whitelistId !== BIGINT_ZERO ? whitelistId.toString() : undefined,
    channellingAllowed: channellingAllowedFromPermissions(permissions),
  };

  const gotchi = await getOrCreateAavegotchi(context, tokenId.toString(), block);
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
  const p = event.params._0;
  const listingId = p[0];
  const lender = p[1];
  const borrower = p[2];
  const tokenId = p[3];
  const initialCost = p[4];
  const period = p[5];
  const revenueSplit = p[6];
  const originalOwner = p[7];
  const thirdParty = p[8];
  const whitelistId = p[9];
  const revenueTokens = p[10];
  const timeAgreed = p[11];
  const permissions = p[12];
  let lending = await getOrCreateGotchiLending(context, listingId);
  const splits = mapRevenueSplit(revenueSplit);

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
    timeAgreed,
    borrower: toAddressId(borrower),
    cancelled: false,
    completed: false,
    whitelistId: whitelistId !== BIGINT_ZERO ? whitelistId : undefined,
    whitelist_id:
      whitelistId !== BIGINT_ZERO ? whitelistId.toString() : undefined,
    channellingAllowed: channellingAllowedFromPermissions(permissions),
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
      gotchisLentOut: uniqueBigints(lender.gotchisLentOut, lending.gotchiTokenId),
    });
  }

  if (lending.borrower) {
    const borrower = await getOrCreateUser(context, lending.borrower);
    context.User.set({
      ...borrower,
      gotchisBorrowed: uniqueBigints(
        borrower.gotchisBorrowed,
        lending.gotchiTokenId,
      ),
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
  const timeCanceled = t[10];
  const permissions = t[11];
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
    timeEnded: timeCanceled,
    whitelistId: whitelistId !== BIGINT_ZERO ? whitelistId : undefined,
    whitelist_id:
      whitelistId !== BIGINT_ZERO ? whitelistId.toString() : undefined,
    channellingAllowed: channellingAllowedFromPermissions(permissions),
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
  const p = event.params._0;
  const listingId = p[0];
  const lender = p[1];
  const borrower = p[2];
  const tokenId = p[3];
  const initialCost = p[4];
  const period = p[5];
  const revenueSplit = p[6];
  const originalOwner = p[7];
  const thirdParty = p[8];
  const whitelistId = p[9];
  const revenueTokens = p[10];
  const amounts = p[11];
  const timeClaimed = p[12];
  const permissions = p[13];
  let lending = await getOrCreateGotchiLending(context, listingId);
  const splits = mapRevenueSplit(revenueSplit);

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
    lastClaimed: timeClaimed,
    gotchiTokenId: tokenId,
    gotchi_id: tokenId.toString(),
    borrower: toAddressId(borrower),
    cancelled: false,
    completed: false,
    whitelistId: whitelistId !== BIGINT_ZERO ? whitelistId : undefined,
    whitelist_id:
      whitelistId !== BIGINT_ZERO ? whitelistId.toString() : undefined,
    channellingAllowed: channellingAllowedFromPermissions(permissions),
  };

  for (let i = 0; i < revenueTokens.length; i++) {
    const token = toAddressId(revenueTokens[i]);
    const claimId = `${lending.id}_${token}`;
    const existing = await context.ClaimedToken.get(claimId);
    const amount = (existing?.amount ?? BIGINT_ZERO) + (amounts[i] ?? BIGINT_ZERO);
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
  const p = event.params._0;
  const listingId = p[0];
  const lender = p[1];
  const borrower = p[2];
  const tokenId = p[3];
  const initialCost = p[4];
  const period = p[5];
  const revenueSplit = p[6];
  const originalOwner = p[7];
  const thirdParty = p[8];
  const whitelistId = p[9];
  const revenueTokens = p[10];
  const timeEnded = p[11];
  const permissions = p[12];
  let lending = await getOrCreateGotchiLending(context, listingId);
  const splits = mapRevenueSplit(revenueSplit);

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
    completed: true,
    cancelled: false,
    timeEnded,
    whitelistId: whitelistId !== BIGINT_ZERO ? whitelistId : undefined,
    whitelist_id:
      whitelistId !== BIGINT_ZERO ? whitelistId.toString() : undefined,
    channellingAllowed: channellingAllowedFromPermissions(permissions),
  };

  const gotchi = await getOrCreateAavegotchi(context, lending.gotchiTokenId.toString(), block);
  if (gotchi) {
    lending = {
      ...lending,
      gotchiKinship: gotchi.kinship,
      gotchiBRS: gotchi.withSetsRarityScore,
    };
    context.Aavegotchi.set({
      ...gotchi,
      lending: undefined,
      locked: false,
      owner_id: lending.originalOwner ?? gotchi.owner_id,
      originalOwner_id: lending.originalOwner ?? gotchi.originalOwner_id,
    });
  }

  if (lending.lender) {
    const owner = await getOrCreateUser(context, lending.lender);
    context.User.set({
      ...owner,
      gotchisLentOut: removeBigint(owner.gotchisLentOut, lending.gotchiTokenId),
    });
  }

  if (lending.borrower) {
    const borrower = await getOrCreateUser(context, lending.borrower);
    context.User.set({
      ...borrower,
      gotchisBorrowed: removeBigint(
        borrower.gotchisBorrowed,
        lending.gotchiTokenId,
      ),
    });
  }

  const stats = await getStatisticEntity(context);
  context.Statistic.set({
    ...stats,
    aavegotchisBorrowed:
      stats.aavegotchisBorrowed > BIGINT_ZERO
        ? stats.aavegotchisBorrowed - BIGINT_ONE
        : BIGINT_ZERO,
  });

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
