import type { FunctionCall } from "@google/genai";
import { agentAction, type AgentAction } from "@/lib/agent/actions";
import { KIOSK_BUSY, waitForBridge } from "@/lib/agent/bridgeWait";
import { toolCallToCommand, toolResult } from "@/lib/agent/mapping";
import { ApiError, type CommandReply } from "@/lib/client/api";
import { CommandError } from "@/lib/commands/errors";
import type { CommandType } from "@/lib/commands/schemas";
import type { KioskData, Locale } from "@/types/menu";
import type { CartLine, Session } from "@/types/session";

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
  /** The latest session from the stream; on a learned kiosk the next call waits for the bridge's replay (I-155). */
  session?: () => BridgeView | null;
}

export interface ToolResponse {
  id?: string;
  name: string;
  response: object;
}

type Outcome = Parameters<typeof toolResult>[2];

const INTERNAL = "Something went wrong. Please try again.";

// Live always sends an id; without one, a fresh id keeps two calls from being taken as one retry.
const commandIdOf = (call: FunctionCall, ctx: ToolContext) => `${ctx.liveSessionId}:${call.id ?? crypto.randomUUID()}`;

async function runOne(call: FunctionCall, commandId: string, ctx: ToolContext): Promise<Outcome> {
  try {
    const cmd = toolCallToCommand(call.name ?? "", call.args);
    const reply = await ctx.send({
      commandId,
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

type BridgeView = Pick<Session, "pendingBridgeCommand" | "bridgeStatus">;

/**
 * The phone's view of a replay it sent: done once the stream no longer shows it pending, after it either showed it
 * or a new bridge report (a newer bridgeStatus) arrived. An older snapshot, from before the command, never counts.
 */
function replayDone(view: () => BridgeView | null, commandId: string, statusAt: number | null) {
  let seen = false;
  return () => {
    const s = view();
    if (!s) return false;
    if (s.pendingBridgeCommand?.commandId === commandId) seen = true;
    if (s.pendingBridgeCommand) return false;
    return seen || (s.bridgeStatus?.at ?? null) !== statusAt;
  };
}

/** One at a time and in order: "remove the cola, add a cider" must not race. */
export async function runToolCalls(calls: FunctionCall[], ctx: ToolContext): Promise<ToolResponse[]> {
  const out: ToolResponse[] = [];
  let cart = ctx.cart?.() ?? [];
  // Learned kiosks: the next call waits for the replay of a pending change (I-155); after a wait ran out, the rest
  // of the batch is answered as busy instead of being sent.
  let replaying: (() => boolean) | null = null;
  let kioskStuck = false;
  for (const call of calls) {
    const started = performance.now();
    let outcome: Outcome;
    if (replaying && (kioskStuck || !(await waitForBridge(replaying)))) {
      kioskStuck = true;
      outcome = KIOSK_BUSY;
    } else {
      const statusAt = ctx.session?.()?.bridgeStatus?.at ?? null;
      const commandId = commandIdOf(call, ctx);
      outcome = await runOne(call, commandId, ctx);
      replaying = ctx.session && outcome.ok && outcome.response.pending ? replayDone(ctx.session, commandId, statusAt) : null;
    }
    ctx.onAction?.(agentAction(call.name ?? "", call.args, outcome, performance.now() - started, cart));
    if (outcome.ok) cart = outcome.response.cart;
    out.push({ ...(call.id ? { id: call.id } : {}), name: call.name ?? "", response: toolResult(ctx.kiosk, ctx.locale, outcome) });
  }
  return out;
}
