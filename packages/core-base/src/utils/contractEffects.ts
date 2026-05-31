import { experimental_createEffect, S } from "envio";
import { Contract, JsonRpcProvider } from "ethers";
import aavegotchiDiamondAbi from "../../abis/AavegotchiDiamond.json";
import realmDiamondAbi from "../../abis/RealmDiamond.json";
import {
  CORE_DIAMOND_ADDRESS,
  REALM_DIAMOND_ADDRESS,
} from "./constants";

const provider = new JsonRpcProvider("https://mainnet.base.org");
const coreContract = new Contract(
  CORE_DIAMOND_ADDRESS,
  aavegotchiDiamondAbi,
  provider,
);
const realmContract = new Contract(
  REALM_DIAMOND_ADDRESS,
  realmDiamondAbi,
  provider,
);

const blockInput = {
  tokenId: S.bigint,
  blockNumber: S.bigint,
};

const listingInput = {
  listingId: S.bigint,
  blockNumber: S.bigint,
};

const aavegotchiOutput = S.schema({
  owner: S.string,
  name: S.string,
  randomNumber: S.bigint,
  status: S.bigint,
  numericTraits: S.array(S.int32),
  modifiedNumericTraits: S.array(S.int32),
  equippedWearables: S.array(S.int32),
  collateral: S.string,
  escrow: S.string,
  stakedAmount: S.bigint,
  minimumStake: S.bigint,
  kinship: S.bigint,
  lastInteracted: S.bigint,
  experience: S.bigint,
  toNextLevel: S.bigint,
  usedSkillPoints: S.bigint,
  level: S.bigint,
  hauntId: S.bigint,
  baseRarityScore: S.bigint,
  modifiedRarityScore: S.bigint,
  locked: S.boolean,
});

const erc721ListingOutput = S.schema({
  category: S.bigint,
  erc721TokenAddress: S.string,
  erc721TokenId: S.bigint,
  seller: S.string,
  timeCreated: S.bigint,
  timePurchased: S.bigint,
  priceInWei: S.bigint,
  cancelled: S.boolean,
});

const erc1155ListingOutput = S.schema({
  category: S.bigint,
  erc1155TokenAddress: S.string,
  erc1155TypeId: S.bigint,
  seller: S.string,
  timeCreated: S.bigint,
  timeLastPurchased: S.bigint,
  priceInWei: S.bigint,
  sold: S.boolean,
  cancelled: S.boolean,
  quantity: S.bigint,
});

const parcelOutput = S.schema({
  parcelId: S.string,
  coordinateX: S.bigint,
  coordinateY: S.bigint,
  district: S.bigint,
  parcelAddress: S.string,
  boost: S.array(S.bigint),
  size: S.bigint,
});

export type AavegotchiOnChain = S.Output<typeof aavegotchiOutput>;
export type ERC721ListingOnChain = S.Output<typeof erc721ListingOutput>;
export type ERC1155ListingOnChain = S.Output<typeof erc1155ListingOutput>;
export type ParcelOnChain = S.Output<typeof parcelOutput>;

function toBigInt(value: bigint | number | { toString(): string }): bigint {
  if (typeof value === "bigint") return value;
  return BigInt(value.toString());
}

export const getAavegotchiEffect = experimental_createEffect(
  {
    name: "getAavegotchi",
    input: blockInput,
    output: S.nullable(aavegotchiOutput),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = await coreContract.getAavegotchi.staticCall(input.tokenId, {
        blockTag: Number(input.blockNumber),
      });

      return {
        owner: String(result.owner).toLowerCase(),
        name: result.name,
        randomNumber: toBigInt(result.randomNumber),
        status: toBigInt(result.status),
        numericTraits: [...result.numericTraits].map(Number),
        modifiedNumericTraits: [...result.modifiedNumericTraits].map(Number),
        equippedWearables: [...result.equippedWearables].map(Number),
        collateral: String(result.collateral),
        escrow: String(result.escrow),
        stakedAmount: toBigInt(result.stakedAmount),
        minimumStake: toBigInt(result.minimumStake),
        kinship: toBigInt(result.kinship),
        lastInteracted: toBigInt(result.lastInteracted),
        experience: toBigInt(result.experience),
        toNextLevel: toBigInt(result.toNextLevel),
        usedSkillPoints: toBigInt(result.usedSkillPoints),
        level: toBigInt(result.level),
        hauntId: toBigInt(result.hauntId),
        baseRarityScore: toBigInt(result.baseRarityScore),
        modifiedRarityScore: toBigInt(result.modifiedRarityScore),
        locked: Boolean(result.locked),
      };
    } catch {
      return undefined;
    }
  },
);

export const getERC721ListingEffect = experimental_createEffect(
  {
    name: "getERC721Listing",
    input: listingInput,
    output: S.nullable(erc721ListingOutput),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = await coreContract.getERC721Listing.staticCall(
        input.listingId,
        { blockTag: Number(input.blockNumber) },
      );

      return {
        category: toBigInt(result.category),
        erc721TokenAddress: String(result.erc721TokenAddress),
        erc721TokenId: toBigInt(result.erc721TokenId),
        seller: String(result.seller).toLowerCase(),
        timeCreated: toBigInt(result.timeCreated),
        timePurchased: toBigInt(result.timePurchased),
        priceInWei: toBigInt(result.priceInWei),
        cancelled: Boolean(result.cancelled),
      };
    } catch {
      return undefined;
    }
  },
);

export const getERC1155ListingEffect = experimental_createEffect(
  {
    name: "getERC1155Listing",
    input: listingInput,
    output: S.nullable(erc1155ListingOutput),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = await coreContract.getERC1155Listing.staticCall(
        input.listingId,
        { blockTag: Number(input.blockNumber) },
      );

      return {
        category: toBigInt(result.category),
        erc1155TokenAddress: String(result.erc1155TokenAddress),
        erc1155TypeId: toBigInt(result.erc1155TypeId),
        seller: String(result.seller).toLowerCase(),
        timeCreated: toBigInt(result.timeCreated),
        timeLastPurchased: toBigInt(result.timeLastPurchased),
        priceInWei: toBigInt(result.priceInWei),
        sold: Boolean(result.sold),
        cancelled: Boolean(result.cancelled),
        quantity: toBigInt(result.quantity),
      };
    } catch {
      return undefined;
    }
  },
);

export const getParcelInfoEffect = experimental_createEffect(
  {
    name: "getParcelInfo",
    input: blockInput,
    output: S.nullable(parcelOutput),
    cache: true,
  },
  async ({ input }) => {
    try {
      const result = await realmContract.getParcelInfo.staticCall(
        input.tokenId,
        { blockTag: Number(input.blockNumber) },
      );

      return {
        parcelId: result.parcelId,
        coordinateX: toBigInt(result.coordinateX),
        coordinateY: toBigInt(result.coordinateY),
        district: toBigInt(result.district),
        parcelAddress: result.parcelAddress,
        boost: [...result.boost].map(toBigInt),
        size: toBigInt(result.size),
      };
    } catch {
      return undefined;
    }
  },
);
