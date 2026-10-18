import { GoogleGenAI } from "@google/genai";
import { CommandError } from "@/lib/commands/errors";
import { BEFORE_PAYING } from "@/lib/commands/machine";
import { bumpSessionCounter } from "@/lib/session/service";
import { BUSY, issueLiveToken, KeyUnavailableError, liveTokenLimit, VOICE_UNAVAILABLE, type LiveTokenDeps } from "./live";

// Which way the phone's voice goes (ADR-012). GEMINI_LIVE_BACKEND=auto (default): a one-use token for Gemini Live
// on the API key, as measured (evidence/voice-e2e.json), while the key can still generate; when its prepaid
// credits are used up (HTTP 402, I-104) or it is missing, the phone connects to the Vertex AI Live relay
// (kibo-voice, VOICE_RELAY_URL), billed to the Cloud account. `api` and `vertex` pin one way. The relay counts
// the token budget itself (voice-relay/relay.ts), so the relay answer here counts nothing.

export type LiveBackend = "api" | "vertex";

export type LiveStart =
  | { mode: "direct"; token: string; model: string; expiresAt: number; voiceSeconds: number }
  | { mode: "relay"; url: string };

export function liveBackendSetting(): LiveBackend | "auto" {
  const v = process.env.GEMINI_LIVE_BACKEND;
  return v === "api" || v === "vertex" ? v : "auto";
}

/** VOICE_RELAY_URL, the `wss://` address of kibo-voice (`ws://` locally); anything else counts as not set. */
export function voiceRelayUrl(): string | null {
  const v = process.env.VOICE_RELAY_URL;
  if (!v) return null;
  try {
    const url = new URL(v);
    return url.protocol === "wss:" || url.protocol === "ws:" ? v : null;
  } catch {
    return null;
  }
}

/** The relay's GET /health on the same host. */
export function relayHealthUrl(relayUrl: string): string {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/health";
  url.search = "";
  return url.toString();
}

export interface KeyHealth {
  /** False when the key cannot generate (402, 429 or missing), from a cached probe. */
  usable(): Promise<boolean>;
  /** The token issuer saw a 402 or no key: down without another probe. */
  failed(): void;
}

const OK_MS = 60_000;
/** As long as the text agent skips the key after repeated 402s (src/lib/agent/model.ts). */
const DOWN_MS = 10 * 60_000;
const PROBE_TIMEOUT_MS = 5_000;

/** Ephemeral tokens are free and kept working with the credits used up (I-104), so the probe is one output token
 *  through generateContent on the key, like the deep health's keyGenerate. At most one probe a minute per instance;
 *  billing (402), a 429 (a spend cap or a used-up daily quota also answers 429 and holds for hours; one token a minute
 *  is never a burst) and a missing key mean down, other errors say nothing about billing. */
export function createKeyHealth(deps: { probe: () => Promise<unknown>; now: () => number; timeoutMs?: number }): KeyHealth {
  let state: { usable: boolean; until: number } | null = null;
  let running: Promise<boolean> | null = null;

  async function probe(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        deps.probe(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new DOMException("Probe timed out", "TimeoutError")), deps.timeoutMs ?? PROBE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (e) {
      const status = typeof e === "object" && e !== null && "status" in e ? e.status : undefined;
      const noKey = e instanceof Error && e.message === "GEMINI_API_KEY is not set";
      // Name and status only: upstream messages can carry request data.
      console.error("voice key probe:", `${e instanceof Error ? e.name : typeof e}${status === undefined ? "" : ` ${String(status)}`}`);
      return !(status === 402 || status === 429 || noKey);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    usable() {
      if (state && deps.now() < state.until) return Promise.resolve(state.usable);
      running ??= probe().then((usable) => {
        state = { usable, until: deps.now() + (usable ? OK_MS : DOWN_MS) };
        running = null;
        return usable;
      });
      return running;
    },
    failed() {
      state = { usable: false, until: deps.now() + DOWN_MS };
    },
  };
}

let shared: KeyHealth | null = null;

/** One per instance; the probe uses the text model on the key, as the deep health does. */
export function sharedKeyHealth(): KeyHealth {
  let ai: GoogleGenAI | null = null;
  return (shared ??= createKeyHealth({
    probe: async () => {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
      ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      return ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash",
        contents: "Reply with OK",
        config: { maxOutputTokens: 1 },
      });
    },
    now: Date.now,
  }));
}

export interface LiveStartDeps extends LiveTokenDeps {
  backend: LiveBackend | "auto";
  relayUrl: string | null;
  key: KeyHealth;
}

export async function startLiveVoice(
  deps: LiveStartDeps,
  input: Parameters<typeof issueLiveToken>[1],
): Promise<LiveStart> {
  const { backend, relayUrl } = deps;

  async function relay(url: string): Promise<LiveStart> {
    // The relay checks and counts again when the phone connects; checking here gives the phone the same refusals
    // over HTTP before it opens a socket, and keeps a spent session from being sent on.
    const known = await deps.store.get(input.sessionId);
    if (!known) throw new CommandError("NOT_FOUND", "This order could not be found.");
    const { allowed } = await bumpSessionCounter(
      deps.store,
      {
        sessionId: input.sessionId,
        bearer: input.bearer,
        field: "liveTokenCount",
        limit: liveTokenLimit(known.demo),
        states: BEFORE_PAYING,
        checkOnly: true,
      },
      deps.now(),
    );
    if (!allowed) throw new CommandError("RATE_LIMITED", BUSY);
    return { mode: "relay", url };
  }

  if (backend === "vertex") {
    if (!relayUrl) throw new CommandError("UPSTREAM", VOICE_UNAVAILABLE);
    return relay(relayUrl);
  }
  // Without a relay there is nothing to fall back to, so the key is not probed.
  const canFallBack = backend === "auto" && relayUrl !== null;
  if (canFallBack && !(await deps.key.usable())) return relay(relayUrl);
  try {
    return { mode: "direct", ...(await issueLiveToken(deps, input)) };
  } catch (e) {
    // issueLiveToken has given every count back.
    if (!canFallBack || !(e instanceof KeyUnavailableError)) throw e;
    deps.key.failed();
    return relay(relayUrl);
  }
}
