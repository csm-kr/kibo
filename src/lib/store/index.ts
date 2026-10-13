import { FirestoreStore } from "./firestore";
import { MemoryStore } from "./memory";
import type { SessionStore } from "./types";

export type { SessionSecrets, SessionStore } from "./types";

let store: SessionStore | null = null;

/** STORE=firestore|memory; defaults to firestore in production, memory otherwise (ADR-010). */
export function storeKind(): "firestore" | "memory" {
  const kind = process.env.STORE ?? (process.env.NODE_ENV === "production" ? "firestore" : "memory");
  // A typo must not silently fall back to memory, which loses sessions across Cloud Run instances.
  if (kind !== "firestore" && kind !== "memory") throw new Error(`Unknown STORE: ${kind}`);
  return kind;
}

export function getStore(): SessionStore {
  if (store) return store;
  const kind = storeKind();
  // The memory store lives in one process; with more than one Cloud Run instance, sessions would split.
  if (kind === "memory" && process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_STORE !== "1") {
    throw new Error("STORE=memory is refused in production; set ALLOW_MEMORY_STORE=1 to allow it on a single instance");
  }
  // FirestoreStore loads firebase-admin on first use, so the memory branch never loads it. The memory store sits on
  // globalThis so a voice relay in the same process (scripts/e2e-relay-stack.ts) sees the dev server's sessions:
  // Next.js bundles its own copy of this module.
  const g = globalThis as { __kiboMemoryStore?: SessionStore };
  store = kind === "firestore" ? new FirestoreStore() : (g.__kiboMemoryStore ??= new MemoryStore());
  return store;
}
