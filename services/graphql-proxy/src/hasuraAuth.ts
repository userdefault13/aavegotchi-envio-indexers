/**
 * Headers for data/introspection fetches to Hasura. Data never runs as admin:
 * - mode "unauthorized-role" (HASURA_PUBLIC_AUTH=unauthorized-role): no admin secret at all; Hasura
 *   must have HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public.
 * - default "secret-with-role": admin secret + x-hasura-role: public, so Hasura applies the public
 *   role's permissions (admin role is never used).
 * Fails closed: if the secret is required and unset, throws HasuraConfigError (handler → 503).
 * There is no "testing" fallback.
 */
export class HasuraConfigError extends Error {}

export type HasuraAuthConfig = {
  mode: "secret-with-role" | "unauthorized-role";
  adminSecret: string;
  cryptopnlUrl?: string;
  cryptopnlAdminSecret: string;
};

export const PUBLIC_ROLE = "public";

export function hasuraAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HasuraAuthConfig {
  return {
    mode: env.HASURA_PUBLIC_AUTH === "unauthorized-role" ? "unauthorized-role" : "secret-with-role",
    adminSecret: String(env.HASURA_ADMIN_SECRET ?? env.HASURA_GRAPHQL_ADMIN_SECRET ?? "").trim(),
    cryptopnlUrl: env.CRYPTOPNL_HASURA_URL || undefined,
    cryptopnlAdminSecret: String(env.CRYPTOPNL_HASURA_ADMIN_SECRET ?? "").trim(),
  };
}

export function isCryptoPnlUpstream(url: string, cfg: HasuraAuthConfig): boolean {
  return Boolean(cfg.cryptopnlUrl) && url === cfg.cryptopnlUrl;
}

export function hasuraHeadersFor(url: string, cfg: HasuraAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-hasura-role": PUBLIC_ROLE,
  };
  if (cfg.mode === "unauthorized-role") return headers;
  const secret = isCryptoPnlUpstream(url, cfg) ? cfg.cryptopnlAdminSecret : cfg.adminSecret;
  if (!secret) {
    throw new HasuraConfigError(
      isCryptoPnlUpstream(url, cfg)
        ? "CRYPTOPNL_HASURA_ADMIN_SECRET is not configured"
        : "HASURA_ADMIN_SECRET is not configured",
    );
  }
  headers["x-hasura-admin-secret"] = secret;
  return headers;
}
