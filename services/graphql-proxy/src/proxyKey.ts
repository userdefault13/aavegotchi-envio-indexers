import { timingSafeEqual } from "node:crypto";

/**
 * X-Subgraph-Proxy-Key gate. Default is "hard" (reject); SUBGRAPH_PROXY_ENFORCE=warn is the only
 * opt-out and still logs every unkeyed caller. Any other value (unset, "1", typo) means hard.
 */
export type EnforceMode = "hard" | "warn";

export function enforceModeFromEnv(env: NodeJS.ProcessEnv = process.env): EnforceMode {
  return String(env.SUBGRAPH_PROXY_ENFORCE || "").trim().toLowerCase() === "warn" ? "warn" : "hard";
}

function keyMatches(given: string, secret: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "allow" | "warn" (allowed, but log) | "reject". No secret configured → reject (fail closed). */
export function proxyKeyDecision(
  headerValue: unknown,
  secret: string,
  mode: EnforceMode,
): "allow" | "warn" | "reject" {
  const key = String(headerValue ?? "").trim();
  if (secret && key && keyMatches(key, secret)) return "allow";
  if (!secret) return "reject";
  return mode === "warn" ? "warn" : "reject";
}
