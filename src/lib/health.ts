import type { SessionStore } from "@/lib/store/types";

// Deep health for the uptime check (`GET /api/health?deep=1`): can we read the store and are both Gemini
// model ids still served? Results are cached so a busy uptime check or a curious visitor costs at most
// three upstream calls a minute.

export type CheckResult = "ok" | "fail";

export interface DeepHealth {
  ok: boolean;
  checks: { store: CheckResult; textModel: CheckResult; liveModel: CheckResult };
}

export interface DeepHealthDeps {
  /** Factories, so a store or client that cannot be built fails its check instead of the whole route. */
  store: () => Pick<SessionStore, "get">;
  models: () => { get(params: { model: string }): Promise<unknown> };
  textModel: string;
  liveModel: string;
  now: () => number;
  timeoutMs?: number;
}

const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;
/** Matches the session id pattern but is never issued (ids are random), so `get` must return null. */
const PROBE_ID = "health_probe_0000";

async function run(name: string, timeoutMs: number, fn: () => Promise<boolean>): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DOMException("Check timed out", "TimeoutError")), timeoutMs);
  });
  try {
    return (await Promise.race([fn(), timeout])) ? "ok" : "fail";
  } catch (e) {
    // Name only: upstream messages can carry request data.
    console.error(`health ${name}:`, e instanceof Error ? e.name : typeof e);
    return "fail";
  } finally {
    clearTimeout(timer);
  }
}

export function createDeepHealth(deps: DeepHealthDeps): () => Promise<DeepHealth> {
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  let cached: { at: number; result: Promise<DeepHealth> } | null = null;

  async function check(): Promise<DeepHealth> {
    const model = (id: string) => async () => {
      await deps.models().get({ model: id });
      return true;
    };
    const [store, textModel, liveModel] = await Promise.all([
      run("store", timeoutMs, async () => (await deps.store().get(PROBE_ID)) === null),
      run("textModel", timeoutMs, model(deps.textModel)),
      run("liveModel", timeoutMs, model(deps.liveModel)),
    ]);
    const checks = { store, textModel, liveModel };
    return { ok: Object.values(checks).every((c) => c === "ok"), checks };
  }

  return () => {
    const t = deps.now();
    // Concurrent callers share one run.
    if (!cached || t - cached.at >= CACHE_MS) cached = { at: t, result: check() };
    return cached.result;
  };
}
