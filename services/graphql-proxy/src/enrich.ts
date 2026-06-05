/** Batch-fetch related rows and attach subgraph-shaped nested objects. */

type HasuraQueryFn = (query: string) => Promise<Record<string, unknown>>;

function jsonStringList(ids: string[]): string {
  return `[${ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(", ")}]`;
}

export function queryWantsNestedField(query: string, fieldName: string): boolean {
  return new RegExp(`\\b${fieldName}\\s*\\{`).test(query);
}

export async function enrichAlchemicaErc20Balances(
  rows: unknown,
  query: string,
  queryHasura: HasuraQueryFn,
): Promise<unknown> {
  if (!Array.isArray(rows)) return rows;
  const list = rows as Record<string, unknown>[];
  if (list.length === 0) return list;

  let out = list.map((r) => ({ ...r }));
  const wantContract = queryWantsNestedField(query, "contract");
  const wantAccount = queryWantsNestedField(query, "account");

  if (wantContract) {
    const ids = [
      ...new Set(
        out.map((r) => r.contract_id).filter((id): id is string => typeof id === "string"),
      ),
    ];
    if (ids.length > 0) {
      const data = await queryHasura(`{
        ERC20Contract(where: { id: { _in: ${jsonStringList(ids)} } }) {
          id symbol name decimals
        }
      }`);
      const contracts = (data.ERC20Contract as Record<string, unknown>[]) ?? [];
      const byId = Object.fromEntries(contracts.map((c) => [String(c.id), c]));
      out = out.map((r) => ({
        ...r,
        contract: byId[String(r.contract_id)] ?? { id: r.contract_id },
      }));
    }
  }

  if (wantAccount) {
    const ids = [
      ...new Set(
        out.map((r) => r.account_id).filter((id): id is string => typeof id === "string"),
      ),
    ];
    if (ids.length > 0) {
      const data = await queryHasura(`{
        AlchemicaAccount(where: { id: { _in: ${jsonStringList(ids)} } }) {
          id
        }
      }`);
      const accounts = (data.AlchemicaAccount as Record<string, unknown>[]) ?? [];
      const byId = Object.fromEntries(accounts.map((a) => [String(a.id), a]));
      out = out.map((r) => ({
        ...r,
        account: byId[String(r.account_id)] ?? { id: r.account_id },
      }));
    }
  }

  return out;
}

export async function enrichSocketBridgeTransfers(
  rows: unknown,
  query: string,
  queryHasura: HasuraQueryFn,
): Promise<unknown> {
  if (!Array.isArray(rows) || !queryWantsNestedField(query, "tokenContract")) {
    return rows;
  }
  const list = rows as Record<string, unknown>[];
  const ids = [
    ...new Set(
      list.map((r) => r.tokenContract_id).filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (ids.length === 0) return list;

  const data = await queryHasura(`{
    TokenContract(where: { id: { _in: ${jsonStringList(ids)} } }) {
      id symbol tokenType
    }
  }`);
  const tokens = (data.TokenContract as Record<string, unknown>[]) ?? [];
  const byId = Object.fromEntries(tokens.map((t) => [String(t.id), t]));

  return list.map((r) => {
    const token = byId[String(r.tokenContract_id)];
    const nested = token
      ? {
          ...token,
          type: token.tokenType,
        }
      : { id: r.tokenContract_id };
    return { ...r, tokenContract: nested };
  });
}

export async function enrichStakingPoolPositions(
  rows: unknown,
  query: string,
  queryHasura: HasuraQueryFn,
): Promise<unknown> {
  if (!Array.isArray(rows)) return rows;
  const list = rows as Record<string, unknown>[];
  if (list.length === 0) return list;

  let out = list.map((r) => ({ ...r }));
  const wantUser = queryWantsNestedField(query, "user");
  const wantPool = queryWantsNestedField(query, "pool");

  if (wantPool) {
    const ids = [
      ...new Set(out.map((r) => r.pool_id).filter((id): id is string => typeof id === "string")),
    ];
    if (ids.length > 0) {
      const data = await queryHasura(`{
        StakingPool(where: { id: { _in: ${jsonStringList(ids)} } }) {
          id name balance lpToken
        }
      }`);
      const pools = (data.StakingPool as Record<string, unknown>[]) ?? [];
      const byId = Object.fromEntries(pools.map((p) => [String(p.id), p]));
      out = out.map((r) => ({
        ...r,
        pool: byId[String(r.pool_id)] ?? { id: r.pool_id },
      }));
    }
  }

  if (wantUser) {
    const ids = [
      ...new Set(out.map((r) => r.user_id).filter((id): id is string => typeof id === "string")),
    ];
    if (ids.length > 0) {
      const data = await queryHasura(`{
        StakingUser(where: { id: { _in: ${jsonStringList(ids)} } }) {
          id gltrHarvested
        }
      }`);
      const users = (data.StakingUser as Record<string, unknown>[]) ?? [];
      const byId = Object.fromEntries(users.map((u) => [String(u.id), u]));
      out = out.map((r) => ({
        ...r,
        user: byId[String(r.user_id)] ?? { id: r.user_id },
      }));
    }
  }

  return out;
}
