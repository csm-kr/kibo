import type { Session } from "@/types/session";

/** Server only: lives in `sessionSecrets/{id}`, never in the public session document. */
export interface SessionSecrets {
  claimTokenHash: string;
  claimed: boolean;
  deviceTokenHash: string | null;
  kioskTokenHash: string;
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
  /** Calls onChange with the current value first, then after every committed write. Returns unsubscribe. */
  subscribe(sessionId: string, onChange: (s: Session | null) => void): () => void;
}
