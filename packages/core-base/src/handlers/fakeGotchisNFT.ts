import { FAKEGotchisNFTDiamond } from "generated";
import {
  METADATA_STATUS_APPROVED,
  METADATA_STATUS_PAUSED,
} from "../utils/constants";
import { blockRef } from "../utils/event";
import { getOrCreateUser, getStatisticEntity } from "../utils/helpers/aavegotchi";
import {
  addToOwnersIfNotExists,
  removeFromOwnersIfExistsAndBalanceNotZero,
  updateAccountStatsFrom,
  updateAccountStatsTo,
  updateTotalStatsBurn,
  updateTotalStatsMint,
} from "../utils/helpers/fakeGotchiAccount";
import {
  fetchFakeGotchiNFTToken,
  getFakeGotchiHolder,
  getOrCreateFakeGotchiStatistic,
  isBurn,
  isMint,
  isTransfer,
} from "../utils/helpers/fakeGotchis";
import { toAddressId } from "../utils/ids";

FAKEGotchisNFTDiamond.MetadataActionLog.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const metadataId = event.params.id.toString();
  const existing = await context.MetadataActionLog.get(metadataId);
  const meta = event.params.metaData;

  const artist = await getOrCreateUser(context, meta[5]);
  const publisher = await getOrCreateUser(context, meta[0]);
  context.User.set(artist);
  context.User.set(publisher);

  const updatedMetadata = {
    id: metadataId,
    emitter_id: toAddressId(event.srcAddress),
    timestamp: block.timestamp,
    flagCount: Number(meta[3]),
    likeCount: Number(meta[4]),
    minted: existing?.minted ?? false,
    artist_id: artist.id,
    artistName: meta[12],
    createdAt: BigInt(meta[6]),
    description: meta[10],
    externalLink: meta[11],
    fileHash: meta[14],
    name: meta[9],
    publisher_id: publisher.id,
    publisherName: meta[13],
    royalty: meta[1].map(Number),
    status: Number(meta[7]),
    editions: Number(meta[2]),
    fileType: meta[15],
    thumbnailHash: meta[16],
    thumbnailType: meta[17],
    sender_id: publisher.id,
  };
  context.MetadataActionLog.set(updatedMetadata);

  let nftStats = await getOrCreateFakeGotchiStatistic(context, metadataId);

  if (
    updatedMetadata.status === METADATA_STATUS_APPROVED &&
    !updatedMetadata.minted
  ) {
    let stats = await getStatisticEntity(context);
    stats = {
      ...stats,
      totalFakeGotchiPieces: (stats.totalFakeGotchiPieces ?? 0) + 1,
    };

    const startId = stats.tokenIdCounter ?? 0;
    stats = { ...stats, tokenIdCounter: startId + (updatedMetadata.editions ?? 0) };

    const mintedTokenIds: bigint[] = [];
    for (let i = 0; i < (updatedMetadata.editions ?? 0); i++) {
      const tokenId = startId + i;
      mintedTokenIds.push(BigInt(tokenId));
      let token = await fetchFakeGotchiNFTToken(
        context,
        event.srcAddress,
        BigInt(tokenId),
      );
      token = {
        ...token,
        metadata_id: metadataId,
        owner_id: publisher.id,
        contract: toAddressId(event.srcAddress),
        artist_id: artist.id,
        artistName: meta[12],
        description: meta[10],
        externalLink: meta[11],
        fileHash: meta[14],
        name: meta[9],
        publisher_id: publisher.id,
        publisherName: meta[13],
        editions: Number(meta[2]),
        thumbnailHash: meta[16],
        thumbnailType: meta[17],
      };
      context.FakeGotchiNFTToken.set(token);
    }

    nftStats = {
      ...nftStats,
      totalSupply: (nftStats.totalSupply ?? 0) + mintedTokenIds.length,
      tokenIds: [...nftStats.tokenIds, ...mintedTokenIds],
    };

    context.MetadataActionLog.set({ ...updatedMetadata, minted: true });
    context.FakeGotchiStatistic.set(nftStats);
    context.Statistic.set(stats);
  } else {
    context.FakeGotchiStatistic.set(nftStats);
  }
});

FAKEGotchisNFTDiamond.Transfer.handler(async ({ event, context }) => {
  const block = blockRef(event);
  const mint = isMint(event.params._from);
  const burn = isBurn(event.params._to);
  const transfer = isTransfer(event.params._from, event.params._to);

  let from = await getOrCreateUser(context, event.params._from);
  let to = await getOrCreateUser(context, event.params._to);
  context.User.set(from);
  context.User.set(to);

  let token = await fetchFakeGotchiNFTToken(
    context,
    event.srcAddress,
    event.params._tokenId,
  );
  token = { ...token, owner_id: to.id };
  context.FakeGotchiNFTToken.set(token);

  context.FakeGotchiNFTTransfer.set({
    id: `${event.block.number}-${event.logIndex}`,
    transaction: `${event.block.number}-${event.logIndex}`,
    timestamp: block.timestamp,
    token_id: token.id,
    from_id: from.id,
    to_id: to.id,
  });

  if (!token.metadata_id) return;
  const metadata = await context.MetadataActionLog.getOrThrow(token.metadata_id);
  let nftStats = await getOrCreateFakeGotchiStatistic(context, metadata.id);
  let stats = await getStatisticEntity(context);

  if (mint || transfer) {
    to = updateAccountStatsTo(to, metadata.id);
    to = { ...to, amountFakeGotchis: to.amountFakeGotchis + 1 };

    const receiver = await getFakeGotchiHolder(
      context,
      event.params._to,
      metadata.id,
    );
    const receiverAmount = (receiver.amount ?? 0) + 1;
    context.FakeGotchiHolder.set({ ...receiver, amount: receiverAmount });
    if (receiverAmount === 1) {
      nftStats = {
        ...nftStats,
        amountHolder: (nftStats.amountHolder ?? 0) + 1,
      };
    }
    stats = addToOwnersIfNotExists(stats, event.params._to);
  }

  if (burn || transfer) {
    from = updateAccountStatsFrom(from, metadata.id);
    from = { ...from, amountFakeGotchis: from.amountFakeGotchis - 1 };

    const sender = await getFakeGotchiHolder(
      context,
      event.params._from,
      metadata.id,
    );
    const senderAmount = Math.max((sender.amount ?? 0) - 1, 0);
    context.FakeGotchiHolder.set({ ...sender, amount: senderAmount });
    if (senderAmount === 0 && (sender.amount ?? 0) > 0) {
      nftStats = {
        ...nftStats,
        amountHolder: Math.max((nftStats.amountHolder ?? 0) - 1, 0),
      };
    }
    stats = removeFromOwnersIfExistsAndBalanceNotZero(
      stats,
      event.params._from,
      from.amountFakeGotchis,
    );
  }

  if (mint) {
    stats = updateTotalStatsMint(stats, metadata.id);
    nftStats = {
      ...nftStats,
      totalSupply: (nftStats.totalSupply ?? 0) + 1,
      tokenIds: [...nftStats.tokenIds, event.params._tokenId],
    };
  }

  if (burn) {
    stats = updateTotalStatsBurn(stats, metadata.id);
    nftStats = {
      ...nftStats,
      burned: (nftStats.burned ?? 0) + 1,
      totalSupply: Math.max((nftStats.totalSupply ?? 0) - 1, 0),
      tokenIds: nftStats.tokenIds.filter((id) => id !== event.params._tokenId),
    };
    token = {
      ...token,
      editions: Math.max((token.editions ?? 0) - 1, 0),
    };
    context.FakeGotchiNFTToken.set(token);
    context.MetadataActionLog.set({
      ...metadata,
      editions: Math.max((metadata.editions ?? 0) - 1, 0),
    });
  }

  context.FakeGotchiStatistic.set(nftStats);
  context.Statistic.set(stats);
  context.User.set(to);
  context.User.set(from);
});

FAKEGotchisNFTDiamond.MetadataFlag.handler(async ({ event, context }) => {
  const metadata = await context.MetadataActionLog.get(event.params._id.toString());
  if (!metadata) return;
  const flagCount = (metadata.flagCount ?? 0) + 1;
  context.MetadataActionLog.set({
    ...metadata,
    flagCount,
    status:
      flagCount >= 10 ? METADATA_STATUS_PAUSED : metadata.status,
  });
});

FAKEGotchisNFTDiamond.MetadataLike.handler(async ({ event, context }) => {
  const metadata = await context.MetadataActionLog.get(event.params._id.toString());
  if (!metadata) return;
  context.MetadataActionLog.set({
    ...metadata,
    likeCount: (metadata.likeCount ?? 0) + 1,
  });
  const liker = await getOrCreateUser(context, event.params._likedBy);
  context.User.set(liker);
});
