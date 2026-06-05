import type { HandlerContext } from "generated";
import { BLOCK_SIDEVIEWS_ACTIVATED } from "./constants";
import { fetchAavegotchiSideSvgs, fetchAavegotchiSvg } from "./contractEffects";

type AavegotchiEntity = NonNullable<
  Awaited<ReturnType<HandlerContext["Aavegotchi"]["get"]>>
>;

export async function getOrCreateAavegotchi(
  context: HandlerContext,
  tokenId: string,
): Promise<AavegotchiEntity> {
  const existing = await context.Aavegotchi.get(tokenId);
  if (existing) return existing;
  const created = {
    id: tokenId,
    svg: "",
    left: undefined,
    right: undefined,
    back: undefined,
  };
  context.Aavegotchi.set(created);
  return created;
}

export async function refreshAavegotchiSvgFromChain(
  gotchi: AavegotchiEntity,
  tokenId: bigint,
  blockNumber: bigint,
): Promise<AavegotchiEntity | undefined> {
  if (blockNumber >= BLOCK_SIDEVIEWS_ACTIVATED) {
    const sideSvgs = await fetchAavegotchiSideSvgs(tokenId, blockNumber);
    if (sideSvgs && sideSvgs.length >= 4) {
      return {
        ...gotchi,
        svg: sideSvgs[0],
        left: sideSvgs[1],
        right: sideSvgs[2],
        back: sideSvgs[3],
      };
    }
  }

  const svg = await fetchAavegotchiSvg(tokenId, blockNumber);
  if (svg !== undefined) {
    return { ...gotchi, svg };
  }

  return undefined;
}
