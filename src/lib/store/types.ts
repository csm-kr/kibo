import type { CommandResult } from "@/lib/commands/machine";
import type { Session } from "@/types/session";

/** Server only: lives in `sessionSecrets/{id}`, never in the public session document. */
export interface SessionSecrets {
  claimTokenHash: string;
  claimed: boolean;
  deviceTokenHash: string | null;
  kioskTokenHash: string;
  /**
   * Results of the last 10 accepted commands that had one, so a retried commandId gets the same answer.
   * `reissueClaim` is stored with an empty result: the claim token itself is never kept. Absent until the first one.
   */
  recentResults?: { commandId: string; result: CommandResult }[];
  /** Per-session limits (ARCHITECTURE "Limits and cost"); absent until the first bump. */
  chatCount?: number;
  liveTokenCount?: number;
  /** Epoch ms. */
  createdAt: number;
  expiresAt: number;
}

export interface TransactResult<T> {
  session?: Session;
  secrets?: SessionSecrets;
  value: T;
}

export interface SessionStore {
  create(session: Session, secrets: SessionSecrets): Promise<void>;
  get(sessionId: string): Promise<Session | null>;
  /**
   * fn may run more than once (Firestore retries on contention), so it must be pure.
   * Throwing inside fn aborts the transaction and rethrows.
   */
  transact<T>(sessionId: string, fn: (s: Session | null, sec: SessionSecrets | null) => TransactResult<T>): Promise<T>;
  /**
   * Calls onChange with the current value first, then after every committed write. Returns unsubscribe.
   * onError means the listener has stopped for good (no more onChange); the caller should unsubscribe.
   */
  subscribe(sessionId: string, onChange: (s: Session | null) => void, onError?: (e: unknown) => void): () => void;
}
