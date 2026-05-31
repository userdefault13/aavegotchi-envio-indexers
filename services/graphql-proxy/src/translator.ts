import {
  parse,
  print,
  visit,
  type DocumentNode,
  type FieldNode,
  type SelectionSetNode,
  Kind,
} from "graphql";

/** The Graph root field → Hasura table (Envio entity) */
const ROOT_FIELD_MAP: Record<string, string> = {
  erc721Listings: "ERC721Listing",
  erc721Listing: "ERC721Listing",
  erc1155Listings: "ERC1155Listing",
  erc1155Listing: "ERC1155Listing",
  gotchiLendings: "GotchiLending",
  gotchiLending: "GotchiLending",
  parcels: "Parcel",
  parcel: "Parcel",
  aavegotchi: "Aavegotchi",
  aavegotchis: "Aavegotchi",
  installations: "Installation",
  installation: "Installation",
  tiles: "Tile",
  tile: "Tile",
  installationTypes: "InstallationType",
  installationType: "InstallationType",
  tileTypes: "TileType",
  tileType: "TileType",
  parcelAccessRights: "ParcelAccessRight",
  parcelAccessRight: "ParcelAccessRight",
  users: "User",
  user: "User",
};

const ORDER_SUFFIX = /_gt$|_lt$|_gte$|_lte$|_in$|_not$|_contains$|_not_contains$/;

function transformWhereValue(key: string, value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { [key]: { _eq: value } };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      Object.assign(out, transformWhereFlat(k, v));
    }
    return { [key]: out };
  }
  return transformWhereFlat(key, value);
}

function transformWhereFlat(key: string, value: unknown): Record<string, unknown> {
  if (key.endsWith("_gt")) return { [key.slice(0, -3)]: { _gt: value } };
  if (key.endsWith("_lt")) return { [key.slice(0, -3)]: { _lt: value } };
  if (key.endsWith("_gte")) return { [key.slice(0, -4)]: { _gte: value } };
  if (key.endsWith("_lte")) return { [key.slice(0, -4)]: { _lte: value } };
  if (key.endsWith("_in")) return { [key.slice(0, -3)]: { _in: value } };
  if (key.endsWith("_not")) return { [key.slice(0, -4)]: { _neq: value } };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const nested: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      Object.assign(nested, transformWhereFlat(k, v));
    }
    return { [key]: nested };
  }
  return { [key]: { _eq: value } };
}

function transformWhere(where: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!where) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (ORDER_SUFFIX.test(key)) {
      Object.assign(result, transformWhereFlat(key, value));
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      const hasOps = Object.keys(inner).some((k) => k.startsWith("_"));
      if (hasOps) {
        result[key] = inner;
      } else {
        Object.assign(result, transformWhereValue(key, value));
      }
    } else {
      Object.assign(result, transformWhereFlat(key, value));
    }
  }
  return result;
}

function selectionSetToHasuraFields(selectionSet: SelectionSetNode | undefined): string {
  if (!selectionSet) return "id";
  const parts: string[] = [];
  for (const sel of selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) continue;
    const field = sel as FieldNode;
    if (field.selectionSet) {
      parts.push(`${field.name.value} { ${selectionSetToHasuraFields(field.selectionSet)} }`);
    } else {
      parts.push(field.name.value);
    }
  }
  return parts.join("\n        ");
}

export interface TranslateResult {
  hasuraQuery: string;
  rootField: string;
  originalRootField: string;
}

export function translateSubgraphToHasura(query: string, variables: Record<string, unknown> = {}): TranslateResult {
  const doc: DocumentNode = parse(query);
  let rootField = "";
  let originalRootField = "";
  let fieldArgs: Record<string, unknown> = {};
  let selectionSet: SelectionSetNode | undefined;

  visit(doc, {
    Field(node) {
      if (!rootField && node.name.value !== "__schema" && node.name.value !== "__type" && node.name.value !== "_meta") {
        originalRootField = node.name.value;
        rootField = ROOT_FIELD_MAP[node.name.value] ?? node.name.value;
        selectionSet = node.selectionSet ?? undefined;
        fieldArgs = {};
        for (const arg of node.arguments ?? []) {
          if (arg.value.kind === Kind.VARIABLE) {
            fieldArgs[arg.name.value] = variables[arg.value.name.value];
          } else if (arg.value.kind === Kind.INT) {
            fieldArgs[arg.name.value] = parseInt(arg.value.value, 10);
          } else if (arg.value.kind === Kind.STRING) {
            fieldArgs[arg.name.value] = arg.value.value;
          } else if (arg.value.kind === Kind.BOOLEAN) {
            fieldArgs[arg.name.value] = arg.value.value;
          } else if (arg.value.kind === Kind.OBJECT) {
            const obj: Record<string, unknown> = {};
            for (const f of arg.value.fields) {
              if (f.value.kind === Kind.VARIABLE) {
                obj[f.name.value] = variables[f.value.name.value];
              } else if (f.value.kind === Kind.STRING) {
                obj[f.name.value] = f.value.value;
              } else if (f.value.kind === Kind.BOOLEAN) {
                obj[f.name.value] = f.value.value;
              } else if (f.value.kind === Kind.INT) {
                obj[f.name.value] = parseInt(f.value.value, 10);
              }
            }
            fieldArgs[arg.name.value] = obj;
          }
        }
      }
    },
  });

  if (!rootField) {
    throw new Error("Unsupported query: no recognized root field");
  }

  const limit = fieldArgs.first ?? fieldArgs.last ?? 100;
  const offset = fieldArgs.skip ?? 0;
  const where = transformWhere(fieldArgs.where as Record<string, unknown> | undefined);
  const orderByField = fieldArgs.orderBy as string | undefined;
  const orderDir = (fieldArgs.orderDirection as string | undefined)?.toLowerCase() ?? "asc";

  const whereClause = where ? `where: ${jsonToGraphql(where)}` : "";
  const orderClause = orderByField ? `order_by: {${orderByField}: ${orderDir}}` : "";
  const args = [`limit: ${limit}`, `offset: ${offset}`, whereClause, orderClause].filter(Boolean).join(", ");

  const fields = selectionSetToHasuraFields(selectionSet);

  const hasuraQuery = `query ProxyQuery {
  ${rootField}(${args}) {
        ${fields}
  }
}`;

  return { hasuraQuery, rootField, originalRootField };
}

function jsonToGraphql(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "string") return `"${obj.replace(/"/g, '\\"')}"`;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(jsonToGraphql).join(", ")}]`;
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${jsonToGraphql(v)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return "null";
}

export function wrapHasuraResponse(
  hasuraData: Record<string, unknown>,
  hasuraRoot: string,
  originalRootField: string,
): Record<string, unknown> {
  const rows = hasuraData[hasuraRoot];
  return { [originalRootField]: rows };
}

/** Introspection passthrough for schema checks */
export function isIntrospectionQuery(query: string): boolean {
  return query.includes("__schema") || query.includes("__type");
}

export function buildMetaResponse(): Record<string, unknown> {
  return {
    _meta: {
      block: { number: 0 },
      deployment: "envio-self-hosted",
      hasIndexingErrors: false,
    },
  };
}
