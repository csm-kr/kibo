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
  // FirestoreStore loads firebase-admin on first use, so the memory branch never loads it.
  if (!store) store = storeKind() === "firestore" ? new FirestoreStore() : new MemoryStore();
  return store;
}
