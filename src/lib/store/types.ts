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
  /**
   * The kiosk's current 6-digit pairing code (`pairCodes/{code}`), null once used, absent on /demo sessions.
   * Kept in plain digits: a hash of a 6-digit code would protect nothing, and rotation must delete the old entry.
   */
  pairCode?: string | null;
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

/** Server only: `pairCodes/{code}`, deleted by TTL on `expiresAt` (epoch ms here). */
export interface PairCodeEntry {
  sessionId: string;
  expiresAt: number;
}

export interface SessionStore {
  /** Writes the entry unless a live one (expiresAt > now) holds the code; false when taken. */
  reservePairCode(code: string, entry: PairCodeEntry, now: number): Promise<boolean>;
  getPairCode(code: string): Promise<PairCodeEntry | null>;
  /** Deletes the entry only while it still points at sessionId, so a reused code is never removed by its old session. */
  deletePairCode(code: string, sessionId: string): Promise<void>;
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
