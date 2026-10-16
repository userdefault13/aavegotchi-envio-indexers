/**
 * Native Hasura (Envio) query pass-through, run as the read-only public role.
 *
 * The Graph→Hasura translator mangles Hasura-syntax queries (drops `limit`, injects `offset: 0`,
 * ignores `order_by`, trims non-plural roots to rows[0], renames aliases). Those queries go to
 * Hasura as written, after:
 *   1. read-only gate (only `query` operations + fragments),
 *   2. no `__schema` / `__type` anywhere (fragments included),
 *   3. validation against the public role's schema (so non-public tables such as raw_events
 *      are unknown fields and rejected),
 *   4. `limit` clamped on every object-list field — roots, nested relationships, `_aggregate`
 *      fields, inside fragment definitions and inline fragments — default 100, max 1000;
 *      variable limits are inlined as clamped literals. Object lists that take no `limit`
 *      argument are rejected, except `nodes` under an `_aggregate` (bounded by its parent).
 */
import {
  Kind,
  TypeInfo,
  getNamedType,
  getNullableType,
  isListType,
  isObjectType,
  parse,
  print,
  validate,
  visit,
  visitWithTypeInfo,
  type ArgumentNode,
  type DocumentNode,
  type GraphQLSchema,
  type ValueNode,
} from "graphql";

export const NATIVE_DEFAULT_LIMIT = 100;
export const NATIVE_MAX_LIMIT = 1000;

const NATIVE_ARGS = new Set(["limit", "offset", "order_by", "distinct_on"]);
const GRAPH_ARGS = new Set(["first", "skip", "orderBy", "orderDirection", "block"]);
const INTROSPECTION_FIELDS = new Set(["__schema", "__type"]);

function hasHasuraOperator(v: ValueNode | undefined): boolean {
  if (!v) return false;
  if (v.kind === Kind.OBJECT) {
    return v.fields.some((f) => f.name.value.startsWith("_") || hasHasuraOperator(f.value));
  }
  if (v.kind === Kind.LIST) return v.values.some(hasHasuraOperator);
  return false;
}

/** True if __schema/__type appears anywhere (operations or fragments). */
export function containsIntrospectionField(query: string | DocumentNode): boolean {
  let doc: DocumentNode;
  try {
    doc = typeof query === "string" ? parse(query) : query;
  } catch {
    return false;
  }
  let found = false;
  visit(doc, {
    Field(node) {
      if (INTROSPECTION_FIELDS.has(node.name.value)) found = true;
    },
  });
  return found;
}

/** True when the query uses Hasura syntax and must not go through the Graph→Hasura translator. */
export function isNativeHasuraQuery(query: string): boolean {
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch {
    return false;
  }
  for (const def of doc.definitions) {
    if (def.kind !== Kind.OPERATION_DEFINITION) continue;
    for (const sel of def.selectionSet.selections) {
      if (sel.kind !== Kind.FIELD) return true; // fragments at root: translator can't handle them
      const name = sel.name.value;
      if (name.startsWith("__") || name === "_meta") continue;
      if (name.endsWith("_by_pk") || name.endsWith("_aggregate")) return true;
      const args = sel.arguments ?? [];
      if (args.some((a) => GRAPH_ARGS.has(a.name.value))) continue;
      if (args.some((a) => NATIVE_ARGS.has(a.name.value))) return true;
      const where = args.find((a) => a.name.value === "where");
      if (where && hasHasuraOperator(where.value)) return true;
    }
  }
  return false;
}

export type NativePrepared =
  | { ok: true; query: string }
  | { ok: false; status: number; message: string };

function fail(status: number, message: string): NativePrepared {
  return { ok: false, status, message };
}

export function prepareNativeHasuraQuery(
  query: string,
  variables: Record<string, unknown> = {},
  schema: GraphQLSchema,
): NativePrepared {
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch (err) {
    return fail(400, `Invalid GraphQL: ${(err as Error).message}`);
  }
  // 1. read-only gate first
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION && def.operation !== "query") {
      return fail(403, "read_only: only queries are allowed");
    }
    if (def.kind !== Kind.OPERATION_DEFINITION && def.kind !== Kind.FRAGMENT_DEFINITION) {
      return fail(400, "Unsupported GraphQL definition");
    }
  }
  // 2. no introspection at any depth
  if (containsIntrospectionField(doc)) {
    return fail(400, "Introspection fields (__schema/__type) are not allowed in data queries");
  }
  // 3. must be valid for the public role
  const errors = validate(schema, doc);
  if (errors.length) return fail(400, errors.map((e) => e.message).join("; "));

  // 4. clamp limits everywhere
  let problem: string | null = null;
  const clamp = (v: ValueNode | undefined): number | null => {
    if (!v) return NATIVE_DEFAULT_LIMIT;
    let raw: unknown;
    if (v.kind === Kind.INT) raw = Number(v.value);
    else if (v.kind === Kind.VARIABLE) {
      if (!(v.name.value in variables) || variables[v.name.value] == null) return NATIVE_DEFAULT_LIMIT;
      raw = variables[v.name.value];
    } else return null;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return null;
    return Math.min(raw, NATIVE_MAX_LIMIT);
  };
  const typeInfo = new TypeInfo(schema);
  const out = visit(
    doc,
    visitWithTypeInfo(typeInfo, {
      Field(node) {
        if (problem) return undefined;
        const def = typeInfo.getFieldDef();
        if (!def) return undefined;
        const ret = getNullableType(def.type);
        const isObjList = isListType(ret) && isObjectType(getNamedType(ret));
        const isAggregate = node.name.value.endsWith("_aggregate");
        if (!isObjList && !isAggregate) return undefined;
        const hasLimitArg = def.args.some((a) => a.name === "limit");
        if (!hasLimitArg) {
          const parent = typeInfo.getParentType();
          if (isObjList && parent && parent.name.endsWith("_aggregate_fields") === false && parent.name.endsWith("_aggregate") && node.name.value === "nodes") {
            return undefined; // bounded by the parent _aggregate's limit
          }
          problem = `Cannot bound list field '${node.name.value}' (no limit argument)`;
          return undefined;
        }
        const args = [...(node.arguments ?? [])];
        const i = args.findIndex((a) => a.name.value === "limit");
        const n = clamp(i >= 0 ? args[i].value : undefined);
        if (n == null) {
          problem = `limit on '${node.name.value}' must be a non-negative integer`;
          return undefined;
        }
        const limit: ArgumentNode = {
          kind: Kind.ARGUMENT,
          name: { kind: Kind.NAME, value: "limit" },
          value: { kind: Kind.INT, value: String(n) },
        };
        if (i >= 0) args[i] = limit;
        else args.push(limit);
        return { ...node, arguments: args };
      },
    }),
  );
  if (problem) return fail(400, problem);
  return { ok: true, query: print(out) };
}
