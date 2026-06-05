/**
 * Gotchus Alchemica + GHST ERC-20 balances (port of aavegotchi-alchemica-subgraph).
 */
import {
  AlchemicaAlpha,
  AlchemicaFomo,
  AlchemicaFud,
  AlchemicaGhst,
  AlchemicaGltr,
  AlchemicaKek,
} from "generated";
import { handleAlchemicaTransfer } from "../utils/alchemica/helpers";

type TransferHandler = Parameters<typeof AlchemicaFud.Transfer.handler>[0];

const onTransfer: TransferHandler = async ({ event, context }) => {
  await handleAlchemicaTransfer(
    context,
    event.srcAddress,
    event.params.from,
    event.params.to,
    event.params.value,
  );
};

AlchemicaFud.Transfer.handler(onTransfer);
AlchemicaFomo.Transfer.handler(onTransfer);
AlchemicaAlpha.Transfer.handler(onTransfer);
AlchemicaKek.Transfer.handler(onTransfer);
AlchemicaGltr.Transfer.handler(onTransfer);
AlchemicaGhst.Transfer.handler(onTransfer);
