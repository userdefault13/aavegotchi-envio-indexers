/**
 * Native Hasura (Envio) query pass-through.
 *
 * The translator below assumes The Graph syntax (`first`/`skip`/`orderBy`, singular vs plural roots).
 * Callers that already speak Hasura — `limit`, `offset`, `order_by`, `distinct_on`, `_by_pk`,
 * `_aggregate`, `where: { x: { _eq } }` — were being mangled: `limit` dropped (default 100),
 * `offset: 0` injected (breaking `_by_pk`), `order_by` ignored, and any root not ending in "s"
 * collapsed to its first row with aliases renamed. Those queries now go to Hasura verbatim,
 * read-only, with root list limits clamped.
 */
import {
  Kind,
  parse,
  print,
  visit,
  type ArgumentNode,
  type DocumentNode,
  type FieldNode,
  type ValueNode,
} from "graphql";

export const NATIVE_DEFAULT_LIMIT = 100;
export const NATIVE_MAX_LIMIT = 1000;

const NATIVE_ARGS = new Set(["limit", "offset", "order_by", "distinct_on"]);
const GRAPH_ARGS = new Set(["first", "skip", "orderBy", "orderDirection", "block"]);

function rootFields(doc: DocumentNode): FieldNode[] {
  const out: FieldNode[] = [];
  for (const def of doc.definitions) {
    if (def.kind !== Kind.OPERATION_DEFINITION) continue;
    for (const sel of def.selectionSet.selections) {
      if (sel.kind === Kind.FIELD && !sel.name.value.startsWith("__") && sel.name.value !== "_meta") {
        out.push(sel);
      }
    }
  }
  return out;
}

function hasHasuraOperator(v: ValueNode | undefined): boolean {
  if (!v) return false;
  if (v.kind === Kind.OBJECT) {
    return v.fields.some((f) => f.name.value.startsWith("_") || hasHasuraOperator(f.value));
  }
  if (v.kind === Kind.LIST) return v.values.some(hasHasuraOperator);
  return false;
}

/** True when the query uses Hasura syntax and must not go through the Graph→Hasura translator. */
export function isNativeHasuraQuery(query: string): boolean {
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch {
    return false;
  }
  for (const f of rootFields(doc)) {
    const name = f.name.value;
    if (name.endsWith("_by_pk") || name.endsWith("_aggregate")) return true;
    const args = f.arguments ?? [];
    if (args.some((a) => GRAPH_ARGS.has(a.name.value))) continue;
    if (args.some((a) => NATIVE_ARGS.has(a.name.value))) return true;
    const where = args.find((a) => a.name.value === "where");
    if (where && hasHasuraOperator(where.value)) return true;
  }
  return false;
}

export type NativePrepared =
  | { ok: true; query: string }
  | { ok: false; status: number; message: string };

/**
 * Read-only check plus root `limit` clamp (default 100, max 1000) on list roots.
 * Variable-valued limits are rejected-safe: Hasura gets the variable, so we clamp by
 * rewriting `limit: $v` to a literal when the variable is known.
 */
export function prepareNativeHasuraQuery(
  query: string,
  variables: Record<string, unknown> = {},
): NativePrepared {
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch (err) {
    return { ok: false, status: 400, message: `Invalid GraphQL: ${(err as Error).message}` };
  }
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION && def.operation !== "query") {
      return { ok: false, status: 403, message: "read_only: only queries are allowed" };
    }
    if (def.kind !== Kind.OPERATION_DEFINITION && def.kind !== Kind.FRAGMENT_DEFINITION) {
      return { ok: false, status: 400, message: "Unsupported GraphQL definition" };
    }
  }
  const roots = new Set(rootFields(doc));
  const clampValue = (v: ValueNode): number => {
    let n: unknown = NATIVE_DEFAULT_LIMIT;
    if (v.kind === Kind.INT) n = Number(v.value);
    else if (v.kind === Kind.VARIABLE) n = variables[v.name.value] ?? NATIVE_DEFAULT_LIMIT;
    const num = Math.floor(Number(n));
    if (!Number.isFinite(num) || num < 0) return NATIVE_DEFAULT_LIMIT;
    return Math.min(num, NATIVE_MAX_LIMIT);
  };
  const out = visit(doc, {
    Field(node) {
      if (!roots.has(node)) return undefined;
      const name = node.name.value;
      if (name.endsWith("_by_pk")) return undefined;
      const args = [...(node.arguments ?? [])];
      const i = args.findIndex((a) => a.name.value === "limit");
      const limit: ArgumentNode = {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: "limit" },
        value: { kind: Kind.INT, value: String(i >= 0 ? clampValue(args[i].value) : NATIVE_DEFAULT_LIMIT) },
      };
      if (i >= 0) args[i] = limit;
      else args.push(limit);
      return { ...node, arguments: args };
    },
  });
  return { ok: true, query: print(out) };
}
