import type { SessionStore } from "@/lib/store/types";

// Deep health for the uptime check (`GET /api/health?deep=1`): can we read the store, are both Gemini
// model ids still served, and can we still spend? Model lookups and ephemeral tokens are free, so they
// kept passing when the Gemini API key's prepaid credits ran out (10-13, I-104). textGenerate (one output
// token through the text backend, Vertex AI by default) and keyGenerate (one output token on the Gemini
// API key, which voice uses) fail when billing does. Results are cached so a busy uptime check or a
// curious visitor costs at most six upstream calls a minute.

export type CheckResult = "ok" | "fail";

export interface DeepHealth {
  ok: boolean;
  checks: {
    store: CheckResult;
    textModel: CheckResult;
    liveModel: CheckResult;
    textGenerate: CheckResult;
    keyGenerate: CheckResult;
    liveToken: CheckResult;
  };
}

interface Generate {
  generateContent(params: { model: string; contents: string; config: { maxOutputTokens: number } }): Promise<unknown>;
}

export interface DeepHealthDeps {
  /** Factories, so a store or client that cannot be built fails its check instead of the whole route. */
  store: () => Pick<SessionStore, "get">;
  /** The Gemini API key's client: model id lookups (Vertex refuses `models.get`) and voice billing. */
  api: () => Generate & { get(params: { model: string }): Promise<unknown> };
  /** The text agent's backend (GEMINI_TEXT_BACKEND: auto, Vertex AI or the Gemini API). */
  text: () => Generate;
  liveTokens: () => {
    create(params: {
      config: { uses: number; expireTime: string; newSessionExpireTime: string; httpOptions: { apiVersion: string } };
    }): Promise<{ name?: string }>;
  };
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
    // Name and HTTP status only: upstream messages can carry request data.
    const status = typeof e === "object" && e !== null && "status" in e ? ` ${String(e.status)}` : "";
    console.error(`health ${name}:`, `${e instanceof Error ? e.name : typeof e}${status}`);
    return "fail";
  } finally {
    clearTimeout(timer);
  }
}

export function createDeepHealth(deps: DeepHealthDeps): () => Promise<DeepHealth> {
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  let cached: { at: number; result: Promise<DeepHealth> } | null = null;

  async function check(): Promise<DeepHealth> {
    const lookup = (id: string) => async () => {
      await deps.api().get({ model: id });
      return true;
    };
    const generate = (client: () => Generate) => async () => {
      await client().generateContent({ model: deps.textModel, contents: "Reply with OK", config: { maxOutputTokens: 1 } });
      return true;
    };
    const tokenExpiry = new Date(deps.now() + 60_000).toISOString();
    const [store, textModel, liveModel, textGenerate, keyGenerate, liveToken] = await Promise.all([
      run("store", timeoutMs, async () => (await deps.store().get(PROBE_ID)) === null),
      run("textModel", timeoutMs, lookup(deps.textModel)),
      run("liveModel", timeoutMs, lookup(deps.liveModel)),
      run("textGenerate", timeoutMs, generate(deps.text)),
      run("keyGenerate", timeoutMs, generate(deps.api)),
      // The token is never used or returned; it expires on its own.
      run("liveToken", timeoutMs, async () => {
        const token = await deps.liveTokens().create({
          config: { uses: 1, expireTime: tokenExpiry, newSessionExpireTime: tokenExpiry, httpOptions: { apiVersion: "v1alpha" } },
        });
        return Boolean(token.name);
      }),
    ]);
    const checks = { store, textModel, liveModel, textGenerate, keyGenerate, liveToken };
    return { ok: Object.values(checks).every((c) => c === "ok"), checks };
  }

  return () => {
    const t = deps.now();
    // Concurrent callers share one run.
    if (!cached || t - cached.at >= CACHE_MS) cached = { at: t, result: check() };
    return cached.result;
  };
}
