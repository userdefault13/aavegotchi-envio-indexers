import type { HandlerContext } from "generated";
import type { Gotchi } from "generated";

type GotchiContext = Pick<HandlerContext, "Gotchi">;

function emptyGotchi(id: string): Gotchi {
  return {
    id,
    lastChanneledAlchemica: undefined,
  };
}

export async function getOrCreateGotchi(
  context: GotchiContext,
  gotchiId: bigint,
): Promise<Gotchi> {
  const id = gotchiId.toString();
  const existing = await context.Gotchi.get(id);

  if (existing) {
    return existing;
  }

  const gotchi = emptyGotchi(id);
  context.Gotchi.set(gotchi);
  return gotchi;
}
