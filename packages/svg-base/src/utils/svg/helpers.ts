import type { HandlerContext } from "generated";
import { fetchAavegotchiSideSvgs, fetchAavegotchiSvg, fetchItemSvgs } from "./contractEffects";

type AavegotchiEntity = NonNullable<
  Awaited<ReturnType<HandlerContext["Aavegotchi"]["get"]>>
>;

/**
 * Re-reads an item's four SVG views (latest state) and stores them. `meta`
 * comes from AddItemType / UpdateItemType; UpdateSvg passes none and keeps
 * whatever the entity already has.
 */
export async function refreshItemTypeSvgs(
  context: HandlerContext,
  itemId: bigint,
  blockNumber: bigint,
  meta?: { svgId: bigint; name: string; category: number },
): Promise<void> {
  const existing = await context.ItemType.get(itemId.toString());
  if (!existing && !meta) return;
  const svgId = meta?.svgId ?? existing!.svgId;
  const [svg, left, right, back] = await fetchItemSvgs(svgId, blockNumber);
  context.ItemType.set({
    id: itemId.toString(),
    svgId,
    name: meta?.name ?? existing!.name,
    category: meta?.category ?? existing!.category,
    svg: svg ?? existing?.svg,
    left: left ?? existing?.left,
    right: right ?? existing?.right,
    back: back ?? existing?.back,
    updatedAtBlock: blockNumber,
  });
}

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

  const svg = await fetchAavegotchiSvg(tokenId, blockNumber);
  if (svg !== undefined) {
    return { ...gotchi, svg };
  }

  return undefined;
}
