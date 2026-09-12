import type { HandlerContext } from "generated";
import { BIGINT_ZERO, ZERO_ADDRESS } from "../constants";
import {
  ALCHEMICA_ADDRESS_BURN,
  ALCHEMICA_TOKENS,
  ALCHEMICA_TOTAL_SUPPLY_ACCOUNT_KEY,
} from "./constants";
import { fetchTokenMeta, fetchTokenBalance } from "./contractEffects";

export type AlchemicaContext = HandlerContext;

type AccountEntity = NonNullable<
  Awaited<ReturnType<AlchemicaContext["AlchemicaAccount"]["get"]>>
>;
type ContractEntity = NonNullable<
  Awaited<ReturnType<AlchemicaContext["ERC20Contract"]["get"]>>
>;
type BalanceEntity = NonNullable<
  Awaited<ReturnType<AlchemicaContext["ERC20Balance"]["get"]>>
>;

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

export function balanceId(contractId: string, accountKey: string): string {
  return `${normalizeAddress(contractId)}/${accountKey}`;
}

export function toDecimalString(valueExact: bigint, decimals: number): string {
  if (decimals === 0) return valueExact.toString();
  const negative = valueExact < 0n;
  const abs = negative ? -valueExact : valueExact;
  const s = abs.toString();
  const padded = s.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals) || "0";
  let fracPart = padded.slice(-decimals);
  fracPart = fracPart.replace(/0+$/, "");
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${body}` : body;
}

function emptyBalance(
  id: string,
  contractId: string,
  accountId: string | undefined,
  decimals: number,
): BalanceEntity {
  return {
    id,
    contract_id: contractId,
    account_id: accountId,
    value: toDecimalString(BIGINT_ZERO, decimals),
    valueExact: BIGINT_ZERO,
  };
}

export async function getOrCreateAlchemicaAccount(
  context: AlchemicaContext,
  address: string,
): Promise<AccountEntity> {
  const id = normalizeAddress(address);
  const existing = await context.AlchemicaAccount.get(id);
  if (existing) return existing;
  const account: AccountEntity = { id };
  context.AlchemicaAccount.set(account);
  return account;
}

export async function getOrCreateERC20Contract(
  context: AlchemicaContext,
  contractAddress: string,
): Promise<ContractEntity> {
  const id = normalizeAddress(contractAddress);
  const existing = await context.ERC20Contract.get(id);
  if (existing) return existing;

  const known = ALCHEMICA_TOKENS[id];
  const meta = known ?? (await fetchTokenMeta(id));
  const symbol = meta?.symbol ?? "UNKNOWN";
  const name = meta?.name ?? "Unknown Token";
  const decimals = meta?.decimals ?? 18;

  const totalSupplyId = balanceId(id, ALCHEMICA_TOTAL_SUPPLY_ACCOUNT_KEY);
  const burnedId = balanceId(id, ALCHEMICA_ADDRESS_BURN);

  const totalSupply = emptyBalance(totalSupplyId, id, undefined, decimals);
  const burned = emptyBalance(burnedId, id, ALCHEMICA_ADDRESS_BURN, decimals);

  context.ERC20Balance.set(totalSupply);
  context.ERC20Balance.set(burned);

  const contract: ContractEntity = {
    id,
    symbol,
    name,
    decimals,
    burned_id: burnedId,
    totalSupply_id: totalSupplyId,
  };
  context.ERC20Contract.set(contract);

  const contractAccount = await getOrCreateAlchemicaAccount(context, id);
  context.AlchemicaAccount.set(contractAccount);

  return contract;
}

export async function getOrCreateERC20Balance(
  context: AlchemicaContext,
  contract: ContractEntity,
  accountAddress: string | undefined,
): Promise<BalanceEntity> {
  const contractId = contract.id;
  const accountKey = accountAddress
    ? normalizeAddress(accountAddress)
    : ALCHEMICA_TOTAL_SUPPLY_ACCOUNT_KEY;
  const id = balanceId(contractId, accountKey);

  const existing = await context.ERC20Balance.get(id);
  if (existing) return existing;

  const balance = emptyBalance(
    id,
    contractId,
    accountAddress ? normalizeAddress(accountAddress) : undefined,
    contract.decimals,
  );
  context.ERC20Balance.set(balance);
  return balance;
}

function applyBalanceDelta(
  balance: BalanceEntity,
  delta: bigint,
  decimals: number,
): BalanceEntity {
  const valueExact = balance.valueExact + delta;
  return {
    ...balance,
    valueExact,
    value: toDecimalString(valueExact, decimals),
  };
}

export async function handleAlchemicaTransfer(
  context: AlchemicaContext,
  contractAddress: string,
  from: string,
  to: string,
  amount: bigint,
): Promise<void> {
  const contract = await getOrCreateERC20Contract(context, contractAddress);
  const fromNorm = normalizeAddress(from);
  const toNorm = normalizeAddress(to);
  const burnNorm = ALCHEMICA_ADDRESS_BURN;

  if (fromNorm === ZERO_ADDRESS) {
    const totalSupply = await getOrCreateERC20Balance(context, contract, undefined);
    context.ERC20Balance.set(
      applyBalanceDelta(totalSupply, amount, contract.decimals),
    );
  } else {
    const fromAccount = await getOrCreateAlchemicaAccount(context, fromNorm);
    context.AlchemicaAccount.set(fromAccount);
    let fromBalance = await getOrCreateERC20Balance(context, contract, fromNorm);
    // If indexed state would go negative (missed prior credits), resync from chain.
    if (fromBalance.valueExact < amount) {
      const onChain = await fetchTokenBalance(contract.id, fromNorm);
      if (onChain !== undefined) {
        fromBalance = {
          ...fromBalance,
          valueExact: onChain,
          value: toDecimalString(onChain, contract.decimals),
        };
      }
    }
    context.ERC20Balance.set(
      applyBalanceDelta(fromBalance, -amount, contract.decimals),
    );
  }

  if (toNorm === ZERO_ADDRESS || toNorm === burnNorm) {
    const burnAccount = await getOrCreateAlchemicaAccount(context, toNorm);
    context.AlchemicaAccount.set(burnAccount);
    const burned = await getOrCreateERC20Balance(context, contract, toNorm);
    context.ERC20Balance.set(
      applyBalanceDelta(burned, amount, contract.decimals),
    );

    const totalSupply = await getOrCreateERC20Balance(context, contract, undefined);
    context.ERC20Balance.set(
      applyBalanceDelta(totalSupply, -amount, contract.decimals),
    );
  } else {
    const toAccount = await getOrCreateAlchemicaAccount(context, toNorm);
    context.AlchemicaAccount.set(toAccount);
    const toBalance = await getOrCreateERC20Balance(context, contract, toNorm);
    context.ERC20Balance.set(
      applyBalanceDelta(toBalance, amount, contract.decimals),
    );
  }
}
