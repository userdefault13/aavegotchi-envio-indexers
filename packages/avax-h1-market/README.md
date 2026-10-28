# avax-h1-market: Aavegotchi H1 (Avalanche) Baazaar indexer

Envio HyperSync indexer for the **H1 diamond on Avalanche Fuji (43113)**:
`0x86979152855A431befb2e2CFa78961d72e22Acb3`, start block **60035008**
(diamond creation tx `0x175d02d8…f1ee71`, 2026-10-25).

It's a sibling package rather than another network in `core-base`, because core-base's
config and handlers are tied to Base-only contracts (Realm, Wearables, FAKE Gotchis,
Polygon seed) and a ~60-entity schema. This package indexes only what the
AarcadeGh-t Avalanche Baazaar needs.

| Event (diamond) | Effect |
|---|---|
| `ERC721ListingAdd` | `ERC721Listing` active, activity `listing_add`. **Note:** the event's last field is named `time` but carries the price (`ERC721MarketplaceFacet.sol:257`). |
| `ERC721ExecutedListing` / `ERC721ExecutedToRecipient` | listing `sold` + buyer/recipient, activity `listing_sale` |
| `ERC721ListingCancelled` / `ERC721ListingRemoved` | active listing → `cancelled` / `removed`, activity `listing_cancel` / `listing_removed` |
| `ERC721ListingPriceUpdate` | price, activity `listing_price` |
| `ERC721BuyOrderAdded` / `Executed` / `Canceled` | `ERC721BuyOrder` active → executed / cancelled, activity `offer_add` / `offer_accept` / `offer_cancel` |
| `Transfer` (ERC721) | `H1Token.owner`, activity `transfer` |

All entities carry `chainId`, and ids are `<chainId>-<onchainId>`. Addresses are lowercase.
Prices are raw USDC units (6 decimals; the diamond's `ghstContract` is Fuji USDC).

## Networks

* **43113 Fuji**: `config.yaml` (active).
* **43114 Avalanche mainnet**: `config.avalanche.yaml`, **disabled**. It holds a placeholder
  zero address and start block; set both when H1 is deployed on mainnet, then
  `npm run codegen:avalanche`. The handlers and schema are shared.

## Commands

```bash
npm install
npm run codegen      # envio codegen (Fuji)
npm run typecheck
npm test             # 8 pure-logic tests + 3 wired MockDb handler tests (needs codegen)
# Running it (NOT done in the PR): from the repo root
npm run docker:avax-h1   # postgres :5444, hasura :8091, indexer :9901
```

Optional `HYPERSYNC_URL_43113` points HyperSync at a local throttle/proxy
(handled by `scripts/ensure-hypersync-url.mjs`). The Base RPC injector ignores this chain.

## Serving through graphql-proxy

`services/graphql-proxy` exposes `/subgraphs/name/aavegotchi-avax-h1-market` and routes
it to `AVAX_H1_HASURA_URL` (e.g. `http://127.0.0.1:8091/v1/graphql`). Native Hasura
(PascalCase) queries pass through unchanged.

## Query shapes (Hasura)

```graphql
# Active listings (Baazaar grid)
query AvaxListings($chainId: Int!, $categories: [numeric!]) {
  ERC721Listing(
    where: { chainId: { _eq: $chainId }, status: { _eq: "active" }, category: { _in: $categories } }
    order_by: { timeCreated: desc }
    limit: 100
  ) { id listingId category erc721TokenAddress tokenId seller priceInWei timeCreated }
}

# Offers on a token (or by buyer: buyer: { _eq: $addr })
query AvaxOffers($chainId: Int!, $tokenId: numeric!) {
  ERC721BuyOrder(
    where: { chainId: { _eq: $chainId }, tokenId: { _eq: $tokenId }, status: { _eq: "active" } }
    order_by: { priceInWei: desc }
  ) { id buyOrderId buyer tokenId category priceInWei duration timeCreated }
}

# Activity tab
query AvaxActivity($chainId: Int!, $kinds: [String!]) {
  MarketActivity(
    where: { chainId: { _eq: $chainId }, kind: { _in: $kinds } }
    order_by: [{ timestamp: desc }, { logIndex: desc }]
    limit: 50
  ) { id kind listingId buyOrderId tokenId category from to priceInWei timestamp txHash }
}
```

## Footprint (estimate)

Fuji H1 volume is tiny (2 portals, 0 listings at the time of writing). Backfilling from block
60035008 via HyperSync takes seconds to minutes.

* RAM: indexer ≈ 250–400 MB, Postgres ≈ 100–200 MB, Hasura ≈ 150–300 MB → **~0.5–1 GB** for the stack.
* Disk: indexer image ≈ 1 GB (node:24-slim + envio + generated); postgres:17.5 / hasura v2.43
  are shared with the other stacks if already pulled. DB data < 50 MB for Fuji.
