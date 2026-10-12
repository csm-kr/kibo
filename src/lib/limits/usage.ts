import { connect, type Loaded } from "@/lib/store/firestore";
import { storeKind } from "@/lib/store";

// Daily limits across all sessions (ARCHITECTURE "Limits and cost"), in `usage/{yyyy-mm-dd}` (KST).

export interface UsageStore {
  /** Atomically adds 1 to `field` of day `key` unless it is already at `limit`; false when over. */
  bump(key: string, field: string, limit: number): Promise<boolean>;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDay(now: number): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Single process only, like MemoryStore (STORE=memory). */
export class MemoryUsageStore implements UsageStore {
  private counts = new Map<string, number>();

  async bump(key: string, field: string, limit: number): Promise<boolean> {
    const id = `${key}/${field}`;
    const n = this.counts.get(id) ?? 0;
    if (n >= limit) return false;
    this.counts.set(id, n + 1);
    return true;
  }
}

export class FirestoreUsageStore implements UsageStore {
  private loaded: Promise<Loaded> | null = null;

  constructor(private readonly init: () => Promise<Loaded> = connect) {}

  /** Caches a successful init only, like FirestoreStore. */
  private load(): Promise<Loaded> {
    this.loaded ??= this.init().catch((e: unknown) => {
      this.loaded = null;
      throw e;
    });
    return this.loaded;
  }

  async bump(key: string, field: string, limit: number): Promise<boolean> {
    const { db, fs } = await this.load();
    const ref = db.collection("usage").doc(key);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (((snap.get(field) as number | undefined) ?? 0) >= limit) return false;
      tx.set(ref, { [field]: fs.FieldValue.increment(1) }, { merge: true });
      return true;
    });
  }
}

let usage: UsageStore | null = null;

export function getUsageStore(): UsageStore {
  if (!usage) usage = storeKind() === "firestore" ? new FirestoreUsageStore() : new MemoryUsageStore();
  return usage;
}
