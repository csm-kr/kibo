import type { FunctionCall } from "@google/genai";
import { agentAction, type AgentAction } from "@/lib/agent/actions";
import { toolCallToCommand, toolResult } from "@/lib/agent/mapping";
import { ApiError, type CommandReply } from "@/lib/client/api";
import { CommandError } from "@/lib/commands/errors";
import type { CommandType } from "@/lib/commands/schemas";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine } from "@/types/session";

// Runs Gemini Live tool calls against POST /api/command, which enforces every rule (ADR-003). The client only
// executes the calls the model made; it never adds, chains or confirms anything itself.

export interface VoiceCommand {
  /** `<liveSessionId>:<functionCallId>`, so a retried call is applied once. */
  commandId: string;
  type: CommandType;
  args: object;
  source: "voice";
  utteranceSeq: number;
  cartVersion?: number;
}

export interface ToolContext {
  liveSessionId: string;
  /** Finished user turns when the tool call arrived (turns.ts). */
  utteranceSeq: number;
  /** The cartVersion on the phone's screen, read when confirmCheckout runs. */
  cartVersion: () => number;
  kiosk: KioskData;
  locale: Locale;
  send(cmd: VoiceCommand): Promise<CommandReply>;
  /** The cart on the phone's screen, so a remove or update can name its line. */
  cart?: () => CartLine[];
  /** /demo: each call as ids and a result code, for "What the AI did". */
  onAction?(action: AgentAction): void;
}

export interface ToolResponse {
  id?: string;
  name: string;
  response: object;
}

type Outcome = Parameters<typeof toolResult>[2];

const INTERNAL = "Something went wrong. Please try again.";

async function runOne(call: FunctionCall, ctx: ToolContext): Promise<Outcome> {
  try {
    const cmd = toolCallToCommand(call.name ?? "", call.args);
    const reply = await ctx.send({
      // Live always sends an id; without one, a fresh id keeps two calls from being taken as one retry.
      commandId: `${ctx.liveSessionId}:${call.id ?? crypto.randomUUID()}`,
      ...cmd,
      source: "voice",
      utteranceSeq: ctx.utteranceSeq,
      ...(cmd.type === "confirmCheckout" ? { cartVersion: ctx.cartVersion() } : {}),
    });
    return { ok: true, response: { ok: true, ...reply } };
  } catch (e) {
    if (e instanceof CommandError || e instanceof ApiError) {
      return { ok: false, error: { code: e.code, message: e.message, detail: e.detail } };
    }
    return { ok: false, error: { code: "INTERNAL", message: INTERNAL } };
  }
}

/** One at a time and in order: "remove the cola, add a cider" must not race. */
export async function runToolCalls(calls: FunctionCall[], ctx: ToolContext): Promise<ToolResponse[]> {
  const out: ToolResponse[] = [];
  let cart = ctx.cart?.() ?? [];
  for (const call of calls) {
    const started = performance.now();
    const outcome = await runOne(call, ctx);
    ctx.onAction?.(agentAction(call.name ?? "", call.args, outcome, performance.now() - started, cart));
    if (outcome.ok) cart = outcome.response.cart;
    out.push({ ...(call.id ? { id: call.id } : {}), name: call.name ?? "", response: toolResult(ctx.kiosk, ctx.locale, outcome) });
  }
  return out;
}
