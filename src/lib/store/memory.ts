import type { Session } from "@/types/session";
import type { SessionSecrets, SessionStore, TransactResult } from "./types";

// Single-process store for unit tests and local E2E (STORE=memory). Not for Cloud Run with more than one instance.

type Listener = (s: Session | null) => void;

export class MemoryStore implements SessionStore {
  private sessions = new Map<string, Session>();
  private secrets = new Map<string, SessionSecrets>();
  private queues = new Map<string, Promise<unknown>>();
  private listeners = new Map<string, Set<Listener>>();

  async create(session: Session, secrets: SessionSecrets): Promise<void> {
    if (this.sessions.has(session.sessionId)) throw new Error("Session already exists");
    this.sessions.set(session.sessionId, structuredClone(session));
    this.secrets.set(session.sessionId, structuredClone(secrets));
    this.notify(session.sessionId);
  }

  async get(sessionId: string): Promise<Session | null> {
    return this.read(sessionId);
  }

  transact<T>(sessionId: string, fn: (s: Session | null, sec: SessionSecrets | null) => TransactResult<T>): Promise<T> {
    // One promise chain per session, so transactions on the same id never interleave.
    const run = (this.queues.get(sessionId) ?? Promise.resolve()).then(() => {
      const sec = this.secrets.get(sessionId);
      const out = fn(this.read(sessionId), sec ? structuredClone(sec) : null);
      if (out.secrets) this.secrets.set(sessionId, structuredClone(out.secrets));
      if (out.session) {
        this.sessions.set(sessionId, structuredClone(out.session));
        this.notify(sessionId);
      }
      return out.value;
    });
    this.queues.set(sessionId, run.catch(() => undefined));
    return run;
  }

  subscribe(sessionId: string, onChange: Listener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) this.listeners.set(sessionId, (set = new Set()));
    set.add(onChange);
    queueMicrotask(() => {
      if (set.has(onChange)) onChange(this.read(sessionId));
    });
    return () => {
      set.delete(onChange);
    };
  }

  private read(sessionId: string): Session | null {
    const s = this.sessions.get(sessionId);
    return s ? structuredClone(s) : null;
  }

  private notify(sessionId: string): void {
    const snapshot = this.sessions.get(sessionId);
    for (const listener of this.listeners.get(sessionId) ?? []) {
      queueMicrotask(() => listener(snapshot ? structuredClone(snapshot) : null));
    }
  }
}
