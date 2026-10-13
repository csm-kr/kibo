import { ApiError, EndSensitivity, GoogleGenAI, Modality, type ToolListUnion } from "@google/genai";
import { z } from "zod";
import { getKiosk } from "@/lib/adapters/catalog";
import { CommandError } from "@/lib/commands/errors";
import { BEFORE_PAYING } from "@/lib/commands/machine";
import { sessionId } from "@/lib/commands/schemas";
import { kstDay, type UsageStore } from "@/lib/limits/usage";
import { bumpSessionCounter } from "@/lib/session/service";
import type { SessionStore } from "@/lib/store/types";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine, DineOption, SessionStatus } from "@/types/session";
import { buildInstructions } from "./instructions";
import { toolDeclarations } from "./tools";

// Ephemeral Gemini Live tokens (ADR-003). The phone connects to Gemini directly; the token pins the model,
// instructions and tools, so the browser never sees GEMINI_API_KEY or the instructions.

export const liveTokenRequest = z.strictObject({ sessionId, locale: z.enum(["ko", "en"]) });

export interface LiveTokenIssuer {
  create(input: {
    model: string;
    system: string;
    tools: object[];
    languageCode: string;
    expireTime: string;
    newSessionExpireTime: string;
  }): Promise<{ name: string }>;
}

export interface LiveTokenDeps {
  store: SessionStore;
  usage: UsageStore;
  issuer: LiveTokenIssuer;
  now: () => number;
}

/** /demo gets 2 tokens and 3 min of voice; a phone gets more tokens because every reconnect needs one. */
const SESSION_LIMIT = 6;
const DEMO_SESSION_LIMIT = 2;
const DAILY_LIMIT = 200;
const VOICE_SECONDS = 600;
const DEMO_VOICE_SECONDS = 180;
/** The phone connects right after it gets the token. */
const NEW_SESSION_MS = 60_000;
const BUSY = "Voice is busy right now. Please type instead.";
const LANGUAGE_CODES: Record<Locale, string> = { ko: "ko-KR", en: "en-US" };
/** End of speech after 700 ms of silence: short answers ("네") sometimes waited 3.5–8.9 s with the default
 *  (spikes/voice-compare/RESULTS.md); not shorter, so slow speakers' pauses do not end their turn. */
const SILENCE_MS = 700;

function tokenError(e: unknown): CommandError {
  if (e instanceof ApiError && e.status === 429) return new CommandError("RATE_LIMITED", BUSY);
  // Status or name only: the upstream message can echo the request. HTTP 402: the key's prepaid credits are used up.
  if (e instanceof ApiError && e.status === 402) console.error("gemini billing error (402)");
  else console.error("live token error:", e instanceof ApiError ? `ApiError ${e.status}` : e instanceof Error ? e.name : typeof e);
  return new CommandError("UPSTREAM", "Voice is not available right now. Please type instead.");
}

/** The Live session config the token pins; scripts/measure-cost.ts connects with the same one. */
export function liveConnectConfig(system: string, tools: object[], languageCode: string) {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: system,
    tools: tools as ToolListUnion,
    // The phone shows what it heard and what the AI said. Without a language, short Korean answers
    // ("네") came back empty or in another language and menu names were misheard in noise (voice-compare).
    inputAudioTranscription: { languageCodes: [languageCode] },
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: { endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: SILENCE_MS },
    },
  };
}

/** `ai` is injectable for tests; production builds the client on first use, so a missing key is an UPSTREAM error. */
export function geminiTokenIssuer(ai?: Pick<GoogleGenAI, "authTokens">): LiveTokenIssuer {
  return {
    async create({ model, system, tools, languageCode, expireTime, newSessionExpireTime }) {
      let token;
      try {
        // Ephemeral tokens exist only in v1alpha.
        ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
        token = await ai.authTokens.create({
          config: {
            uses: 1,
            expireTime,
            newSessionExpireTime,
            // With constraints and no lockAdditionalFields, the browser cannot change any LiveConnectConfig field.
            liveConnectConstraints: { model, config: liveConnectConfig(system, tools, languageCode) },
            httpOptions: { apiVersion: "v1alpha" },
          },
        });
      } catch (e) {
        throw tokenError(e);
      }
      if (!token.name) throw tokenError(new Error("no token name"));
      return { name: token.name };
    },
  };
}

export function liveConfig(
  kiosk: KioskData,
  opts: { cart: CartLine[]; status: SessionStatus; dineOption: DineOption | null; locale: Locale },
): { model: string; system: string; tools: object[]; languageCode: string } {
  return {
    model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
    // The current cart is in the instructions, marked already applied, so a reconnect does not add it again.
    system: buildInstructions(kiosk, opts),
    tools: [{ functionDeclarations: toolDeclarations(kiosk) }],
    languageCode: LANGUAGE_CODES[opts.locale],
  };
}

export async function issueLiveToken(
  deps: LiveTokenDeps,
  input: { sessionId: string; bearer: string | null; locale: Locale },
): Promise<{ token: string; model: string; expiresAt: number; voiceSeconds: number }> {
  const { store, usage, issuer, now } = deps;
  const known = await store.get(input.sessionId);
  if (!known) throw new CommandError("NOT_FOUND", "This order could not be found.");
  // Checks the device token and expiry, then counts the token in sessionSecrets.
  const { allowed, session } = await bumpSessionCounter(
    store,
    { sessionId: input.sessionId, bearer: input.bearer, field: "liveTokenCount", limit: known.demo ? DEMO_SESSION_LIMIT : SESSION_LIMIT },
    now(),
  );
  if (!BEFORE_PAYING.includes(session.status)) throw new CommandError("CONFLICT", "The order can no longer be changed.");
  if (!allowed || !(await usage.bump(kstDay(now()), "voiceSessions", DAILY_LIMIT))) {
    throw new CommandError("RATE_LIMITED", BUSY);
  }

  const voiceSeconds = session.demo ? DEMO_VOICE_SECONDS : VOICE_SECONDS;
  const t = now();
  const expiresAt = t + voiceSeconds * 1000;
  const config = liveConfig(getKiosk(session.kioskId), {
    cart: session.cart,
    status: session.status,
    dineOption: session.dineOption,
    locale: input.locale,
  });
  const { name } = await issuer.create({
    ...config,
    expireTime: new Date(expiresAt).toISOString(),
    newSessionExpireTime: new Date(t + NEW_SESSION_MS).toISOString(),
  });
  return { token: name, model: config.model, expiresAt, voiceSeconds };
}
