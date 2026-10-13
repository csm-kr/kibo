import type { DocumentData, Firestore } from "firebase-admin/firestore";
import type { CartLine, Session } from "@/types/session";
import type { PairCodeEntry, SessionSecrets, SessionStore, TransactResult } from "./types";

// Production store (STORE=firestore). firebase-admin is imported on first use only, so tests and
// STORE=memory never load it. Collections: `sessions` (public), `sessionSecrets` and `pairCodes` (server only).

type FirestoreModule = typeof import("firebase-admin/firestore");

export type Loaded = { db: Firestore; fs: FirestoreModule };

export async function connect(): Promise<Loaded> {
  const app = await import("firebase-admin/app");
  const fs = await import("firebase-admin/firestore");
  // Application default credentials; project from GOOGLE_CLOUD_PROJECT or the credentials' default.
  const instance = app.getApps()[0] ?? app.initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return { db: fs.getFirestore(instance), fs };
}

// Epoch ms in domain code; `createdAt` and `expiresAt` are Timestamps in Firestore so the TTL policy can delete them.
// Firestore has no nested arrays, so `undoStack` (CartLine[][]) is stored as [{ lines }].

function toTimes(fs: FirestoreModule, o: { createdAt: number; expiresAt: number }) {
  return { createdAt: fs.Timestamp.fromMillis(o.createdAt), expiresAt: fs.Timestamp.fromMillis(o.expiresAt) };
}

function fromTimes(d: DocumentData) {
  return { createdAt: d.createdAt.toMillis() as number, expiresAt: d.expiresAt.toMillis() as number };
}

function sessionToDoc(fs: FirestoreModule, s: Session): DocumentData {
  return { ...s, ...toTimes(fs, s), undoStack: s.undoStack.map((lines) => ({ lines })) };
}

function sessionFromDoc(d: DocumentData): Session {
  return { ...d, ...fromTimes(d), undoStack: (d.undoStack as { lines: CartLine[] }[]).map((u) => u.lines) } as Session;
}

function secretsToDoc(fs: FirestoreModule, s: SessionSecrets): DocumentData {
  return { ...s, ...toTimes(fs, s) };
}

function secretsFromDoc(d: DocumentData): SessionSecrets {
  return { ...d, ...fromTimes(d) } as SessionSecrets;
}

export class FirestoreStore implements SessionStore {
  private loaded: Promise<Loaded> | null = null;

  /** `init` is injectable for tests; production uses the Admin SDK. */
  constructor(private readonly init: () => Promise<Loaded> = connect) {}

  /** Caches a successful init only: a failed one (no credentials yet, a network blip) is retried next time. */
  private load(): Promise<Loaded> {
    this.loaded ??= this.init().catch((e: unknown) => {
      this.loaded = null;
      throw e;
    });
    return this.loaded;
  }

  async create(session: Session, secrets: SessionSecrets): Promise<void> {
    const { db, fs } = await this.load();
    const batch = db.batch();
    batch.create(db.collection("sessions").doc(session.sessionId), sessionToDoc(fs, session));
    batch.create(db.collection("sessionSecrets").doc(session.sessionId), secretsToDoc(fs, secrets));
    await batch.commit();
  }

  async reservePairCode(code: string, entry: PairCodeEntry, now: number): Promise<boolean> {
    const { db, fs } = await this.load();
    const ref = db.collection("pairCodes").doc(code);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // TTL deletes up to a day late, so an expired entry may still be there and is simply replaced.
      if (snap.exists && (snap.data()!.expiresAt.toMillis() as number) > now) return false;
      tx.set(ref, { sessionId: entry.sessionId, expiresAt: fs.Timestamp.fromMillis(entry.expiresAt) });
      return true;
    });
  }

  async getPairCode(code: string): Promise<PairCodeEntry | null> {
    const { db } = await this.load();
    const snap = await db.collection("pairCodes").doc(code).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    return { sessionId: d.sessionId as string, expiresAt: d.expiresAt.toMillis() as number };
  }

  async deletePairCode(code: string, sessionId: string): Promise<void> {
    const { db } = await this.load();
    const ref = db.collection("pairCodes").doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data()!.sessionId === sessionId) tx.delete(ref);
    });
  }

  async get(sessionId: string): Promise<Session | null> {
    const { db } = await this.load();
    const snap = await db.collection("sessions").doc(sessionId).get();
    return snap.exists ? sessionFromDoc(snap.data()!) : null;
  }

  async transact<T>(sessionId: string, fn: (s: Session | null, sec: SessionSecrets | null) => TransactResult<T>): Promise<T> {
    const { db, fs } = await this.load();
    const sRef = db.collection("sessions").doc(sessionId);
    const secRef = db.collection("sessionSecrets").doc(sessionId);
    return db.runTransaction(async (tx) => {
      const [s, sec] = await tx.getAll(sRef, secRef);
      const out = fn(s.exists ? sessionFromDoc(s.data()!) : null, sec.exists ? secretsFromDoc(sec.data()!) : null);
      if (out.session) tx.set(sRef, sessionToDoc(fs, out.session));
      if (out.secrets) tx.set(secRef, secretsToDoc(fs, out.secrets));
      return out.value;
    });
  }

  subscribe(sessionId: string, onChange: (s: Session | null) => void, onError?: (e: unknown) => void): () => void {
    let stop: (() => void) | null = null;
    let closed = false;
    // A broken listener sends no more snapshots; without this the SSE keepalive would hide it.
    const fail = (e: unknown) => {
      if (!closed) onError?.(e);
    };
    this.load().then(({ db }) => {
      if (closed) return;
      stop = db
        .collection("sessions")
        .doc(sessionId)
        .onSnapshot((snap) => onChange(snap.exists ? sessionFromDoc(snap.data()!) : null), fail);
    }, fail);
    return () => {
      closed = true;
      stop?.();
    };
  }
}
