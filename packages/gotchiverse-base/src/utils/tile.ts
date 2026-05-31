import type { HandlerContext } from "generated";
import type { Tile, TileType } from "generated";
import { BIGINT_ZERO } from "./constants";
import { getTileTypeEffect } from "./contractEffects";
import { tileInstanceId } from "./ids";

type TileContext = Pick<HandlerContext, "Tile" | "TileType" | "effect">;

export async function getOrCreateTileType(
  context: TileContext,
  tileId: bigint,
  blockNumber: bigint,
): Promise<TileType> {
  const id = tileId.toString();
  const existing = await context.TileType.get(id);

  if (existing) {
    return existing;
  }

  const onChain = await context.effect(getTileTypeEffect, {
    tileId,
    blockNumber,
  });

  const tileType: TileType = onChain
    ? {
        id,
        alchemicaCost: onChain.alchemicaCost,
        craftTime: onChain.craftTime,
        deprecated: onChain.deprecated,
        deprecatedAt: BIGINT_ZERO,
        height: onChain.height,
        width: onChain.width,
        name: onChain.name,
        tileType: onChain.tileType,
        amount: BIGINT_ZERO,
        uri: undefined,
      }
    : {
        id,
        alchemicaCost: [],
        craftTime: BIGINT_ZERO,
        deprecated: false,
        deprecatedAt: BIGINT_ZERO,
        height: 0,
        width: 0,
        name: "",
        tileType: 0,
        amount: BIGINT_ZERO,
        uri: undefined,
      };

  context.TileType.set(tileType);
  return tileType;
}

export async function getOrCreateTile(
  context: TileContext,
  parcelId: string,
  tileType: TileType,
  x: bigint,
  y: bigint,
): Promise<Tile> {
  const id = tileInstanceId(parcelId, tileType.id, x, y);
  const existing = await context.Tile.get(id);

  if (existing) {
    return existing;
  }

  const tile: Tile = {
    id,
    parcel: parcelId,
    typeId: tileType.id,
    x,
    y,
    equipped: false,
    owner: undefined,
  };

  context.Tile.set(tile);
  return tile;
}
