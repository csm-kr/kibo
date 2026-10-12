import { ApiError, type GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/errors";
import { geminiClient } from "./model";

const REQ = { system: "sys", contents: [{ role: "user" as const, parts: [{ text: "hi" }] }], tools: [] };

function fakeAi(generateContent: (req: unknown) => Promise<unknown>) {
  return { models: { generateContent } } as unknown as GoogleGenAI;
}

describe("geminiClient", () => {
  it("returns the model content unchanged, its function calls and only non-thought text", async () => {
    const content = {
      role: "model",
      parts: [
        { text: "thinking", thought: true },
        { functionCall: { id: "c1", name: "addToCart", args: { itemId: "cola" } }, thoughtSignature: "sig" },
        { text: "Added." },
      ],
    };
    const generate = vi.fn().mockResolvedValue({ candidates: [{ content }], functionCalls: [content.parts[1].functionCall] });
    const out = await geminiClient(fakeAi(generate)).generate(REQ);
    expect(out.content).toEqual(content);
    expect(out.content.parts).toBe(content.parts);
    expect(out.functionCalls).toEqual([{ id: "c1", name: "addToCart", args: { itemId: "cola" } }]);
    expect(out.text).toBe("Added.");
    const sent = generate.mock.calls[0][0];
    expect(sent.contents).toBe(REQ.contents);
    expect(sent.config.systemInstruction).toBe("sys");
    expect(sent.config.maxOutputTokens).toBeLessThanOrEqual(2048);
  });

  it("thinking level comes from GEMINI_TEXT_THINKING (default low); temperature stays the model default", async () => {
    const generate = vi.fn().mockResolvedValue({ candidates: [] });
    const saved = process.env.GEMINI_TEXT_THINKING;
    try {
      delete process.env.GEMINI_TEXT_THINKING;
      await geminiClient(fakeAi(generate)).generate(REQ);
      process.env.GEMINI_TEXT_THINKING = "high";
      await geminiClient(fakeAi(generate)).generate(REQ);
      process.env.GEMINI_TEXT_THINKING = "minimal";
      await geminiClient(fakeAi(generate)).generate(REQ);
    } finally {
      if (saved === undefined) delete process.env.GEMINI_TEXT_THINKING;
      else process.env.GEMINI_TEXT_THINKING = saved;
    }
    const configs = generate.mock.calls.map((c) => c[0].config);
    expect(configs.map((c) => c.thinkingConfig)).toEqual([{ thinkingLevel: "LOW" }, { thinkingLevel: "HIGH" }, { thinkingLevel: "LOW" }]);
    expect(configs[0]).not.toHaveProperty("temperature");
  });

  it("an empty answer is an empty model turn", async () => {
    const out = await geminiClient(fakeAi(async () => ({ candidates: [] }))).generate(REQ);
    expect(out).toEqual({ content: { role: "model", parts: [] }, functionCalls: [], text: "" });
  });

  it("a candidate whose content has no parts is an empty model turn", async () => {
    const out = await geminiClient(fakeAi(async () => ({ candidates: [{ content: { role: "model" } }] }))).generate(REQ);
    expect(out).toEqual({ content: { role: "model", parts: [] }, functionCalls: [], text: "" });
  });

  it("HTTP 429 → RATE_LIMITED; anything else → UPSTREAM; never the upstream message", async () => {
    const limited = geminiClient(fakeAi(async () => Promise.reject(new ApiError({ message: "quota secret", status: 429 }))));
    const err = await limited.generate(REQ).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ code: "RATE_LIMITED", message: "Please try again in a moment." });

    const broken = geminiClient(fakeAi(async () => Promise.reject(new Error("model said secret"))));
    const err2 = await broken.generate(REQ).catch((e) => e);
    expect(err2).toMatchObject({ code: "UPSTREAM" });
    expect(err2.message).not.toContain("secret");
  });

  it("without GEMINI_API_KEY the real client is UPSTREAM with the plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GEMINI_API_KEY", "");
    try {
      const err = await geminiClient().generate(REQ).catch((e) => e);
      expect(err).toBeInstanceOf(CommandError);
      expect(err).toMatchObject({
        code: "UPSTREAM",
        message: "The assistant is not available right now. Please use the buttons or try again.",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
