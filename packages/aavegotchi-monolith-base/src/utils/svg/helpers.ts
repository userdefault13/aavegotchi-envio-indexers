import type { HandlerContext } from "generated";
import { BLOCK_SIDEVIEWS_ACTIVATED } from "./constants";
import { fetchAavegotchiSideSvgs, fetchAavegotchiSvg } from "./contractEffects";

type AavegotchiEntity = NonNullable<
  Awaited<ReturnType<HandlerContext["Aavegotchi"]["get"]>>
>;

/**
 * Refresh on-chain SVG strings on an Aavegotchi (port of aavegotchi-svg-subgraph).
 * Returns the same entity if RPC calls revert (e.g. unclaimed portal).
 */
export async function refreshAavegotchiSvgFromChain(
  gotchi: AavegotchiEntity,
  tokenId: bigint,
  blockNumber: bigint,
): Promise<AavegotchiEntity> {
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

  return gotchi;
}
