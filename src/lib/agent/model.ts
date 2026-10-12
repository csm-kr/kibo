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

// The text agent's model (ADR-011). Server only: GEMINI_API_KEY never leaves this module.
// Since 10-13 the text agent runs on Vertex AI (billed to the GCP account, credentials from the runtime
// service account or gcloud ADC); GEMINI_TEXT_BACKEND=api switches back to the Gemini API key for comparison.

export interface ModelTurn {
  role: "user" | "model";
  parts: unknown[];
}

export interface ModelClient {
  generate(req: { system: string; contents: ModelTurn[]; tools: object[] }): Promise<{
    content: ModelTurn;
    functionCalls: { id?: string; name: string; args: unknown }[];
    text: string;
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

export function textClientOptions(): GoogleGenAIOptions {
  if (process.env.GEMINI_TEXT_BACKEND === "api") {
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

let shared: { options: string; ai: GoogleGenAI } | null = null;

/** One client per configuration, so Vertex reuses its access token instead of fetching one per request. */
export function textGenAI(): GoogleGenAI {
  const options = textClientOptions();
  const key = JSON.stringify(options);
  if (shared?.options !== key) shared = { options: key, ai: new GoogleGenAI(options) };
  return shared.ai;
}

/** Upstream messages can hold request data, so callers only ever see these fixed ones. */
function modelError(e: unknown): CommandError {
  if (e instanceof ApiError && e.status === 429) return new CommandError("RATE_LIMITED", "Please try again in a moment.");
  // HTTP 402: the Gemini API's prepaid credits are used up (seen 10-13, I-104).
  if (e instanceof ApiError && e.status === 402) console.error("gemini billing error (402)");
  else console.error("model error:", e instanceof ApiError ? `ApiError ${e.status}` : e instanceof Error ? e.name : typeof e);
  return new CommandError("UPSTREAM", "The assistant is not available right now. Please use the buttons or try again.");
}

/** `ai` is injectable for tests; production gets the shared client on first use, so a missing key is an UPSTREAM error. */
export function geminiClient(ai?: Pick<GoogleGenAI, "models">): ModelClient {
  const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";
  return {
    async generate({ system, contents, tools }) {
      let res;
      try {
        ai ??= textGenAI();
        res = await ai.models.generateContent({
          model,
          // Gemini 3 returns thought signatures with function calls; the caller sends `content` back unchanged.
          contents: contents as Content[],
          config: {
            systemInstruction: system,
            tools: tools as ToolListUnion,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // Temperature stays the model default, as Google advises for Gemini 3.
            thinkingConfig: { thinkingLevel: thinkingLevel() },
          },
        });
      } catch (e) {
        throw modelError(e);
      }
      // A finished turn can come back with no parts at all (seen with gemini-3.8-flash after tool results).
      const reply = res.candidates?.[0]?.content;
      const content: ModelTurn = { ...reply, role: "model", parts: reply?.parts ?? [] };
      // Read parts directly: the SDK's `text` getter warns when a reply also holds function calls.
      const text = (content.parts as Part[])
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("");
      const functionCalls = (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? "", args: c.args ?? {} }));
      return { content, functionCalls, text };
    },
  };
}
