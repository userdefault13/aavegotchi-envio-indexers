import type { HandlerContext } from "generated";
import { fetchPortalSvgs } from "./contractEffects";

type PortalEntity = NonNullable<
  Awaited<ReturnType<HandlerContext["Portal"]["get"]>>
>;

export async function getOrCreatePortal(
  context: HandlerContext,
  portalId: string,
): Promise<PortalEntity> {
  const existing = await context.Portal.get(portalId);
  if (existing) return existing;
  const created = { id: portalId, svgs: [] as string[] };
  context.Portal.set(created);
  return created;
}

export async function refreshPortalSvgsFromChain(
  context: HandlerContext,
  portalId: bigint,
  blockNumber: bigint,
): Promise<void> {
  const id = portalId.toString();
  const portal = await getOrCreatePortal(context, id);
  const svgs = await fetchPortalSvgs(portalId, blockNumber);
  context.Portal.set({ ...portal, svgs });
}
