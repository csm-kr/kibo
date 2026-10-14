import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GoogleGenAIOptions,
  type Part,
  type ToolListUnion,
} from "@google/genai";
import { CommandError } from "@/lib/commands/errors";
import { createPromptCache, type PromptCache } from "./cache";

// The text agent's model (ADR-011). Server only: GEMINI_API_KEY never leaves this module.
// GEMINI_TEXT_BACKEND=auto (default): the Gemini API key first, because it was faster (I-105), and Vertex AI
// (billed to the GCP account, runtime service account or gcloud ADC) as the safety net when the key's
// prepaid credits run out (402, I-104), it is rate limited (429) or Gemini is down (5xx, network).
// `api` and `vertex` pin one backend.

export interface ModelTurn {
  role: "user" | "model";
  parts: unknown[];
}

export type TextBackend = "api" | "vertex";

/** Token counts of one model call, for the cost measurement (scripts/measure-cost.ts). Numbers only, never content. */
export interface TokenUsage {
  prompt: number;
  /** Part of `prompt` served from the implicit cache, which is billed at a lower rate. */
  cached: number;
  candidates: number;
  thoughts: number;
  total: number;
}

/** From generateContent's usageMetadata, or a Live message's (which names the output count responseTokenCount). */
export function tokenUsage(
  meta:
    | {
        promptTokenCount?: number;
        cachedContentTokenCount?: number;
        candidatesTokenCount?: number;
        responseTokenCount?: number;
        thoughtsTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined,
): TokenUsage | undefined {
  if (!meta) return undefined;
  return {
    prompt: meta.promptTokenCount ?? 0,
    cached: meta.cachedContentTokenCount ?? 0,
    candidates: meta.candidatesTokenCount ?? meta.responseTokenCount ?? 0,
    thoughts: meta.thoughtsTokenCount ?? 0,
    total: meta.totalTokenCount ?? 0,
  };
}

export interface ModelClient {
  generate(req: { system: string; contents: ModelTurn[]; tools: object[] }): Promise<{
    content: ModelTurn;
    functionCalls: { id?: string; name: string; args: unknown }[];
    text: string;
    /** The backend that answered (the eval counts them). */
    backend?: TextBackend;
    usage?: TokenUsage;
  }>;
}

const MAX_OUTPUT_TOKENS = 1024;

// "low" took 3.5–5.1 s per round against about 7.1 s for the default with the same tool calls (I-059);
// gemini-3.8-flash rejects "minimal", so it is not offered.
const THINKING: Record<string, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function thinkingLevel(): ThinkingLevel {
  const v = process.env.GEMINI_TEXT_THINKING;
  return v !== undefined && Object.hasOwn(THINKING, v) ? THINKING[v] : ThinkingLevel.LOW;
}

export function textBackendSetting(): TextBackend | "auto" {
  const v = process.env.GEMINI_TEXT_BACKEND;
  return v === "api" || v === "vertex" ? v : "auto";
}

export function textClientOptions(backend: TextBackend): GoogleGenAIOptions {
  if (backend === "api") {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    return { apiKey: process.env.GEMINI_API_KEY };
  }
  // An explicit project and location make the SDK ignore any API key in the environment.
  return {
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || "kibo-2026",
    location: process.env.GEMINI_VERTEX_LOCATION || "global",
  };
}

const shared = new Map<TextBackend, { options: string; ai: GoogleGenAI }>();

/** One client per backend and configuration, so Vertex reuses its access token instead of fetching one per request. */
function textGenAI(backend: TextBackend): GoogleGenAI {
  const options = textClientOptions(backend);
  const key = JSON.stringify(options);
  let entry = shared.get(backend);
  if (entry?.options !== key) shared.set(backend, (entry = { options: key, ai: new GoogleGenAI(options) }));
  return entry.ai;
}

type Models = Pick<GoogleGenAI["models"], "generateContent">;
type GenerateResponse = Awaited<ReturnType<Models["generateContent"]>>;

const OUTAGE_WINDOW_MS = 5 * 60_000;
const OUTAGE_COUNT = 3;
const VERTEX_ONLY_MS = 10 * 60_000;

export interface Circuit {
  open(now: number): boolean;
  billingFailure(now: number): void;
}

/** After 3 billing errors (402) within 5 min, auto skips the API key for 10 min, so a credit outage
 *  does not cost every request a failed call first. In memory, per instance. */
export function createCircuit(): Circuit {
  let failures: number[] = [];
  let openUntil = 0;
  return {
    open: (now) => now < openUntil,
    billingFailure(now) {
      failures = [...failures.filter((t) => now - t < OUTAGE_WINDOW_MS), now];
      if (failures.length >= OUTAGE_COUNT) {
        openUntil = now + VERTEX_ONLY_MS;
        failures = [];
      }
    },
  };
}

const circuit = createCircuit();

export interface TextDeps {
  backend: TextBackend | "auto";
  models: (backend: TextBackend) => Models;
  circuit: Circuit;
  now: () => number;
  /** How long one model call may take before it is given up (I-250: a hung call locked the phone). */
  deadlineMs: number;
}

// Above the slowest answers seen (Vertex single calls up to 31 s, 14-final:5), so only a hung call is cut.
const MODEL_DEADLINE_MS = 40_000;

function defaultTextDeps(): TextDeps {
  return { backend: textBackendSetting(), models: (b) => textGenAI(b).models, circuit, now: Date.now, deadlineMs: MODEL_DEADLINE_MS };
}

/** A call that did not answer in time. Not an ApiError, so the first call of a request falls back like a network error. */
class ModelDeadlineError extends Error {
  constructor() {
    super("model call deadline");
    this.name = "ModelDeadlineError";
  }
}

/** Runs `call` with an abort signal; gives up after `ms` even if the SDK ignores the signal. */
async function withDeadline<T>(ms: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new ModelDeadlineError());
    }, ms);
  });
  try {
    return await Promise.race([call(ctrl.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The status worth a retry on Vertex, or null: billing, quota, server and network errors only, never a bad request. */
function fallbackStatus(e: unknown): string | null {
  if (!(e instanceof ApiError)) return "network";
  return e.status === 402 || e.status === 429 || e.status >= 500 ? String(e.status) : null;
}

/** One generateContent through `call`. With `pinned`, only that backend; otherwise auto may retry once on Vertex. */
async function generateOn(
  deps: TextDeps,
  call: (backend: TextBackend) => Promise<GenerateResponse>,
  pinned?: TextBackend,
): Promise<{ res: GenerateResponse; backend: TextBackend }> {
  const auto = deps.backend === "auto" && pinned === undefined;
  const first = pinned ?? (deps.backend !== "auto" ? deps.backend : deps.circuit.open(deps.now()) ? "vertex" : "api");
  try {
    return { res: await call(first), backend: first };
  } catch (e) {
    const status = auto && first === "api" ? fallbackStatus(e) : null;
    if (status === null) throw e;
    if (status === "402") deps.circuit.billingFailure(deps.now());
    console.error(`gemini text fallback api->vertex (${status})`);
    return { res: await call("vertex"), backend: "vertex" };
  }
}

/** The text backend for one-off calls (the deep health check), with the same fallback as the agent. */
export function textModels(): Models {
  const deps = defaultTextDeps();
  return { generateContent: async (params) => (await generateOn(deps, (b) => deps.models(b).generateContent(params))).res };
}

// One prompt cache per instance for the production clients (src/lib/agent/cache.ts).
const sharedCache = createPromptCache((b) => textGenAI(b).caches);

/** A cached call the backend refuses with these is retried inline once: nothing ran, so the retry is safe. */
const CACHE_REFUSED = [400, 403, 404];

/** Upstream messages can hold request data, so callers only ever see these fixed ones. */
function modelError(e: unknown): CommandError {
  if (e instanceof ApiError && e.status === 429) return new CommandError("RATE_LIMITED", "Please try again in a moment.");
  // HTTP 402: the Gemini API's prepaid credits are used up (seen 10-13, I-104).
  if (e instanceof ApiError && e.status === 402) console.error("gemini billing error (402)");
  else console.error("model error:", e instanceof ApiError ? `ApiError ${e.status}` : e instanceof Error ? e.name : typeof e);
  return new CommandError("UPSTREAM", "The assistant is not available right now. Please use the buttons or try again.");
}

/**
 * One client per chat request. Its first call picks the backend (auto: the API key, or Vertex after a fallback
 * or while the circuit is open); every later call stays there without fallback, because tools may already have
 * run, so a request never switches backends after a command was applied. `overrides` are for tests; production
 * builds the shared clients on first use, so a missing key is an UPSTREAM error.
 * `system` and `tools` must be the same for every order on a kiosk and locale (chatInstructions): they go into a
 * shared explicit cache when the backend allows one. Injected `models` get no cache unless one is injected too.
 */
export function geminiClient(overrides: Partial<TextDeps> & { cache?: PromptCache | null } = {}): ModelClient {
  const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";
  const cache = overrides.cache !== undefined ? overrides.cache : overrides.models ? null : sharedCache;
  let pinned: TextBackend | undefined;
  return {
    async generate({ system, contents, tools }) {
      const deps = { ...defaultTextDeps(), ...overrides };
      const config = {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Temperature stays the model default, as Google advises for Gemini 3.
        thinkingConfig: { thinkingLevel: thinkingLevel() },
      };
      // Gemini 3 returns thought signatures with function calls; the caller sends `content` back unchanged.
      const inline = { model, contents: contents as Content[], config: { systemInstruction: system, tools: tools as ToolListUnion, ...config } };
      const call = (backend: TextBackend) =>
        withDeadline(deps.deadlineMs, async (abortSignal) => {
          const models = deps.models(backend);
          const sent = { ...inline, config: { ...inline.config, abortSignal } };
          const name = cache ? await cache.get(backend, model, system, tools) : null;
          if (!name) return models.generateContent(sent);
          try {
            // A request that names a cache may not also set the instructions or tools.
            return await models.generateContent({ model, contents: contents as Content[], config: { cachedContent: name, ...config, abortSignal } });
          } catch (e) {
            if (!(e instanceof ApiError) || !CACHE_REFUSED.includes(e.status)) throw e;
            cache!.drop(name);
            console.error(`gemini cache refused (${e.status}), sent inline`);
            return models.generateContent(sent);
          }
        });
      let out;
      try {
        out = await generateOn(deps, call, pinned);
      } catch (e) {
        throw modelError(e);
      }
      const { res, backend } = out;
      pinned = backend;
      // A finished turn can come back with no parts at all (seen with gemini-3.8-flash after tool results).
      const reply = res.candidates?.[0]?.content;
      const content: ModelTurn = { ...reply, role: "model", parts: reply?.parts ?? [] };
      // Read parts directly: the SDK's `text` getter warns when a reply also holds function calls.
      const text = (content.parts as Part[])
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("");
      const functionCalls = (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? "", args: c.args ?? {} }));
      return { content, functionCalls, text, backend, usage: tokenUsage(res.usageMetadata) };
    },
  };
}
