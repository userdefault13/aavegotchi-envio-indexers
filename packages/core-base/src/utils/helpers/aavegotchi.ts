import type { HandlerContext } from "generated";
import {
  BIGINT_ZERO,
  PORTAL_STATUS_BOUGHT,
  ZERO_ADDRESS,
} from "../constants";
import {
  fetchAavegotchi,
  fetchERC1155Listing,
  fetchERC721Listing,
  type AavegotchiOnChain,
  type ERC1155ListingOnChain,
  type ERC721ListingOnChain,
} from "../contractEffects";
import { itemMaxQuantityToRarity } from "../decimals";
import { toAddressId } from "../ids";
import type { BlockRef } from "../event";

export type Context = HandlerContext;

type AavegotchiEntity = NonNullable<
  Awaited<ReturnType<Context["Aavegotchi"]["get"]>>
>;
type PortalEntity = NonNullable<Awaited<ReturnType<Context["Portal"]["get"]>>>;
type UserEntity = NonNullable<Awaited<ReturnType<Context["User"]["get"]>>>;
type ERC721ListingEntity = NonNullable<
  Awaited<ReturnType<Context["ERC721Listing"]["get"]>>
>;
type ERC1155ListingEntity = NonNullable<
  Awaited<ReturnType<Context["ERC1155Listing"]["get"]>>
>;
type GotchiLendingEntity = NonNullable<
  Awaited<ReturnType<Context["GotchiLending"]["get"]>>
>;
type StatisticEntity = NonNullable<
  Awaited<ReturnType<Context["Statistic"]["get"]>>
>;
type ERC1155PurchaseEntity = NonNullable<
  Awaited<ReturnType<Context["ERC1155Purchase"]["get"]>>
>;

function defaultUser(id: string): UserEntity {
  return {
    id: toAddressId(id),
    gotchisLentOut: [],
    gotchisBorrowed: [],
    fakeGotchis: "{}",
    amountFakeGotchis: 0,
    currentUniqueFakeGotchisOwned: 0,
    currentUniqueFakeGotchisOwnedArray: "{}",
    totalUniqueFakeGotchisOwned: 0,
    totalUniqueFakeGotchisOwnedArray: "{}",
    totalFakeGotchisOwnedArray: "{}",
  };
}

function defaultAavegotchi(id: string, blockNumber: bigint): AavegotchiEntity {
  return {
    id,
    gotchiId: BigInt(id),
    createdAt: blockNumber,
    timesTraded: BIGINT_ZERO,
    historicalPrices: [],
    kinship: 50n,
    withSetsRarityScore: BIGINT_ZERO,
    equippedWearables: [],
    numericTraits: [50, 50, 50, 50, 0, 0],
    modifiedNumericTraits: [50, 50, 50, 50, 0, 0],
    baseAggression: 50,
    baseBrain: 50,
    baseEnergy: 50,
    baseSpookiness: 50,
    modifiedAggression: 50,
    modifiedBrain: 50,
    modifiedEnergy: 50,
    modifiedSpookiness: 50,
    eyeShape: 0,
    eyeColor: 0,
    name: "",
    nameLowerCase: "",
    randomNumber: BIGINT_ZERO,
    status: BIGINT_ZERO,
    collateral: ZERO_ADDRESS,
    escrow: ZERO_ADDRESS,
    stakedAmount: BIGINT_ZERO,
    minimumStake: BIGINT_ZERO,
    lastInteracted: BIGINT_ZERO,
    experience: BIGINT_ZERO,
    toNextLevel: BIGINT_ZERO,
    usedSkillPoints: BIGINT_ZERO,
    level: 1n,
    hauntId: BIGINT_ZERO,
    baseRarityScore: BIGINT_ZERO,
    modifiedRarityScore: BIGINT_ZERO,
    locked: false,
    activeListing: undefined,
    claimedAt: undefined,
    claimedAtPolygon: undefined,
    claimedTime: undefined,
    createdAtPolygon: undefined,
    equippedDelegatedWearables: undefined,
    equippedSetID: undefined,
    equippedSetName: undefined,
    lending: undefined,
    originalOwner_id: undefined,
    owner_id: undefined,
    possibleSets: undefined,
    withSetsNumericTraits: undefined,
  };
}

function defaultPortal(id: string): PortalEntity {
  return {
    id,
    timesTraded: BIGINT_ZERO,
    historicalPrices: [],
    hauntId: BIGINT_ZERO,
    status: "Bought",
    owner_id: ZERO_ADDRESS,
    activeListing: undefined,
    boughtAt: undefined,
    buyer_id: undefined,
    claimedAt: undefined,
    claimedAtPolygon: undefined,
    claimedTime: undefined,
    gotchi_id: undefined,
    gotchiId: undefined,
    openedAt: undefined,
  };
}

function defaultERC721Listing(id: string): ERC721ListingEntity {
  return {
    id,
    blockCreated: BIGINT_ZERO,
    timeCreated: BIGINT_ZERO,
    category: BIGINT_ZERO,
    erc721TokenAddress: ZERO_ADDRESS,
    tokenId: BIGINT_ZERO,
    seller: ZERO_ADDRESS,
    priceInWei: BIGINT_ZERO,
    cancelled: false,
    buyer: undefined,
    recipient: undefined,
    timePurchased: undefined,
    gotchi_id: undefined,
    portal_id: undefined,
    parcel_id: undefined,
    hauntId: undefined,
    kinship: undefined,
    experience: undefined,
    collateral: undefined,
    baseRarityScore: undefined,
    modifiedRarityScore: undefined,
    equippedWearables: undefined,
    fudBoost: undefined,
    fomoBoost: undefined,
    alphaBoost: undefined,
    kekBoost: undefined,
    district: undefined,
    coordinateX: undefined,
    coordinateY: undefined,
    size: undefined,
    parcelHash: undefined,
    nameLowerCase: undefined,
    amountEquippedWearables: undefined,
    soldBefore: undefined,
    claimedAt: undefined,
    claimedAtPolygon: undefined,
    nrgTrait: undefined,
    aggTrait: undefined,
    spkTrait: undefined,
    brnTrait: undefined,
    eysTrait: undefined,
    eycTrait: undefined,
    whitelist_id: undefined,
    priceUpdatedAt: undefined,
    fakeGotchi_name: undefined,
    fakeGotchi_publisher_id: undefined,
    fakeGotchi_publisherName: undefined,
    fakeGotchi_description: undefined,
    fakeGotchi_artist_id: undefined,
    fakeGotchi_artistName: undefined,
    fakeGotchi_editions: undefined,
  };
}

function defaultERC1155Listing(id: string): ERC1155ListingEntity {
  return {
    id,
    category: BIGINT_ZERO,
    erc1155TokenAddress: ZERO_ADDRESS,
    erc1155TypeId: BIGINT_ZERO,
    seller: ZERO_ADDRESS,
    priceInWei: BIGINT_ZERO,
    quantity: BIGINT_ZERO,
    cancelled: false,
    timeCreated: BIGINT_ZERO,
    timeLastPurchased: BIGINT_ZERO,
    sold: false,
    rarityLevel: undefined,
    rarityScoreModifier: undefined,
    nrgTraitModifier: undefined,
    aggTraitModifier: undefined,
    spkTraitModifier: undefined,
    brnTraitModifier: undefined,
    eysTraitModifier: undefined,
    eycTraitModifier: undefined,
    whitelist_id: undefined,
    priceUpdatedAt: undefined,
  };
}

export async function getOrCreateUser(
  context: Context,
  id: string,
): Promise<UserEntity> {
  const normalized = toAddressId(id);
  const existing = await context.User.get(normalized);
  if (existing) return existing;
  const user = defaultUser(normalized);
  context.User.set(user);
  return user;
}

export async function getOrCreatePortal(
  context: Context,
  id: string,
  createIfNotFound = true,
): Promise<PortalEntity | undefined> {
  const existing = await context.Portal.get(id);
  if (existing) return existing;
  if (!createIfNotFound) return undefined;
  const portal = defaultPortal(id);
  context.Portal.set(portal);
  return portal;
}

export async function getOrCreateAavegotchi(
  context: Context,
  id: string,
  block: BlockRef,
  createIfNotFound = true,
): Promise<AavegotchiEntity | undefined> {
  const existing = await context.Aavegotchi.get(id);
  if (existing) return existing;
  if (!createIfNotFound) return undefined;

  let gotchi = defaultAavegotchi(id, block.number);
  gotchi = await updateAavegotchiInfo(context, gotchi, BigInt(id), block);
  context.Aavegotchi.set(gotchi);
  return gotchi;
}

export async function getOrCreateERC721Listing(
  context: Context,
  id: string,
): Promise<ERC721ListingEntity> {
  const existing = await context.ERC721Listing.get(id);
  if (existing) return existing;
  const listing = defaultERC721Listing(id);
  context.ERC721Listing.set(listing);
  return listing;
}

export async function getOrCreateERC1155Listing(
  context: Context,
  id: string,
): Promise<ERC1155ListingEntity> {
  const existing = await context.ERC1155Listing.get(id);
  if (existing) return existing;
  const listing = defaultERC1155Listing(id);
  context.ERC1155Listing.set(listing);
  return listing;
}

export async function getOrCreateGotchiLending(
  context: Context,
  listingId: bigint,
): Promise<GotchiLendingEntity> {
  const id = listingId.toString();
  const existing = await context.GotchiLending.get(id);
  if (existing) return existing;
  const lending: GotchiLendingEntity = {
    id,
    rentDuration: BIGINT_ZERO,
    upfrontCost: BIGINT_ZERO,
    period: BIGINT_ZERO,
    gotchi_id: "",
    gotchiTokenId: BIGINT_ZERO,
    tokensToShare: [],
    whitelistMembers: [],
    cancelled: false,
    completed: false,
    channellingAllowed: false,
    gotchiBRS: undefined,
    gotchiKinship: undefined,
    splitOwner: undefined,
    splitBorrower: undefined,
    splitOther: undefined,
    whitelist_id: undefined,
    whitelistId: undefined,
    thirdPartyAddress: undefined,
    borrower: undefined,
    lender: undefined,
    originalOwner: undefined,
    lastClaimed: undefined,
    timeAgreed: undefined,
    timeCreated: undefined,
    timeEnded: undefined,
  };
  context.GotchiLending.set(lending);
  return lending;
}

export async function getStatisticEntity(
  context: Context,
): Promise<StatisticEntity> {
  const existing = await context.Statistic.get("0");
  if (existing) return existing;
  const stats: StatisticEntity = {
    id: "0",
    portalsBought: BIGINT_ZERO,
    portalsOpened: BIGINT_ZERO,
    aavegotchisClaimed: BIGINT_ZERO,
    aavegotchisSacrificed: BIGINT_ZERO,
    aavegotchisBorrowed: BIGINT_ZERO,
    erc721ActiveListingCount: BIGINT_ZERO,
    erc1155ActiveListingCount: BIGINT_ZERO,
    erc721TotalVolume: BIGINT_ZERO,
    erc1155TotalVolume: BIGINT_ZERO,
    totalWearablesVolume: BIGINT_ZERO,
    totalConsumablesVolume: BIGINT_ZERO,
    totalTicketsVolume: BIGINT_ZERO,
    burnedCards: 0,
    burnedNFTs: 0,
    totalNFTs: 0,
    totalFakeGotchiOwners: 0,
    totalFakeGotchiPieces: 0,
    totalNFTsArray: "{}",
    totalFakeGotchiOwnersArray: [],
    tokenIdCounter: 0,
    totalEditionsCirculating: 0,
    totalEditionsMinted: 0,
    totalEditionsCirculatingArray: "{}",
  };
  context.Statistic.set(stats);
  return stats;
}

export async function updateAavegotchiInfo(
  context: Context,
  gotchi: AavegotchiEntity,
  tokenId: bigint,
  block: BlockRef,
): Promise<AavegotchiEntity> {
  const info = await fetchAavegotchi(tokenId, block.number);
  if (!info) return gotchi;

  const owner = await getOrCreateUser(context, info.owner);
  context.User.set(owner);

  const updated: AavegotchiEntity = {
    ...gotchi,
    owner_id: owner.id,
    originalOwner_id: gotchi.originalOwner_id ?? owner.id,
    name: info.name,
    nameLowerCase: info.name.toLowerCase(),
    randomNumber: info.randomNumber,
    status: info.status,
    numericTraits: [...info.numericTraits],
    modifiedNumericTraits: [...info.modifiedNumericTraits],
    equippedWearables: [...info.equippedWearables],
    collateral: info.collateral,
    escrow: info.escrow,
    stakedAmount: info.stakedAmount,
    minimumStake: info.minimumStake,
    kinship: info.kinship,
    lastInteracted: info.lastInteracted,
    experience: info.experience,
    toNextLevel: info.toNextLevel,
    usedSkillPoints: info.usedSkillPoints,
    level: info.level,
    hauntId: info.hauntId,
    baseRarityScore: info.baseRarityScore,
    modifiedRarityScore: info.modifiedRarityScore,
    baseEnergy: info.numericTraits[0] ?? 0,
    baseAggression: info.numericTraits[1] ?? 0,
    baseSpookiness: info.numericTraits[2] ?? 0,
    baseBrain: info.numericTraits[3] ?? 0,
    eyeShape: info.numericTraits[4] ?? 0,
    eyeColor: info.numericTraits[5] ?? 0,
    modifiedEnergy: info.modifiedNumericTraits[0] ?? 0,
    modifiedAggression: info.modifiedNumericTraits[1] ?? 0,
    modifiedSpookiness: info.modifiedNumericTraits[2] ?? 0,
    modifiedBrain: info.modifiedNumericTraits[3] ?? 0,
    withSetsRarityScore:
      gotchi.withSetsRarityScore && gotchi.withSetsRarityScore > 0n
        ? gotchi.withSetsRarityScore
        : info.modifiedRarityScore,
    withSetsNumericTraits:
      gotchi.withSetsNumericTraits ?? [...info.modifiedNumericTraits],
    locked: info.locked,
  };

  if (updated.lending) {
    const lending = await getOrCreateGotchiLending(context, updated.lending);
    context.GotchiLending.set({
      ...lending,
      gotchiKinship: updated.kinship,
      gotchiBRS: updated.withSetsRarityScore,
    });
  }

  if (updated.activeListing) {
    const listing = await context.ERC721Listing.get(
      updated.activeListing.toString(),
    );
    if (listing) {
      context.ERC721Listing.set({
        ...listing,
        kinship: updated.kinship,
        experience: updated.experience,
        nameLowerCase: updated.nameLowerCase,
        ...(updated.withSetsNumericTraits?.length === 6
          ? {
              nrgTrait: BigInt(updated.withSetsNumericTraits[0]),
              aggTrait: BigInt(updated.withSetsNumericTraits[1]),
              spkTrait: BigInt(updated.withSetsNumericTraits[2]),
              brnTrait: BigInt(updated.withSetsNumericTraits[3]),
              eysTrait: BigInt(updated.withSetsNumericTraits[4]),
              eycTrait: BigInt(updated.withSetsNumericTraits[5]),
            }
          : {}),
      });
    }
  }

  return updated;
}

export async function updateERC721ListingInfo(
  context: Context,
  listing: ERC721ListingEntity,
  listingId: bigint,
  block: BlockRef,
): Promise<ERC721ListingEntity> {
  const info = await fetchERC721Listing(listingId, block.number);
  if (!info) return listing;

  let updated = {
    ...listing,
    category: info.category,
    erc721TokenAddress: info.erc721TokenAddress,
    tokenId: info.erc721TokenId,
    seller: info.seller,
    timeCreated: info.timeCreated,
    timePurchased: info.timePurchased,
    priceInWei: info.priceInWei,
    cancelled: info.cancelled,
    blockCreated:
      listing.blockCreated === BIGINT_ZERO ? block.number : listing.blockCreated,
  };

  if (updated.category <= 2n) {
    const portal = await getOrCreatePortal(
      context,
      info.erc721TokenId.toString(),
      false,
    );
    if (portal) {
      updated.hauntId = portal.hauntId;
      updated.soldBefore = (portal.historicalPrices?.length ?? 0) > 0;
    }
  } else if (updated.category === 3n) {
    const gotchi = await getOrCreateAavegotchi(
      context,
      info.erc721TokenId.toString(),
      block,
      false,
    );
    if (gotchi) {
      updated.hauntId = gotchi.hauntId;
      updated.kinship = gotchi.kinship;
      updated.experience = gotchi.experience;
      updated.baseRarityScore = gotchi.baseRarityScore;
      updated.modifiedRarityScore = gotchi.modifiedRarityScore;
      updated.equippedWearables = gotchi.equippedWearables;
      updated.amountEquippedWearables = gotchi.equippedWearables.filter(
        (w) => w !== 210 && w !== 0,
      ).length;
      updated.soldBefore = (gotchi.historicalPrices?.length ?? 0) > 0;
      updated.claimedAt = gotchi.claimedAt;
      updated.claimedAtPolygon = gotchi.claimedAtPolygon;
    }
  }

  return updated as ERC721ListingEntity;
}

export async function updateERC1155ListingInfo(
  context: Context,
  listing: ERC1155ListingEntity,
  listingId: bigint,
  block: BlockRef,
): Promise<ERC1155ListingEntity> {
  const info = await fetchERC1155Listing(listingId, block.number);
  if (!info) return listing;

  let updated = {
    ...listing,
    category: info.category,
    erc1155TokenAddress: info.erc1155TokenAddress,
    erc1155TypeId: info.erc1155TypeId,
    seller: info.seller,
    timeCreated: info.timeCreated,
    timeLastPurchased: info.timeLastPurchased,
    priceInWei: info.priceInWei,
    sold: info.sold,
    cancelled: info.cancelled,
    quantity: info.quantity,
  };

  if (updated.category === 3n) {
    updated.rarityLevel = updated.erc1155TypeId;
  } else if (updated.category < 3n) {
    const itemType = await context.ItemType.get(
      info.erc1155TypeId.toString(),
    );
    if (itemType) {
      updated.rarityLevel = itemMaxQuantityToRarity(itemType.maxQuantity);
      updated.rarityScoreModifier = BigInt(itemType.rarityScoreModifier);
      if (itemType.traitModifiers) {
        updated.nrgTraitModifier = BigInt(itemType.traitModifiers[0] ?? 0);
        updated.aggTraitModifier = BigInt(itemType.traitModifiers[1] ?? 0);
        updated.spkTraitModifier = BigInt(itemType.traitModifiers[2] ?? 0);
        updated.brnTraitModifier = BigInt(itemType.traitModifiers[3] ?? 0);
        updated.eysTraitModifier = BigInt(itemType.traitModifiers[4] ?? 0);
        updated.eycTraitModifier = BigInt(itemType.traitModifiers[5] ?? 0);
      }
    }
  }

  return updated as ERC1155ListingEntity;
}

export async function getOrCreateERC1155Purchase(
  context: Context,
  id: string,
): Promise<ERC1155PurchaseEntity> {
  const existing = await context.ERC1155Purchase.get(id);
  if (existing) return existing;
  const purchase: ERC1155PurchaseEntity = {
    id,
    listingID: BIGINT_ZERO,
    category: BIGINT_ZERO,
    erc1155TokenAddress: ZERO_ADDRESS,
    erc1155TypeId: BIGINT_ZERO,
    seller: ZERO_ADDRESS,
    buyer: ZERO_ADDRESS,
    priceInWei: BIGINT_ZERO,
    quantity: BIGINT_ZERO,
    timeLastPurchased: BIGINT_ZERO,
    recipient: undefined,
    rarityLevel: undefined,
  };
  context.ERC1155Purchase.set(purchase);
  return purchase;
}

export async function clearActiveListingForERC721Category(
  context: Context,
  listing: ERC721ListingEntity,
  block: BlockRef,
): Promise<void> {
  if (listing.category < 3n) {
    const portal = await getOrCreatePortal(
      context,
      listing.tokenId.toString(),
    );
    if (portal) {
      context.Portal.set({ ...portal, activeListing: undefined });
    }
  } else if (listing.category === 3n) {
    const gotchi = await getOrCreateAavegotchi(
      context,
      listing.tokenId.toString(),
      block,
    );
    if (gotchi) {
      context.Aavegotchi.set({
        ...gotchi,
        activeListing: undefined,
        locked: false,
      });
    }
  } else if (listing.category === 4n) {
    const parcel = await context.Parcel.get(listing.tokenId.toString());
    if (parcel) {
      context.Parcel.set({ ...parcel, activeListing: undefined });
    }
  }
}

export {
  type AavegotchiEntity,
  type ERC721ListingEntity,
  type ERC1155ListingEntity,
  type GotchiLendingEntity,
  type PortalEntity,
  type UserEntity,
  PORTAL_STATUS_BOUGHT,
};
