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
  type DefinitionNode,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type GraphQLSchema,
  type ValueNode,
} from "graphql";

export const NATIVE_DEFAULT_LIMIT = 100;
export const NATIVE_MAX_LIMIT = 1000;

export type QueryCaps = { maxDepth: number; maxRootFields: number };
export function capsFromEnv(env: NodeJS.ProcessEnv = process.env): QueryCaps {
  const n = (v: string | undefined, d: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x > 0 ? x : d;
  };
  return { maxDepth: n(env.PROXY_MAX_QUERY_DEPTH, 8), maxRootFields: n(env.PROXY_MAX_ROOT_FIELDS, 10) };
}
export const DEFAULT_CAPS: QueryCaps = { maxDepth: 8, maxRootFields: 10 };

/** Envio internals: never served, including their _by_pk / _aggregate variants. */
export const DENIED_ROOTS = new Set([
  "raw_events",
  "persisted_state",
  "event_sync_state",
  "end_of_block_range_scanned_data",
  "dynamic_contract_registry",
]);
export function isDeniedField(name: string): boolean {
  return DENIED_ROOTS.has(name.replace(/_(by_pk|aggregate)$/, ""));
}

export function clampLimitValue(raw: unknown, dflt = NATIVE_DEFAULT_LIMIT): number | null {
  if (raw === undefined || raw === null) return dflt;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return null;
  return Math.min(raw, NATIVE_MAX_LIMIT);
}

type Selected = { ok: true; doc: DocumentNode; op: OperationDefinitionNode } | { ok: false; status: number; message: string };

/** Keep only the chosen operation (by operationName) and the fragments it reaches. */
export function selectOperation(doc: DocumentNode, operationName?: string | null): Selected {
  const ops = doc.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION);
  let op: OperationDefinitionNode | undefined;
  if (operationName) {
    op = ops.find((o) => o.name?.value === operationName);
    if (!op) return { ok: false, status: 400, message: `Unknown operation named '${operationName}'` };
  } else if (ops.length === 1) {
    op = ops[0];
  } else {
    return { ok: false, status: 400, message: "Must provide operationName when the document has multiple operations" };
  }
  const frags = new Map<string, FragmentDefinitionNode>();
  for (const d of doc.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) frags.set(d.name.value, d);
  const used = new Set<string>();
  const walk = (node: DefinitionNode | SelectionSetNode) => {
    visit(node, {
      FragmentSpread(sp) {
        const name = sp.name.value;
        if (used.has(name)) return;
        used.add(name);
        const f = frags.get(name);
        if (f) walk(f);
      },
    });
  };
  walk(op);
  const defs: DefinitionNode[] = [op, ...[...frags.values()].filter((f) => used.has(f.name.value))];
  return { ok: true, op, doc: { ...doc, definitions: defs } };
}

/** Depth, root-field/alias count and denylist checks, expanding fragments. */
export function checkShape(doc: DocumentNode, op: OperationDefinitionNode, caps: QueryCaps): string | null {
  const frags = new Map<string, FragmentDefinitionNode>();
  for (const d of doc.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) frags.set(d.name.value, d);
  let roots = 0;
  let err: string | null = null;
  const walk = (set: SelectionSetNode, depth: number, seen: Set<string>) => {
    for (const sel of set.selections) {
      if (err) return;
      if (sel.kind === Kind.FIELD) {
        if (isDeniedField(sel.name.value)) { err = `Field '${sel.name.value}' is not available`; return; }
        if (depth === 1 && !sel.name.value.startsWith("__")) roots++;
        if (depth > caps.maxDepth) { err = `Query depth exceeds ${caps.maxDepth}`; return; }
        if (sel.selectionSet) walk(sel.selectionSet, depth + 1, seen);
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        walk(sel.selectionSet, depth, seen);
      } else {
        const f = frags.get(sel.name.value);
        if (!f) { err = `Unknown fragment '${sel.name.value}'`; return; }
        if (seen.has(f.name.value)) { err = "Fragment cycle"; return; }
        walk(f.selectionSet, depth, new Set([...seen, f.name.value]));
      }
    }
  };
  walk(op.selectionSet, 1, new Set());
  if (err) return err;
  if (roots > caps.maxRootFields) return `Too many root fields/aliases (max ${caps.maxRootFields})`;
  return null;
}


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
export function isNativeHasuraQuery(
  query: string,
  variables: Record<string, unknown> = {},
  operationName?: string | null,
): boolean {
  let doc: DocumentNode;
  try {
    doc = parse(query);
  } catch {
    return false;
  }
  const sel = selectOperation(doc, operationName);
  if (!sel.ok) return true; // let the native path report the operation error
  const hasOps = (v: unknown): boolean =>
    Array.isArray(v) ? v.some(hasOps)
      : v && typeof v === "object" ? Object.entries(v).some(([k, x]) => k.startsWith("_") || hasOps(x)) : false;
  for (const s of sel.op.selectionSet.selections) {
    if (s.kind !== Kind.FIELD) return true; // root fragments: translator can't handle them
    const name = s.name.value;
    if (name.startsWith("__") || name === "_meta") continue;
    if (name.endsWith("_by_pk") || name.endsWith("_aggregate")) return true;
    if (/^[A-Z]/.test(name)) return true; // Envio entity names are PascalCase; Graph roots are camelCase
    const args = s.arguments ?? [];
    if (args.some((a) => GRAPH_ARGS.has(a.name.value))) continue;
    if (args.some((a) => NATIVE_ARGS.has(a.name.value))) return true;
    const where = args.find((a) => a.name.value === "where");
    if (where?.value.kind === Kind.VARIABLE && hasOps(variables[where.value.name.value])) return true;
    if (where && hasHasuraOperator(where.value)) return true;
  }
  if (sel.op.selectionSet.selections.length > 1) return true; // multi-root: translator handles one root only
  return false;
}

export type NativePrepared =
  | { ok: true; query: string; variables: Record<string, unknown>; operationName?: string }
  | { ok: false; status: number; message: string };

function fail(status: number, message: string): NativePrepared {
  return { ok: false, status, message };
}

export type PrepareOptions = { operationName?: string | null; caps?: QueryCaps };

export function prepareNativeHasuraQuery(
  query: string,
  variables: Record<string, unknown> = {},
  schema: GraphQLSchema,
  opts: PrepareOptions = {},
): NativePrepared {
  let full: DocumentNode;
  try {
    full = parse(query);
  } catch (err) {
    return fail(400, `Invalid GraphQL: ${(err as Error).message}`);
  }
  // 1. read-only gate first (whole document)
  for (const def of full.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION && def.operation !== "query") {
      return fail(403, "read_only: only queries are allowed");
    }
    if (def.kind !== Kind.OPERATION_DEFINITION && def.kind !== Kind.FRAGMENT_DEFINITION) {
      return fail(400, "Unsupported GraphQL definition");
    }
  }
  // 2. no introspection at any depth
  if (containsIntrospectionField(full)) {
    return fail(400, "Introspection fields (__schema/__type) are not allowed in data queries");
  }
  // 3. pick the operation; shape caps + denylist
  const sel = selectOperation(full, opts.operationName);
  if (!sel.ok) return fail(sel.status, sel.message);
  const doc = sel.doc;
  const shapeErr = checkShape(doc, sel.op, opts.caps ?? DEFAULT_CAPS);
  if (shapeErr) return fail(400, shapeErr);
  // 4. must be valid for the public role
  const errors = validate(schema, doc);
  if (errors.length) return fail(400, errors.map((e) => e.message).join("; "));

  // 5. clamp limits everywhere; inline variable limits
  let problem: string | null = null;
  const inlined = new Set<string>();
  const clamp = (v: ValueNode | undefined): number | null => {
    if (!v) return NATIVE_DEFAULT_LIMIT;
    if (v.kind === Kind.INT) return clampLimitValue(Number(v.value));
    if (v.kind === Kind.VARIABLE) {
      inlined.add(v.name.value);
      return clampLimitValue(variables[v.name.value]);
    }
    return null;
  };
  const typeInfo = new TypeInfo(schema);
  let out = visit(
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
          if (isObjList && parent?.name.endsWith("_aggregate") && node.name.value === "nodes") {
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
  // Drop inlined variables only if no other use remains.
  const drop = new Set([...inlined].filter((n) => isOnlyDefinition(out, n)));
  out = visit(out, {
    VariableDefinition(vd) {
      return drop.has(vd.variable.name.value) ? null : undefined;
    },
  });
  const outVars = Object.fromEntries(Object.entries(variables ?? {}).filter(([k]) => !drop.has(k)));
  return { ok: true, query: print(out), variables: outVars, operationName: sel.op.name?.value };
}

/** True when the variable's only remaining occurrence is its own definition. */
function isOnlyDefinition(doc: DocumentNode, name: string): boolean {
  let uses = 0;
  visit(doc, {
    VariableDefinition() {
      return false; // skip the definition's own Variable node
    },
    Variable(v) {
      if (v.name.value === name) uses++;
    },
  });
  return uses === 0;
}
