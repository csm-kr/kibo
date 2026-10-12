import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Actor tokens (ADR-006). The server stores only SHA-256 hashes, never the tokens.

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newSessionId(): string {
  return randomBytes(16).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, hash: string | null): boolean {
  if (hash === null) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  // Both sides are SHA-256 digests of equal length unless the stored hash is malformed.
  return a.length === b.length && timingSafeEqual(a, b);
}
