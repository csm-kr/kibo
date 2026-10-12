import { ApiError, GoogleGenAI, type Content, type Part, type ToolListUnion } from "@google/genai";
import { CommandError } from "@/lib/commands/errors";

// The text agent's model (ADR-011). Server only: GEMINI_API_KEY never leaves this module.

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

/** Upstream messages can hold request data, so callers only ever see these fixed ones. */
function modelError(e: unknown): CommandError {
  if (e instanceof ApiError && e.status === 429) return new CommandError("RATE_LIMITED", "Please try again in a moment.");
  console.error("model error:", e instanceof ApiError ? `ApiError ${e.status}` : e instanceof Error ? e.name : typeof e);
  return new CommandError("UPSTREAM", "The assistant is not available right now. Please use the buttons or try again.");
}

/** `ai` is injectable for tests; production builds the client on first use, so a missing key is an UPSTREAM error. */
export function geminiClient(ai?: Pick<GoogleGenAI, "models">): ModelClient {
  const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash";
  return {
    async generate({ system, contents, tools }) {
      let res;
      try {
        ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        res = await ai.models.generateContent({
          model,
          // Gemini 3 returns thought signatures with function calls; the caller sends `content` back unchanged.
          contents: contents as Content[],
          config: {
            systemInstruction: system,
            tools: tools as ToolListUnion,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.2,
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
