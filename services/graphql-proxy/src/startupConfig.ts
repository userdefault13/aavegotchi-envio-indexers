/**
 * Startup configuration checks. The proxy fails closed: if any required setting is missing it
 * logs why and refuses to start, instead of serving unauthenticated traffic.
 */
import type { HasuraAuthConfig } from "./hasuraAuth.js";

export function startupConfigErrors(env: NodeJS.ProcessEnv, auth: HasuraAuthConfig): string[] {
  const errors: string[] = [];
  if (!String(env.SUBGRAPH_PROXY_SECRET ?? "").trim()) {
    errors.push(
      "SUBGRAPH_PROXY_SECRET is unset; refusing to start without the X-Subgraph-Proxy-Key gate",
    );
  }
  if (auth.mode === "secret-with-role" && !auth.adminSecret) {
    errors.push(
      "HASURA_ADMIN_SECRET is unset but HASURA_PUBLIC_AUTH=secret-with-role; set it or use unauthorized-role",
    );
  }
  return errors;
}
